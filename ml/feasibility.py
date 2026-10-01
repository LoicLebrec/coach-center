#!/usr/bin/env python3
"""Feasibility: does block composition predict power-curve change?

Unit = 4-week training block per athlete, sliding weekly.
  features  → what the block contained (load, zone mix, ramp, monotony, rest)
  outcome   → Δ log best power (5s/1m/5m/20m): best in the 3 weeks after the
              block vs best in the 6 weeks before it
  controls  → starting fitness (CTL), how hard the athlete tested before/after
              (number of hard rides), season, level vs own career best

Test: grouped-by-athlete CV. Compare a controls-only model with
controls + block composition. The gain in R² is the "signal".
Coefficients are within-athlete (athlete means removed) so they read as
"for a given rider, more X in a block → more/less progress".

Usage: .venv/bin/python feasibility.py  → reports/feasibility.md
"""
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).parent
DATA = ROOT / 'data' / 'gc'
REPORT = ROOT / 'reports' / 'feasibility.md'

BLOCK_DAYS, PRE_DAYS, POST_DAYS = 28, 42, 21
DURATIONS = {'5s': '5s_critical_power', '1m': '1m_critical_power',
             '5m': '5m_critical_power', '20m': '20m_critical_power'}
MIN_SPAN_DAYS, MIN_RIDES = 540, 200
# Strength sessions are logged under many free-text sport labels (EN/DE).
STRENGTH = {'weighttraining', 'weightlifting', 'weights', 'strength', 'gym', 'gym: strength',
            'crossfit', 'core', 'stabi', 'kraft', 'krafttraining', 'kraft-koordination'}


# ─── Load ────────────────────────────────────────────────────

def load_rides():
    files = sorted(DATA.glob('*.parquet'))
    df = pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)
    df['day'] = pd.to_datetime(df.date.str[:10].str.replace('/', '-'), errors='coerce')
    st = df[df.sport.fillna('').str.strip().str.lower().isin(STRENGTH)]
    st = st[pd.to_numeric(st.workout_time, errors='coerce').fillna(0) >= 600]
    strength = st.dropna(subset=['day']).groupby(['athlete_id', 'day']).size().rename('strength')
    df = df[df.sport.isin(['Bike', 'VirtualRide', 'Ride'])].copy()
    df = df.dropna(subset=['day', 'coggan_tss'])
    df = df[(df.coggan_tss > 0) & (df.coggan_tss < 600) & (df.time_riding > 600)]
    # Implausible power (bad meters / wrong units) out.
    df = df[df['20m_critical_power'].between(60, 550) | df['20m_critical_power'].isna()]
    df = df[df['5s_critical_power'].between(150, 2500) | df['5s_critical_power'].isna()]
    return df, strength, len(files)


def eligible(df):
    g = df.groupby('athlete_id').agg(n=('day', 'size'), first=('day', 'min'), last=('day', 'max'))
    ok = g[(g.n >= MIN_RIDES) & ((g['last'] - g['first']).dt.days >= MIN_SPAN_DAYS)].index
    return df[df.athlete_id.isin(ok)]


# ─── Daily series per athlete ────────────────────────────────

ZONES = {  # Coggan zones → coarse buckets
    'z12': ['time_in_zone_L1', 'time_in_zone_L2'],
    'z3': ['time_in_zone_L3'],
    'z4': ['time_in_zone_L4'],
    'z5': ['time_in_zone_L5'],
    'z67': ['time_in_zone_L6', 'time_in_zone_L7'],
}


def daily(rides, strength):
    agg = {'coggan_tss': 'sum', 'time_riding': 'sum', 'coggan_if': 'max'}
    agg.update({c: 'sum' for cols in ZONES.values() for c in cols})
    agg.update({c: 'max' for c in DURATIONS.values()})
    d = rides.groupby('day').agg(agg)
    d['hard'] = (d.coggan_if >= 0.85).astype(int)
    idx = pd.date_range(d.index.min(), d.index.max(), freq='D')
    d = d.reindex(idx)
    d['strength'] = strength.reindex(idx)
    fill0 = ['coggan_tss', 'time_riding', 'hard', 'strength'] + [c for cols in ZONES.values() for c in cols]
    d[fill0] = d[fill0].fillna(0)
    d['ctl'] = d.coggan_tss.ewm(alpha=1 / 42, adjust=False).mean()
    return d


# ─── Windows ─────────────────────────────────────────────────

def windows_for(athlete, d):
    rows = []
    career = {k: d[c].max() for k, c in DURATIONS.items()}
    starts = d.index[PRE_DAYS::7]
    for s in starts:
        pre = d.loc[s - pd.Timedelta(days=PRE_DAYS): s - pd.Timedelta(days=1)]
        blk = d.loc[s: s + pd.Timedelta(days=BLOCK_DAYS - 1)]
        post = d.loc[s + pd.Timedelta(days=BLOCK_DAYS): s + pd.Timedelta(days=BLOCK_DAYS + POST_DAYS - 1)]
        if len(blk) < BLOCK_DAYS or len(post) < POST_DAYS:
            break
        hours = blk.time_riding.sum() / 3600
        if hours < 8:  # off-season / injury gaps are not training blocks
            continue
        weekly_tss = blk.coggan_tss.values.reshape(4, 7).sum(axis=1)
        zt = {z: blk[cols].sum().sum() / 3600 for z, cols in ZONES.items()}
        row = {
            'athlete_id': athlete, 'start': s,
            # block composition
            'hours_wk': hours / 4,
            'tss_wk': weekly_tss.mean(),
            **{f'{z}_h_wk': h / 4 for z, h in zt.items()},
            'ramp': (weekly_tss[2:].sum() - weekly_tss[:2].sum()) / max(weekly_tss.sum(), 1),
            'recovery_wk': float(weekly_tss.min() < 0.6 * weekly_tss.mean()),
            'monotony': blk.coggan_tss.mean() / (blk.coggan_tss.std() + 1e-6),
            'rest_days': (blk.time_riding == 0).sum(),
            'hard_days': blk.hard.sum(),
            'strength_wk': blk.strength.sum() / 4,
            # controls
            'ctl0': pre.ctl.iloc[-1] if len(pre) else np.nan,
            'hard_pre': pre.hard.sum(),
            'hard_post': post.hard.sum(),
            'month_sin': np.sin(2 * np.pi * s.month / 12),
            'month_cos': np.cos(2 * np.pi * s.month / 12),
        }
        for k, c in DURATIONS.items():
            p0, p1 = pre[c].max(), post[c].max()
            row[f'y_{k}'] = np.log(p1 / p0) if p0 > 0 and p1 > 0 else np.nan
            row[f'lvl_{k}'] = np.log(p0 / career[k]) if p0 > 0 and career[k] > 0 else np.nan
        rows.append(row)
    return rows


# ─── Model ───────────────────────────────────────────────────

BLOCK = ['hours_wk', 'tss_wk', 'z12_h_wk', 'z3_h_wk', 'z4_h_wk', 'z5_h_wk', 'z67_h_wk',
         'ramp', 'recovery_wk', 'monotony', 'rest_days', 'hard_days', 'strength_wk']
CONTROLS = ['ctl0', 'hard_pre', 'hard_post', 'month_sin', 'month_cos']


def demean(df, cols):
    return df[cols] - df.groupby('athlete_id')[cols].transform('mean')


def cv_r2(X, y, groups):
    pred = np.zeros(len(y))
    for tr, te in GroupKFold(5).split(X, y, groups):
        m = make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-2, 4, 20)))
        m.fit(X.iloc[tr], y.iloc[tr])
        pred[te] = m.predict(X.iloc[te])
    return 1 - ((y - pred) ** 2).sum() / ((y - y.mean()) ** 2).sum()


def analyse(w, key):
    y_col, lvl = f'y_{key}', f'lvl_{key}'
    sub = w.dropna(subset=[y_col, lvl, 'ctl0']).copy()
    sub = sub[sub[y_col].abs() < 0.4]  # >±40 % in 9 weeks = data glitch
    ctrl = CONTROLS + [lvl]
    feats = ctrl + BLOCK
    X = demean(sub, feats)
    y = sub[y_col] - sub.groupby('athlete_id')[y_col].transform('mean')
    g = sub.athlete_id
    r2_ctrl = cv_r2(X[ctrl], y, g)
    r2_full = cv_r2(X[feats], y, g)

    # Standardised within-athlete effects + athlete-bootstrap CI
    def fit_coefs(idx):
        s = StandardScaler().fit(X.loc[idx, feats])
        m = RidgeCV(alphas=np.logspace(-2, 4, 20)).fit(s.transform(X.loc[idx, feats]), y.loc[idx])
        return pd.Series(m.coef_, index=feats)

    coefs = fit_coefs(sub.index)
    rows_of = {a: idx.values for a, idx in sub.groupby('athlete_id').groups.items()}
    athletes = list(rows_of)
    rng = np.random.default_rng(0)
    boots = []
    for _ in range(100):
        pick = rng.choice(len(athletes), len(athletes), replace=True)
        idx = np.concatenate([rows_of[athletes[i]] for i in pick])
        boots.append(fit_coefs(pd.Index(idx)).values)
    boots = np.array(boots)
    ci = pd.DataFrame({'effect_%': coefs * 100,
                       'lo': np.percentile(boots, 2.5, axis=0) * 100,
                       'hi': np.percentile(boots, 97.5, axis=0) * 100}, index=feats)
    return {'n': len(sub), 'athletes': g.nunique(), 'r2_ctrl': r2_ctrl, 'r2_full': r2_full,
            'coefs': ci.loc[BLOCK]}


def main():
    rides, strength, n_files = load_rides()
    rides = eligible(rides)
    print(f'{rides.athlete_id.nunique()} eligible athletes / {n_files} downloaded, {len(rides)} rides')
    no_strength = pd.Series(dtype=float, index=pd.DatetimeIndex([]))
    rows = []
    for a, r in rides.groupby('athlete_id'):
        s = strength.loc[a] if a in strength.index.get_level_values(0) else no_strength
        rows += windows_for(a, daily(r, s))
    w = pd.DataFrame(rows)
    w.to_parquet(ROOT / 'data' / 'windows.parquet', index=False)
    print(f'{len(w)} blocks')
    n_str = w[w.strength_wk > 0].athlete_id.nunique()

    out = ['# Feasibility — block composition → power-curve change', '',
           f'GoldenCheetah OpenData: {n_files} athletes downloaded, '
           f'{rides.athlete_id.nunique()} eligible (≥{MIN_RIDES} rides over ≥{MIN_SPAN_DAYS} days), '
           f'{len(w)} four-week blocks.', '',
           f'Strength: {n_str} eligible athletes log strength sessions; {(w.strength_wk > 0).mean():.1%} of blocks '
           'contain any. Athletes who never log it add no within-athlete variance to `strength_wk`, '
           'so its effect is estimated from loggers only (unlogged sessions bias it toward 0).', '',
           'R² = share of within-athlete variance in power change explained on **held-out athletes**.',
           '"Gain" = what block composition adds beyond controls (fitness, testing, season, level).', '',
           '| Duration | Blocks | Athletes | R² controls | R² + block | Gain |', '|---|---|---|---|---|---|']
    results = {}
    for key in DURATIONS:
        res = analyse(w, key)
        results[key] = res
        out.append(f"| {key} | {res['n']} | {res['athletes']} | {res['r2_ctrl']:.3f} | "
                   f"{res['r2_full']:.3f} | **{res['r2_full'] - res['r2_ctrl']:+.3f}** |")
        print(key, res['r2_ctrl'], res['r2_full'])
    out += ['', '## Effects (within-athlete, per +1 SD of the feature, % change in best power)',
            'CI = 95 % athlete bootstrap. Bold = CI excludes 0.', '']
    for key, res in results.items():
        out += [f'### {key}', '', '| Feature | Effect % | 95 % CI |', '|---|---|---|']
        for f, r in res['coefs'].sort_values('effect_%', key=abs, ascending=False).iterrows():
            sig = r.lo > 0 or r.hi < 0
            e = f"{r['effect_%']:+.2f}"
            out.append(f"| {f} | {'**' + e + '**' if sig else e} | [{r.lo:+.2f}, {r.hi:+.2f}] |")
        out.append('')
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text('\n'.join(out))
    print(f'report → {REPORT}')


if __name__ == '__main__':
    main()
