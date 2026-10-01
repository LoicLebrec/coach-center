/**
 * Responder profile — how this rider's power responds to training blocks,
 * compared with ~1,400 GoldenCheetah riders. Deterministic, no LLM.
 *
 * Mirrors ml/feasibility.py (blocks) and ml/profiles.py (personal δ):
 *   block   = 4 training weeks starting on a Monday, sliding weekly
 *   outcome = log(best power in the 3 weeks after / best in the 6 weeks before)
 *   δ       = ridge of the population-model residual on the response features,
 *             shrunk toward 0 ("like everyone else") with the exported λ.
 * Model numbers live in src/data/responderModel.json (ml/profiles.py → data/responder_model.json).
 */

import MODEL from '../data/responderModel.json';

const DAY = 86400000;
const PRE_WEEKS = 6, BLOCK_WEEKS = 4, POST_WEEKS = 3;
const DURATIONS = { '5s': 5, '1m': 60, '5m': 300, '20m': 1200 };
const BIKE = new Set(['Ride', 'VirtualRide']);
const STRENGTH = new Set(['WeightTraining', 'Crossfit']);
// Trait → response features it reads. Signs: + = more of it helps this rider more than average.
const TRAITS = {
  volume: ['hours_wk', 'tss_wk'],
  intensity: ['z5_h_wk', 'z67_h_wk'],
  rest: ['rest_days'],
};
const TRAIT_DURATIONS = ['5m', '20m'];   // where personal profiles held up out of time
const TRAIT_THRESHOLD = 0.75;            // in SDs of riders' δ

/* ───────────── dates ───────────── */

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parse(key) {
  return new Date(`${key}T12:00:00`);
}
function addDays(key, n) {
  return dayKey(new Date(parse(key).getTime() + n * DAY));
}
function mondayKey(key) {
  const d = parse(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}

/** Intervals.icu `curves=` ranges, one per Monday-Sunday week, oldest first. */
export function weekRanges(oldestKey, newestKey) {
  const out = [];
  for (let m = mondayKey(oldestKey); m <= newestKey; m = addDays(m, 7)) out.push(`r.${m}.${addDays(m, 6)}`);
  return out;
}

/** power-curves response → { 'YYYY-MM-DD' (Monday): { '5s': W, ... } } */
export function weeklyBests(curves) {
  const list = Array.isArray(curves) ? curves : curves?.list || [];
  const out = {};
  for (const c of list) {
    const start = String(c.start_date_local || c.id?.slice(2, 12) || '').slice(0, 10);
    if (!start || !Array.isArray(c.secs) || !Array.isArray(c.watts)) continue;
    const row = {};
    for (const [k, s] of Object.entries(DURATIONS)) {
      const i = c.secs.indexOf(s);
      const w = i >= 0 ? Number(c.watts[i]) : NaN;
      if (w > 0) row[k] = w;
    }
    out[mondayKey(start)] = row;
  }
  return out;
}

/* ───────────── daily series ───────────── */

function intensity(a) {
  let f = Number(a.icu_intensity);
  if (!Number.isFinite(f)) return null;
  return f > 3 ? f / 100 : f;
}

function zoneHours(a) {
  const z = { z12: 0, z3: 0, z4: 0, z5: 0, z67: 0 };
  (a.icu_zone_times || []).forEach(({ id, secs }) => {
    const h = (Number(secs) || 0) / 3600;
    const k = String(id).toUpperCase();
    if (k === 'Z1' || k === 'Z2') z.z12 += h;
    else if (k === 'Z3' || k === 'SS') z.z3 += h;
    else if (k === 'Z4') z.z4 += h;
    else if (k === 'Z5') z.z5 += h;
    else if (k === 'Z6' || k === 'Z7') z.z67 += h;
  });
  return z;
}

/** Activities → Map day → { tss, hours, hard, strength, z12..z67, ctl }, every day from first to last. */
export function dailySeries(activities) {
  const byDay = new Map();
  const get = (k) => {
    if (!byDay.has(k)) byDay.set(k, { tss: 0, hours: 0, hard: 0, strength: 0, z12: 0, z3: 0, z4: 0, z5: 0, z67: 0 });
    return byDay.get(k);
  };
  for (const a of activities) {
    const k = String(a.start_date_local || '').slice(0, 10);
    if (!k) continue;
    if (STRENGTH.has(a.type) && (Number(a.moving_time) || 0) >= 600) { get(k).strength += 1; continue; }
    if (!BIKE.has(a.type)) continue;
    const tss = Number(a.icu_training_load);
    if (!(tss > 0 && tss < 600) || (Number(a.moving_time) || 0) <= 600) continue;
    const d = get(k);
    d.tss += tss;
    d.hours += a.moving_time / 3600;
    if ((intensity(a) || 0) >= 0.85) d.hard = 1;
    const z = zoneHours(a);
    Object.keys(z).forEach(n => { d[n] += z[n]; });
  }
  const keys = [...byDay.keys()].sort();
  if (!keys.length) return { days: [], first: null };
  const days = [];
  let ctl = 0;
  for (let k = keys[0]; k <= keys[keys.length - 1]; k = addDays(k, 1)) {
    const d = byDay.get(k) || { tss: 0, hours: 0, hard: 0, strength: 0, z12: 0, z3: 0, z4: 0, z5: 0, z67: 0 };
    ctl += (d.tss - ctl) / 42;
    days.push({ date: k, ...d, ctl });
  }
  return { days, first: keys[0] };
}

/* ───────────── blocks ───────────── */

const sum = (xs) => xs.reduce((s, x) => s + x, 0);

function std(xs) {
  const m = sum(xs) / xs.length;
  return Math.sqrt(sum(xs.map(x => (x - m) ** 2)) / (xs.length - 1));
}

/** One row per 4-week block, same features as ml/feasibility.py. */
export function buildBlocks(daily, bests) {
  const { days } = daily;
  if (!days.length) return [];
  const idx = new Map(days.map((d, i) => [d.date, i]));
  const career = {};
  Object.values(bests).forEach(r => Object.entries(r).forEach(([k, w]) => { career[k] = Math.max(career[k] || 0, w); }));
  const bestOver = (fromMonday, weeks, k) => {
    let b = 0;
    for (let w = 0; w < weeks; w++) b = Math.max(b, bests[addDays(fromMonday, 7 * w)]?.[k] || 0);
    return b;
  };

  const rows = [];
  let start = mondayKey(addDays(days[0].date, 7 * PRE_WEEKS + 6));
  const last = days[days.length - 1].date;
  for (; addDays(start, 7 * (BLOCK_WEEKS + POST_WEEKS) - 1) <= last; start = addDays(start, 7)) {
    const i0 = idx.get(start);
    const pre = days.slice(i0 - 7 * PRE_WEEKS, i0);
    const blk = days.slice(i0, i0 + 7 * BLOCK_WEEKS);
    const post = days.slice(i0 + 7 * BLOCK_WEEKS, i0 + 7 * (BLOCK_WEEKS + POST_WEEKS));
    const hours = sum(blk.map(d => d.hours));
    if (hours < 8) continue; // off-season / injury gaps are not training blocks
    const weekly = [0, 1, 2, 3].map(w => sum(blk.slice(7 * w, 7 * w + 7).map(d => d.tss)));
    const tssDays = blk.map(d => d.tss);
    const month = parse(start).getMonth() + 1;
    const row = {
      start,
      hours_wk: hours / 4,
      tss_wk: sum(weekly) / 4,
      z12_h_wk: sum(blk.map(d => d.z12)) / 4,
      z3_h_wk: sum(blk.map(d => d.z3)) / 4,
      z4_h_wk: sum(blk.map(d => d.z4)) / 4,
      z5_h_wk: sum(blk.map(d => d.z5)) / 4,
      z67_h_wk: sum(blk.map(d => d.z67)) / 4,
      ramp: (weekly[2] + weekly[3] - weekly[0] - weekly[1]) / Math.max(sum(weekly), 1),
      recovery_wk: Math.min(...weekly) < 0.6 * (sum(weekly) / 4) ? 1 : 0,
      monotony: (sum(tssDays) / 28) / (std(tssDays) + 1e-6),
      rest_days: blk.filter(d => d.hours === 0).length,
      hard_days: sum(blk.map(d => d.hard)),
      strength_wk: sum(blk.map(d => d.strength)) / 4,
      ctl0: pre.length ? pre[pre.length - 1].ctl : NaN,
      hard_pre: sum(pre.map(d => d.hard)),
      hard_post: sum(post.map(d => d.hard)),
      month_sin: Math.sin((2 * Math.PI * month) / 12),
      month_cos: Math.cos((2 * Math.PI * month) / 12),
    };
    const preMonday = addDays(start, -7 * PRE_WEEKS);
    const postMonday = addDays(start, 7 * BLOCK_WEEKS);
    for (const k of Object.keys(DURATIONS)) {
      const p0 = bestOver(preMonday, PRE_WEEKS, k);
      const p1 = bestOver(postMonday, POST_WEEKS, k);
      row[`y_${k}`] = p0 > 0 && p1 > 0 ? Math.log(p1 / p0) : NaN;
      row[`lvl_${k}`] = p0 > 0 && career[k] > 0 ? Math.log(p0 / career[k]) : NaN;
    }
    rows.push(row);
  }
  return rows;
}

/* ───────────── personal δ ───────────── */

/** Solve (AᵀA + λI) x = Aᵀb by Gaussian elimination (8×8). */
function ridgeSolve(A, b, lam) {
  const n = A[0].length;
  const M = Array.from({ length: n }, (_, i) => {
    const row = Array.from({ length: n }, (_, j) => sum(A.map(r => r[i] * r[j])) + (i === j ? lam : 0));
    row.push(sum(A.map((r, t) => r[i] * b[t])));
    return row;
  });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** δ for one duration, or null if not enough usable blocks. */
export function fitDuration(blocks, key, model = MODEL) {
  const m = model.durations[key];
  const rows = blocks.filter(b => Number.isFinite(b[`y_${key}`]) && Number.isFinite(b[`lvl_${key}`])
    && Number.isFinite(b.ctl0) && Math.abs(b[`y_${key}`]) < 0.4);
  if (rows.length < model.min_blocks) return null;
  const val = (b, f) => (f.startsWith('lvl_') ? b[`lvl_${key}`] : b[f]);
  const cols = [...m.features, 'y'];
  const mean = Object.fromEntries(cols.map(f => [f, sum(rows.map(b => (f === 'y' ? b[`y_${key}`] : val(b, f)))) / rows.length]));
  const Xs = rows.map(b => m.features.map((f, j) => (val(b, f) - mean[f] - m.mean[j]) / m.scale[j]));
  const y = rows.map(b => b[`y_${key}`] - mean.y);
  const base = Xs.map(x => m.intercept + sum(x.map((v, j) => v * m.coef[j])));
  const ri = model.response_features.map(f => m.features.indexOf(f));
  const delta = ridgeSolve(Xs.map(x => ri.map(j => x[j])), y.map((v, t) => v - base[t]), m.lambda);
  return { blocks: rows.length, delta: Object.fromEntries(model.response_features.map((f, i) => [f, delta[i]])) };
}

/**
 * Full profile: δ per duration + three readable traits in {-1, 0, +1}.
 * trait score = mean over its features and TRAIT_DURATIONS of δ / (spread of δ across riders).
 */
export function computeProfile(blocks, model = MODEL) {
  const durations = {};
  for (const k of Object.keys(model.durations)) {
    const r = fitDuration(blocks, k, model);
    if (r) durations[k] = r;
  }
  const traits = {};
  const scores = {};
  for (const [t, feats] of Object.entries(TRAITS)) {
    const zs = [];
    for (const k of TRAIT_DURATIONS) {
      if (!durations[k]) continue;
      feats.forEach(f => {
        const sd = model.durations[k].delta_sd[model.response_features.indexOf(f)];
        zs.push(durations[k].delta[f] / sd);
      });
    }
    scores[t] = zs.length ? sum(zs) / zs.length : null;
    traits[t] = scores[t] == null ? 0 : scores[t] >= TRAIT_THRESHOLD ? 1 : scores[t] <= -TRAIT_THRESHOLD ? -1 : 0;
  }
  const n = Math.max(0, ...Object.values(durations).map(d => d.blocks));
  return {
    version: model.version, ready: Object.keys(durations).length > 0, blocks: n,
    minBlocks: model.min_blocks, traits, scores, durations,
  };
}

/** Activities + weekly power curves → profile. */
export function profileFromData(activities, curves, model = MODEL) {
  const blocks = buildBlocks(dailySeries(activities), weeklyBests(curves));
  return { ...computeProfile(blocks, model), totalBlocks: blocks.length };
}

export const TRAIT_TEXT = {
  volume: {
    1: { label: 'Répond au volume', plan: 'endurance +15 %' },
    '-1': { label: 'Moins de volume suffit', plan: 'endurance −15 %' },
  },
  intensity: {
    1: { label: 'Répond à l’intensité', plan: 'séances dures un niveau au-dessus' },
    '-1': { label: 'Intensité moins efficace', plan: 'séances dures un niveau en dessous' },
  },
  rest: {
    1: { label: 'Progresse avec plus de repos', plan: 'vendredi récup → repos' },
    '-1': { label: 'Le repos complet te coûte', plan: 'lundi repos → récup 45′' },
  },
};
