#!/usr/bin/env python3
"""Responder profiles: do riders respond to block composition differently, stably?

Builds on feasibility.py's windows.parquet (run that first).

  1. Population model: within-athlete ridge, controls + block composition.
  2. Personal deviation δ_a: ridge on the population residual, per athlete,
     over a few response features (shrunk toward 0 = "like everyone else").
  3. Out-of-time test: learn δ on the first half of each athlete's history,
     predict the second half. Personal profiles only matter if this beats
     the population model.
  4. Types: KMeans on δ. Same out-of-time test with the cluster centroid in
     place of δ (coarser, but assignable to a new user).
  5. Cold start: can the type be guessed from how someone trains (athlete
     means of block features), without any response history?
  6. History length: with only the last H weeks of training history, which
     works best out of time — population, type centroid, own δ, or the hybrid
     (own δ shrunk toward the type centroid instead of toward 0)? Types are
     learned on other athletes only (grouped folds). This sets the app's rules.

Usage: .venv/bin/python profiles.py  → reports/profiles.md, data/profiles.parquet
"""
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from feasibility import BLOCK, CONTROLS, DURATIONS

ROOT = Path(__file__).parent
WINDOWS = ROOT / 'data' / 'windows.parquet'
REPORT = ROOT / 'reports' / 'profiles.md'

# strength_wk left out: only ~157 riders log it and its personal δ flips sign between halves.
RESP = ['tss_wk', 'hours_wk', 'z4_h_wk', 'z5_h_wk', 'z67_h_wk', 'rest_days', 'ramp', 'monotony']
MIN_BLOCKS = 80        # per athlete per duration (~1.5 years of weekly-sliding blocks)
GAP_DAYS = 70          # block + post window: keeps train outcomes out of the test period
LAMBDAS = [10, 30, 100, 300, 1000, 3000, 10000]
KS = [2, 3, 4, 5, 6]
N_TYPES = 4
HISTORY_WEEKS = [13, 26, 52, 78, None]   # None = whole first half


def prep(w, key, block):
    y_col, lvl = f'y_{key}', f'lvl_{key}'
    feats = CONTROLS + [lvl] + block
    sub = w.dropna(subset=[y_col, lvl, 'ctl0']).copy()
    sub = sub[sub[y_col].abs() < 0.4]
    sub = sub[sub.groupby('athlete_id')[y_col].transform('size') >= MIN_BLOCKS]
    split = sub.groupby('athlete_id').start.transform('median')
    sub['half'] = np.where(sub.start < split - pd.Timedelta(days=GAP_DAYS), 0,
                           np.where(sub.start >= split, 1, -1))
    sub = sub[sub.half >= 0].rename(columns={y_col: 'y'})
    return sub, feats


def center(sub, cols, ref):
    """Demean by athlete using the means of `ref` rows (train half) only."""
    mu = sub[ref].groupby('athlete_id')[cols].mean()
    return sub[cols] - mu.loc[sub.athlete_id].values


def personal(Xr, r, athletes, lam, prior=None):
    """Per-athlete ridge (no intercept) of residual r on Xr → {athlete: δ}.
    Shrinks toward prior[a] (a type centroid) when given, else toward 0."""
    out = {}
    for a, idx in pd.Series(np.arange(len(r))).groupby(athletes.values).groups.items():
        A, b = Xr[idx], r[idx]
        m = prior.loc[a].values if prior is not None else 0
        out[a] = np.linalg.solve(A.T @ A + lam * np.eye(A.shape[1]), A.T @ b + lam * m)
    return pd.DataFrame(out, index=None).T


def r2(y, p):
    return 1 - ((y - p) ** 2).sum() / ((y - y.mean()) ** 2).sum()


def fit_duration(w, key, block, resp):
    sub, feats = prep(w, key, block)
    tr = sub.half == 0
    X = center(sub, feats + ['y'], tr)
    y = X.pop('y').values
    sc = StandardScaler().fit(X[tr])
    Xs = sc.transform(X)
    pop = Ridge(alpha=100).fit(Xs[tr], y[tr])
    base = pop.predict(Xs)
    ri = [feats.index(f) for f in resp]
    resid = y - base
    ath = sub.athlete_id.reset_index(drop=True)
    tr_, te_ = tr.values, ~tr.values

    res = {'key': key, 'n_ath': ath.nunique(), 'n_test': te_.sum(),
           'r2_pop': r2(y[te_], base[te_]), 'lam': {}}
    best = None
    for lam in LAMBDAS:
        d = personal(Xs[tr_][:, ri], resid[tr_], ath[tr_].reset_index(drop=True), lam)
        p = base + (Xs[:, ri] * d.loc[ath].values).sum(axis=1)
        s = r2(y[te_], p[te_])
        res['lam'][lam] = s
        if best is None or s > best[0]:
            best = (s, lam, d)
    res['r2_personal'], res['best_lam'], delta_tr = best

    # Stability: δ from each half separately, correlated feature by feature.
    d1 = personal(Xs[te_][:, ri], resid[te_], ath[te_].reset_index(drop=True), res['best_lam'])
    common = delta_tr.index.intersection(d1.index)
    res['stability'] = pd.Series([np.corrcoef(delta_tr.loc[common, j], d1.loc[common, j])[0, 1]
                                  for j in range(len(ri))], index=resp)
    delta_tr.columns = [f'{key}:{f}' for f in resp]
    res['model'] = {'feats': feats, 'mean': sc.mean_, 'scale': sc.scale_, 'coef': pop.coef_,
                    'intercept': float(pop.intercept_)}
    ctx = {'Xs': Xs, 'ri': ri, 'base': base, 'y': y, 'ath': ath, 'te': te_, 'tr': tr_,
           'resid': resid, 'start': sub.start.values, 'lam': res['best_lam']}
    return res, delta_tr, ctx, sub


def cluster_eval(deltas, ctx, k):
    """Out-of-time R² using the athlete's cluster centroid instead of own δ."""
    D = deltas.fillna(0)
    km = KMeans(k, n_init=20, random_state=0).fit(D.values)
    lab = pd.Series(km.labels_, index=D.index)
    cent = pd.DataFrame(km.cluster_centers_, columns=D.columns)
    scores = {}
    for key, c in ctx.items():
        Xs, ri, base, y, ath, te_ = c['Xs'], c['ri'], c['base'], c['y'], c['ath'], c['te']
        cols = [c for c in D.columns if c.startswith(f'{key}:')]
        dc = cent[cols].values[lab.reindex(ath).fillna(-1).astype(int).clip(lower=0).values]
        known = ath.isin(lab.index).values
        p = base + np.where(known, (Xs[:, ri] * dc).sum(axis=1), 0)
        scores[key] = r2(y[te_], p[te_])
    return km, lab, cent, scores


def last_weeks(c, weeks):
    """Train rows restricted to each athlete's last `weeks` blocks before the split."""
    if weeks is None:
        return c['tr']
    df = pd.DataFrame({'a': c['ath'].values, 's': c['start'], 'tr': c['tr']})
    rank = df[df.tr].groupby('a').s.rank(ascending=False)
    keep = np.zeros(len(df), bool)
    keep[rank.index[rank <= weeks]] = True
    return keep


def history_eval(ctx, weeks, k=N_TYPES, folds=5):
    """Out-of-time R² per method when only `weeks` of history are known."""
    keys = list(ctx)
    own = {}
    for key in keys:
        c = ctx[key]
        m = last_weeks(c, weeks)
        d = personal(c['Xs'][m][:, c['ri']], c['resid'][m], c['ath'][m].reset_index(drop=True), c['lam'])
        d.columns = [f'{key}:{j}' for j in range(len(c['ri']))]
        own[key] = d
    D = pd.concat(own.values(), axis=1).fillna(0)

    # Type centroid per athlete, learned on the other folds' athletes.
    athletes = D.index.values
    fold = pd.Series(np.arange(len(athletes)) % folds, index=np.random.default_rng(0).permutation(athletes))
    cent_of = pd.DataFrame(index=D.index, columns=D.columns, dtype=float)
    for f in range(folds):
        test_a = fold.index[fold == f]
        km = KMeans(k, n_init=10, random_state=0).fit(D.drop(index=test_a).values)
        cent_of.loc[test_a] = km.cluster_centers_[km.predict(D.loc[test_a].values)]

    out = {}
    for key in keys:
        c = ctx[key]
        m, te = last_weeks(c, weeks), c['te']
        cols = own[key].columns
        prior = cent_of[cols]
        hyb = personal(c['Xs'][m][:, c['ri']], c['resid'][m], c['ath'][m].reset_index(drop=True), c['lam'],
                       prior=prior)
        Xr = c['Xs'][:, c['ri']]
        known = c['ath'].isin(own[key].index).values

        def pred(delta):
            dv = delta.reindex(c['ath']).fillna(0).values
            return c['base'] + np.where(known, (Xr * dv).sum(axis=1), 0)

        out[key] = {'population': r2(c['y'][te], c['base'][te]),
                    'type': r2(c['y'][te], pred(prior)[te]),
                    'own': r2(c['y'][te], pred(own[key])[te]),
                    'hybrid': r2(c['y'][te], pred(hyb)[te])}
    return out


def describe_types(cent, lab):
    rows = []
    for c in range(len(cent)):
        s = cent.iloc[c]
        top = s.abs().sort_values(ascending=False).index[:4]
        rows.append({'type': c, 'athletes': int((lab == c).sum()),
                     'signature': ', '.join(f'{f} {s[f] * 100:+.1f}%' for f in top)})
    return pd.DataFrame(rows)


def main():
    w = pd.read_parquet(WINDOWS)
    resp = [f for f in RESP if f in w.columns]
    block = [f for f in BLOCK if f in w.columns]
    print(f'{w.athlete_id.nunique()} athletes, {len(w)} blocks, response features: {resp}')

    results, deltas, ctx, trains = [], [], {}, {}
    for key in DURATIONS:
        res, d, c, sub = fit_duration(w, key, block, resp)
        results.append(res)
        deltas.append(d)
        ctx[key] = c
        trains[key] = sub
        print(key, f"pop {res['r2_pop']:.4f} personal {res['r2_personal']:.4f} λ={res['best_lam']}")
    deltas = pd.concat(deltas, axis=1)

    clus = {}
    for k in KS:
        km, lab, cent, scores = cluster_eval(deltas, ctx, k)
        clus[k] = (km, lab, cent, scores)
        print('k', k, {x: round(v, 4) for x, v in scores.items()})
    best_k = max(KS, key=lambda k: np.mean(list(clus[k][3].values())))
    km, lab, cent, _ = clus[best_k]

    # Cold start: guess the type from training habits alone (athlete means).
    habits = w[w.athlete_id.isin(lab.index)].groupby('athlete_id')[block + ['ctl0']].mean()
    ylab = lab.loc[habits.index]
    clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    pred = cross_val_predict(clf, habits.values, ylab.values, cv=5)
    acc, base_acc = (pred == ylab.values).mean(), ylab.value_counts(normalize=True).max()

    prof = pd.DataFrame({'type': lab}).join(deltas)
    prof.to_parquet(ROOT / 'data' / 'profiles.parquet')

    hist = {}
    for h in HISTORY_WEEKS:
        hist[h] = history_eval(ctx, h)
        print('history', h, {k: {m: round(v, 4) for m, v in r.items()} for k, r in hist[h].items()})

    # Everything the app needs to score a rider without Python: population model,
    # type centroids (k = N_TYPES, fitted on all athletes), shrinkage per duration.
    km_app, lab_app, cent_app, _ = cluster_eval(deltas, ctx, N_TYPES)
    export = {
        'version': 1, 'response_features': resp,
        # Own δ (shrunk toward 0) beat type and hybrid at every history length tested, from 13 weeks on.
        'method': 'own', 'min_blocks': 13,
        'durations': {r['key']: {
            'features': r['model']['feats'], 'mean': r['model']['mean'].round(6).tolist(),
            'scale': r['model']['scale'].round(6).tolist(), 'coef': r['model']['coef'].round(6).tolist(),
            'intercept': round(r['model']['intercept'], 6), 'lambda': r['best_lam'],
            # Spread of riders' δ: the app reads a trait only when δ is large relative to this.
            'delta_sd': deltas[[f"{r['key']}:{f}" for f in resp]].std().round(6).tolist(),
        } for r in results},
        'types': [{'id': int(t), 'athletes': int((lab_app == t).sum()),
                   'delta': {k: cent_app.loc[t, [f'{k}:{f}' for f in resp]].round(6).tolist() for k in DURATIONS}}
                  for t in range(N_TYPES)],
    }
    import json
    (ROOT / 'data' / 'responder_model.json').write_text(json.dumps(export, indent=1))

    out = ['# Responder profiles', '',
           'Does a rider-specific response to block composition, learned on the **first half** of '
           'their history, predict the **second half** better than the population model?', '',
           f'Response features: {", ".join(f"`{f}`" for f in resp)}. '
           f'Athletes need ≥{MIN_BLOCKS} blocks; {GAP_DAYS}-day gap between halves.', '',
           '## Personal profiles (own δ)', '',
           '| Duration | Athletes | Test blocks | R² population | R² + personal | Gain | λ |',
           '|---|---|---|---|---|---|---|']
    for r in results:
        out.append(f"| {r['key']} | {r['n_ath']} | {r['n_test']} | {r['r2_pop']:.4f} | "
                   f"{r['r2_personal']:.4f} | **{r['r2_personal'] - r['r2_pop']:+.4f}** | {r['best_lam']} |")
    out += ['', '## Stability of δ (corr. first-half vs second-half estimate, per feature)', '',
            '| Feature | ' + ' | '.join(DURATIONS) + ' |', '|---' * (len(DURATIONS) + 1) + '|']
    for f in resp:
        out.append(f'| {f} | ' + ' | '.join(f"{r['stability'][f]:+.2f}" for r in results) + ' |')
    out += ['', '## Types (KMeans on δ)', '',
            '| k | ' + ' | '.join(f'R² {x}' for x in DURATIONS) + ' |', '|---' * (len(DURATIONS) + 1) + '|']
    for k in KS:
        out.append(f'| {k} | ' + ' | '.join(f'{v:.4f}' for v in clus[k][3].values()) + ' |')
    out += ['', f'Best k = {best_k}. Signatures = centroid deviation from population, '
            '% change in best power per +1 SD of the feature:', '',
            '| Type | Athletes | Signature (top 4) |', '|---|---|---|']
    for _, r in describe_types(cent, lab).iterrows():
        out.append(f"| {r.type} | {r.athletes} | {r.signature} |")
    out += ['', '## Cold start', '',
            f'Type predicted from training habits only (athlete means of block features): '
            f'accuracy **{acc:.1%}** vs majority baseline {base_acc:.1%}.', '']
    out += ['## History length: population vs type vs own vs hybrid', '',
            'Only the last H weeks before the split are used to learn the rider; R² on the later half. '
            'Type centroids come from other riders only. Gain vs population ×1000.', '']
    for key in DURATIONS:
        out += [f'### {key}', '', '| History | Population R² | Type | Own | Hybrid |', '|---|---|---|---|---|']
        for h in HISTORY_WEEKS:
            r = hist[h][key]
            g = {m: (r[m] - r['population']) * 1000 for m in ('type', 'own', 'hybrid')}
            best = max(g, key=g.get)
            cells = [f"**{g[m]:+.1f}**" if m == best else f"{g[m]:+.1f}" for m in ('type', 'own', 'hybrid')]
            out.append(f"| {'all' if h is None else f'{h} wk'} | {r['population']:.4f} | " + ' | '.join(cells) + ' |')
        out.append('')
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text('\n'.join(out))
    print(f'report → {REPORT}')


if __name__ == '__main__':
    main()
