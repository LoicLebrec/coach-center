/**
 * Data-driven coaching layer — deterministic, no LLM.
 *
 * Reads what actually happened (wellness, activities, power curve) and turns it
 * into the checks a coach runs before prescribing a session:
 *
 *  - Load & ramp rate      Banister impulse-response / Coggan PMC. CTL gain ≲ 5–8 pts/week.
 *  - Acute:chronic ratio   ATL/CTL > 1.5 = spike (Gabbett 2016).
 *  - Weekly TSS budget     derived from CTL + target ramp for the phase (ΔCTL/week ≈ (avg daily TSS − CTL) / 6).
 *  - Hard-day spacing      ≥ 48 h between high-intensity sessions (Seiler 2010, "hard days hard, easy days easy").
 *  - Hard sessions / week  2–3 max, by phase.
 *  - Intensity distribution  28 d, 3-zone model — ~80 % low intensity (Seiler & Kjerland 2006; Stöggl & Sperlich 2014).
 *  - HRV-guided training   7-day rolling ln(rMSSD) vs 60-day baseline ± SWC (Plews 2013; Javaloyes 2019).
 *  - Resting HR drift      +5 bpm vs 30-day baseline.
 *  - Limiter               power profile (Coggan 2010) from real best efforts: 5 s, 1 min, 5 min, FTP.
 *  - Next mesocycle        phase from the A-race countdown (Friel: base → build → peak) or the season,
 *                          3:1 or 2:1 from current fatigue markers, focus from the limiter, CTL projection.
 */

import { PHASES, CYCLE_FOCUS, getSeasonState } from './periodization';
import { num } from './number';

const DAY = 86400000;

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(key, n) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / DAY);
}

function mean(xs) {
  const v = xs.filter(x => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

function sd(xs) {
  const v = xs.filter(x => x != null);
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

const actDay = (a) => String(a?.start_date_local || a?.date || '').slice(0, 10);

// ── Session typing ────────────────────────────────────────────────────────────

export const HARD_TYPES = ['vo2', 'threshold', 'sweetspot', 'anaerobic', 'sprint', 'race_sim', 'race', 'force', 'test'];
// "Moderate" sessions: count as grey-zone load, not as a hard day.
export const MODERATE_TYPES = ['tempo', 'durability'];

const ZONE_IF = { Z1: 0.5, Z2: 0.65, Z3: 0.83, Z4: 0.98, Z5: 1.13, Z6: 1.35, Z7: 1.6 };

/** TSS ≈ Σ hours × IF² × 100, IF taken at each zone's midpoint. */
export function estimateTss(blocks = []) {
  return Math.round(blocks.reduce((s, b) => {
    const h = (Number(b.durationMin) || 0) / 60;
    const f = ZONE_IF[b.zone] ?? 0.65;
    return s + h * f * f * 100;
  }, 0));
}

function intensityFactor(a) {
  let f = num(a.icu_intensity) ?? num(a.intensity_factor) ?? num(a.if);
  if (f == null) return null;
  if (f > 3) f /= 100; // Intervals.icu reports IF as a percentage
  return f;
}

/** Seconds per 3-zone bucket for one activity. Power zones first, HR zones next, IF last. */
function zoneSplit(a) {
  const pz = Array.isArray(a.icu_zone_times) ? a.icu_zone_times : null;
  if (pz?.length) {
    const out = { low: 0, mid: 0, high: 0, source: 'power' };
    pz.forEach(z => {
      const id = String(z.id || '').toUpperCase();
      const s = num(z.secs) || 0;
      if (id === 'Z1' || id === 'Z2') out.low += s;
      else if (id === 'Z3' || id === 'SS') out.mid += s;
      else if (/^Z[4-7]$/.test(id)) out.high += s;
    });
    if (out.low + out.mid + out.high > 0) return out;
  }
  const hz = Array.isArray(a.icu_hr_zone_times) ? a.icu_hr_zone_times.map(num) : null;
  if (hz?.length >= 5) {
    const out = { low: (hz[0] || 0) + (hz[1] || 0), mid: hz[2] || 0, high: hz.slice(3).reduce((s, x) => s + (x || 0), 0), source: 'hr' };
    if (out.low + out.mid + out.high > 0) return out;
  }
  const f = intensityFactor(a);
  const secs = num(a.moving_time) || 0;
  if (f == null || !secs) return null;
  if (f < 0.75) return { low: secs, mid: 0, high: 0, source: 'if' };
  if (f < 0.85) return { low: secs * 0.6, mid: secs * 0.4, high: 0, source: 'if' };
  return { low: secs * 0.55, mid: secs * 0.15, high: secs * 0.3, source: 'if' };
}

/** A hard day: IF ≥ 0.85, or ≥ 10 min above threshold, or a race. */
export function isHardActivity(a) {
  const kind = String(a?.kind || a?.sub_type || a?.category || '').toLowerCase();
  if (kind === 'race' || kind.startsWith('race_')) return true;
  const f = intensityFactor(a);
  if (f != null && f >= 0.85) return true;
  const z = zoneSplit(a);
  return !!(z && z.source !== 'if' && z.high >= 600);
}

const ENDURANCE_SPORTS = /ride|cycl|bike|velo|run|ski|row/i;

// ── Power profile (Coggan 2010, men, W/kg): "untrained" → "world class" ──────
const PROFILE = [
  { key: 'sprint', label: '5 s', secs: 5, lo: 10.17, hi: 24.04 },
  { key: 'punch', label: '1 min', secs: 60, lo: 5.64, hi: 11.5 },
  { key: 'vo2max', label: '5 min', secs: 300, lo: 2.33, hi: 7.6 },
  { key: 'threshold', label: 'FTP', secs: null, lo: 1.86, hi: 6.4 },
];

/** Accepts [{secs, watts}], {secs:[], watts|values:[]}, or {list:[…]} (Intervals.icu). */
export function parsePowerCurve(pc) {
  if (!pc) return [];
  if (Array.isArray(pc)) {
    if (pc.length && Array.isArray(pc[0]?.secs)) return parsePowerCurve(pc[0]);
    return pc.map(p => ({ secs: num(p.secs ?? p.time), watts: num(p.watts ?? p.power) })).filter(p => p.secs && p.watts);
  }
  if (Array.isArray(pc.list)) return parsePowerCurve(pc.list[0]);
  const secs = pc.secs || [];
  const w = pc.watts || pc.values || [];
  return secs.map((s, i) => ({ secs: num(s), watts: num(w[i]) })).filter(p => p.secs && p.watts);
}

function bestAt(curve, secs) {
  if (!curve.length) return null;
  const near = curve.reduce((b, p) => (Math.abs(p.secs - secs) < Math.abs(b.secs - secs) ? p : b));
  return Math.abs(near.secs - secs) <= secs * 0.2 ? near.watts : null;
}

export function powerProfile(powerCurve, ftp, weight) {
  if (!weight) return null;
  const curve = parsePowerCurve(powerCurve);
  const rows = PROFILE.map(p => {
    const watts = p.secs ? bestAt(curve, p.secs) : ftp;
    if (!watts) return null;
    const wkg = watts / weight;
    return { ...p, watts: Math.round(watts), wkg: Math.round(wkg * 100) / 100, score: Math.max(0, Math.min(1, (wkg - p.lo) / (p.hi - p.lo))) };
  }).filter(Boolean);
  if (rows.length < 3) return null;
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  const spread = sorted[sorted.length - 1].score - sorted[0].score;
  return {
    rows,
    limiter: spread >= 0.08 ? sorted[0].key : null,
    strength: spread >= 0.08 ? sorted[sorted.length - 1].key : null,
  };
}

// ── Phase parameters ──────────────────────────────────────────────────────────

// Target CTL change per week, and max hard sessions per week.
const PHASE_RAMP = { transition: -3, base: 4, build: 5, competition: 1, peak: 0, taper: -6 };
const PHASE_MAX_HARD = { transition: 0, base: 2, build: 3, competition: 3, peak: 2, taper: 2 };

/**
 * Everything the data says, before choosing a session.
 */
export function analyzeTraining({ wellness = [], activities = [], athlete = null, powerCurve = null, seasonState = null, today = dayKey(new Date()) }) {
  const signals = [];
  const phase = seasonState?.phase || 'base';

  // ── Load (PMC) ──
  // Today's session is prescribed from the state at the start of the day: today's
  // wellness row already carries today's ride in ctl/atl, so load comes from the day before.
  // (HRV and resting HR are morning readings and stay today's.)
  const ws = [...wellness].filter(w => w?.id && w.id <= today).sort((a, b) => a.id.localeCompare(b.id));
  const wsBefore = ws.filter(w => w.id < today);
  const last = wsBefore[wsBefore.length - 1] || ws[ws.length - 1] || {};
  // Intervals.icu wellness uses ctl/atl; synthetic (Strava-only) wellness uses icu_ctl/icu_atl.
  const ctl = num(last.icu_ctl ?? last.ctl);
  const atl = num(last.icu_atl ?? last.atl);
  const tsb = ctl != null && atl != null ? ctl - atl : null;
  const weekAgo = ws.filter(w => w.id <= addDays(last.id || today, -7)).pop();
  const ctlWeekAgo = num(weekAgo?.icu_ctl ?? weekAgo?.ctl);
  const ramp7 = ctl != null && ctlWeekAgo != null ? ctl - ctlWeekAgo : null;
  const acwr = ctl && atl != null ? atl / ctl : null;

  if (ramp7 != null && ramp7 > 8) {
    signals.push({ id: 'ramp', tone: 'red', title: `Montée de charge rapide : +${ramp7.toFixed(1)} CTL/sem`, detail: 'Au-delà de ~8 pts/semaine le risque de surmenage monte. Le budget de la semaine est réduit.', ref: 'Coggan PMC' });
  } else if (ramp7 != null && ramp7 < -5 && !['taper', 'transition'].includes(phase) && !seasonState?.isRecoveryWeek) {
    signals.push({ id: 'ramp', tone: 'yellow', title: `Condition en baisse : ${ramp7.toFixed(1)} CTL/sem`, detail: 'Tu perds de la forme de fond — volume Z2 prioritaire.', ref: 'Coggan PMC' });
  }
  if (acwr != null && acwr > 1.5) {
    signals.push({ id: 'acwr', tone: 'red', title: `Pic de charge aiguë (ATL/CTL ${acwr.toFixed(2)})`, detail: 'Charge des 7 derniers jours bien au-dessus de ta charge habituelle.', ref: 'Gabbett 2016' });
  }

  // ── HRV: 7-day rolling ln(rMSSD) vs 60-day baseline ──
  const lnHrv = ws.filter(w => w.id > addDays(today, -60)).map(w => ({ id: w.id, v: num(w.hrv) > 0 ? Math.log(num(w.hrv)) : null })).filter(x => x.v != null);
  let hrv = null;
  if (lnHrv.length >= 14) {
    const baseVals = lnHrv.map(x => x.v);
    const base = mean(baseVals);
    // SWC = 0.5 SD, floored at ~3 % so a very stable (or flat) history doesn't flag noise.
    const swc = Math.max(0.5 * (sd(baseVals) || 0), 0.03);
    const roll7 = mean(lnHrv.filter(x => x.id > addDays(today, -7)).map(x => x.v));
    const todayV = lnHrv.find(x => x.id === today)?.v ?? null;
    let status = 'normal';
    if (roll7 != null && roll7 < base - swc) status = 'low';
    else if (roll7 != null && roll7 > base + swc) status = 'high';
    // one very low morning is also a flag
    if (todayV != null && todayV < base - 2 * swc) status = 'low';
    hrv = {
      status, days: lnHrv.length,
      today: todayV != null ? Math.round(Math.exp(todayV)) : null,
      roll7: roll7 != null ? Math.round(Math.exp(roll7)) : null,
      base: Math.round(Math.exp(base)),
      band: [Math.round(Math.exp(base - swc)), Math.round(Math.exp(base + swc))],
    };
    if (status === 'low') {
      signals.push({ id: 'hrv', tone: 'red', title: `VFC sous ta normale (${hrv.roll7} ms, norme ${hrv.band[0]}–${hrv.band[1]})`, detail: 'Le système nerveux autonome n’a pas récupéré : on retire l’intensité aujourd’hui.', ref: 'Plews 2013 · Javaloyes 2019' });
    }
  }

  // ── Resting HR vs 30-day baseline ──
  const rhrToday = num(ws.find(w => w.id === today)?.restingHR);
  const rhrBase = mean(ws.filter(w => w.id < today && w.id > addDays(today, -30)).map(w => num(w.restingHR)));
  const rhrDelta = rhrToday && rhrBase ? rhrToday - rhrBase : null;
  if (rhrDelta != null && rhrDelta >= 5) {
    signals.push({ id: 'rhr', tone: 'yellow', title: `FC repos +${Math.round(rhrDelta)} bpm vs 30 j`, detail: 'Signe possible de fatigue, de chaleur ou de début de maladie.', ref: '' });
  }

  // ── Activities: hard days, weekly load, distribution ──
  // Only what was done before today drives the decision, so the session doesn't
  // change under the rider once it's been ridden.
  const all = activities.filter(a => actDay(a) && actDay(a) <= today && ENDURANCE_SPORTS.test(String(a.type || 'Ride')));
  const acts = all.filter(a => actDay(a) < today);
  const todayActs = all.filter(a => actDay(a) === today);
  const hardDays = [...new Set(acts.filter(isHardActivity).map(actDay))].sort();
  const lastHardDay = hardDays[hardDays.length - 1] || null;
  const lastHard = lastHardDay ? {
    date: lastHardDay,
    daysAgo: daysBetween(lastHardDay, today),
    name: acts.find(a => actDay(a) === lastHardDay && isHardActivity(a))?.name || '',
  } : null;

  const monday = (() => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d); })();
  const weekActs = acts.filter(a => actDay(a) >= monday);
  const loadOf = (xs) => Math.round(xs.reduce((s, a) => s + (num(a.icu_training_load) || 0), 0));
  const doneBefore = loadOf(weekActs);
  const todayTss = loadOf(todayActs);
  const hardThisWeek = new Set(weekActs.filter(isHardActivity).map(actDay)).size;

  let rampTarget = seasonState?.isRecoveryWeek ? -4 : (PHASE_RAMP[phase] ?? 3);
  if (ramp7 != null && ramp7 > 8) rampTarget = Math.min(rampTarget, 0);
  const weekTarget = ctl != null ? Math.max(0, Math.round(7 * (ctl + 6 * rampTarget))) : null;
  const daysLeft = 7 - daysBetween(monday, today);
  const remaining = weekTarget != null ? Math.max(0, weekTarget - doneBefore) : null;
  const week = {
    // doneTss includes today (display); the budget uses doneBefore.
    monday, doneTss: doneBefore + todayTss, doneBefore, todayTss, weekTarget, remaining, rampTarget, daysLeft,
    perDay: remaining != null && daysLeft > 0 ? Math.round(remaining / daysLeft) : null,
    hard: hardThisWeek,
    hardToday: todayActs.some(isHardActivity),
    maxHard: seasonState?.isRecoveryWeek ? 1 : (PHASE_MAX_HARD[phase] ?? 2),
  };

  const split = { low: 0, mid: 0, high: 0 };
  const sources = new Set();
  acts.filter(a => actDay(a) > addDays(today, -28)).forEach(a => {
    const z = zoneSplit(a);
    if (!z) return;
    split.low += z.low; split.mid += z.mid; split.high += z.high; sources.add(z.source);
  });
  const tot = split.low + split.mid + split.high;
  let distribution = null;
  if (tot > 3 * 3600) {
    const pct = (x) => Math.round((x / tot) * 100);
    distribution = { low: pct(split.low), mid: pct(split.mid), high: pct(split.high), hours: Math.round(tot / 360) / 10, source: [...sources].join('+') };
    if (distribution.low < 70 && distribution.mid > distribution.high) {
      distribution.verdict = 'grey';
      signals.push({ id: 'dist', tone: 'yellow', title: `Trop de zone grise : ${distribution.mid} % en Z3 (28 j)`, detail: 'Les pros font ~80 % facile. Le tempo/sweet spot est remplacé par de l’endurance vraie ou de la vraie intensité.', ref: 'Seiler 2010 · Stöggl 2014' });
    } else if (distribution.high > 20) {
      distribution.verdict = 'hot';
      signals.push({ id: 'dist', tone: 'yellow', title: `Beaucoup d’intensité : ${distribution.high} % au-dessus du seuil (28 j)`, detail: 'Au-delà de ~20 % la récupération ne suit plus. Séances dures limitées.', ref: 'Seiler 2010' });
    } else {
      distribution.verdict = 'ok';
    }
  }

  // ── Limiter from the power curve ──
  const ftp = num(athlete?.icu_ftp) || num(athlete?.ftp) || null;
  const weight = num(athlete?.icu_weight) || num(athlete?.weight) || num(last.weight) || null;
  const profile = powerProfile(powerCurve, ftp, weight);

  if (lastHard?.daysAgo === 1) {
    signals.push({ id: 'spacing', tone: 'muted', title: `Séance dure hier${lastHard.name ? ` (${lastHard.name})` : ''}`, detail: '48 h minimum entre deux séances intenses.', ref: 'Seiler 2010' });
  }

  return {
    today, phase,
    load: { ctl, atl, tsb, ramp7, acwr },
    hrv, rhr: { today: rhrToday, base: rhrBase, delta: rhrDelta },
    lastHard, week, distribution, profile, signals,
  };
}

/**
 * Apply the data checks to the session the plan wants today.
 * candidate: { type, minutes }  →  { type, minutes, changes: [{ text, ref }] }
 */
export function decideSession(candidate, analysis) {
  let { type, minutes } = candidate;
  const changes = [];
  if (!analysis || type === 'rest' || type === 'race') return { type, minutes, changes };
  const { lastHard, week, distribution, hrv, load } = analysis;
  const hard = HARD_TYPES.includes(type);

  if (hard && hrv?.status === 'low') {
    changes.push({ text: 'VFC basse → pas d’intensité', ref: 'Plews 2013' });
    type = 'endurance'; minutes = Math.round((minutes || 60) * 0.75);
  } else if (hard && load.acwr != null && load.acwr > 1.5) {
    changes.push({ text: `ATL/CTL ${load.acwr.toFixed(2)} → endurance`, ref: 'Gabbett 2016' });
    type = 'endurance';
  } else if (hard && lastHard && lastHard.daysAgo < 2) {
    changes.push({ text: 'Séance dure hier → intensité décalée à demain', ref: 'Seiler 2010' });
    type = 'endurance';
  } else if (hard && week.hard >= week.maxHard) {
    changes.push({ text: `${week.hard}/${week.maxHard} séances dures déjà faites cette semaine`, ref: 'Seiler 2010' });
    type = 'endurance';
  } else if (MODERATE_TYPES.includes(type) && distribution?.verdict === 'grey') {
    changes.push({ text: 'Trop de Z3 sur 28 j → endurance Z2 pure', ref: 'Seiler 2010' });
    type = 'endurance';
  }

  // Weekly TSS budget: keep today's session within ~1.5× the remaining daily average.
  if (minutes && week.perDay != null && week.weekTarget) {
    const cap = Math.max(30, week.perDay * 1.5);
    const est = (m) => estimateTss([{ durationMin: m, zone: HARD_TYPES.includes(type) ? 'Z3' : 'Z2' }]);
    if (est(minutes) > cap && type === 'endurance') {
      const ifSq = 0.65 * 0.65;
      const capped = Math.max(45, Math.round((cap / (ifSq * 100)) * 60 / 5) * 5);
      if (capped < minutes - 10) {
        changes.push({ text: `Budget semaine ${week.doneBefore ?? week.doneTss}/${week.weekTarget} TSS → ${minutes} → ${capped} min`, ref: 'Coggan PMC' });
        minutes = capped;
      }
    }
  }

  return { type, minutes, changes };
}

/** Swap the season's focus for the data-driven limiter when there is one. */
export function dataWeaknesses(analysis, fallback = []) {
  const lim = analysis?.profile?.limiter;
  return lim ? [lim, ...fallback.filter(w => w !== lim)] : fallback;
}

// ── Suggested next mesocycle ──────────────────────────────────────────────────

function mondayKey(key) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
}

/** Weekly TSS for a target CTL change, then simulate the 42-day EWMA day by day. */
function projectWeek(ctl, ramp) {
  const tss = Math.max(0, Math.round(7 * (ctl + 6 * ramp)));
  let c = ctl;
  for (let i = 0; i < 7; i++) c += (tss / 7 - c) / 42;
  return { tss, ctlEnd: c };
}

/**
 * The mesocycle to run next: starts after the current one (or next Monday if none is running).
 * Returns null inside the last 3 weeks before the A-race — peak/taper take over.
 */
export function suggestCycle({ analysis, seasonState, season = {}, today = dayKey(new Date()), weaknesses = [] }) {
  if (!analysis || !seasonState) return null;
  if (seasonState.daysToTarget != null && seasonState.daysToTarget <= 21) return null;
  const reasons = [];
  const { load, hrv, profile } = analysis;

  // Start: Monday after the current mesocycle, or next Monday when no cycle was ever started.
  const thisMonday = mondayKey(today);
  const running = !!season.cycleStart && season.cycleStart <= today;
  const weeksLeft = running ? seasonState.cycleLen - seasonState.weekInCycle + 1 : (today === thisMonday ? 0 : 1);
  const start = addDays(thisMonday, 7 * weeksLeft);

  // Phase: A-race countdown first (Friel: ~12 wk base, ~8 wk build, 2–3 wk peak), else the season calendar.
  let phase;
  const weeksToTarget = season.targetDate && season.targetDate > start ? Math.floor(daysBetween(start, season.targetDate) / 7) : null;
  if (weeksToTarget != null) {
    phase = weeksToTarget > 10 ? 'base' : 'build';
    reasons.push(`${season.targetName || 'Objectif'} dans ${weeksToTarget} sem. → ${PHASES[phase].label.toLowerCase()}`);
  } else {
    phase = getSeasonState({ mode: 'auto' }, new Date(`${start}T12:00:00`)).phase;
    reasons.push(`Calendrier route au ${new Date(`${start}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} → ${PHASES[phase].label.toLowerCase()}`);
  }
  if (['build', 'competition'].includes(phase) && load.ctl != null && load.ctl < 35) {
    phase = 'base';
    reasons.push(`Fond aérobie encore bas (CTL ${Math.round(load.ctl)}) → base d’abord`);
  }

  // Format: 2:1 when fatigue markers are already high, 3:1 otherwise.
  const tired = [];
  if (load.acwr != null && load.acwr > 1.3) tired.push(`ATL/CTL ${load.acwr.toFixed(2)}`);
  if (load.ramp7 != null && load.ramp7 > 7) tired.push(`+${load.ramp7.toFixed(1)} CTL/sem`);
  if (load.tsb != null && load.tsb < -25) tired.push(`TSB ${Math.round(load.tsb)}`);
  if (hrv?.status === 'low') tired.push('VFC basse');
  const cycle = tired.length ? '2:1' : '3:1';
  reasons.push(tired.length ? `Fatigue déjà présente (${tired.join(', ')}) → 2 sem. de charge + 1 récup` : 'Pas de fatigue excessive → 3 sem. de charge + 1 récup');

  // Focus: measured limiter in build/competition; base stays general.
  let focus = 'auto';
  if (['build', 'competition'].includes(phase)) {
    const lim = profile?.limiter || weaknesses[0];
    if (lim && CYCLE_FOCUS[lim]) {
      focus = lim;
      reasons.push(profile?.limiter ? `Point faible mesuré sur ta courbe de puissance → ${CYCLE_FOCUS[lim].toLowerCase()}` : `Point faible déclaré → ${CYCLE_FOCUS[lim].toLowerCase()}`);
    }
  }

  // Weekly load projection.
  const len = cycle === '2:1' ? 3 : 4;
  const weeks = [];
  let ctl = load.ctl;
  for (let i = 0; i < len; i++) {
    const recovery = i === len - 1 && !['transition'].includes(phase);
    const ramp = recovery ? -4 : (PHASE_RAMP[phase] ?? 3);
    const wk = { start: addDays(start, 7 * i), kind: recovery ? 'recovery' : 'load', maxHard: recovery ? 1 : (PHASE_MAX_HARD[phase] ?? 2) };
    if (ctl != null) {
      const p = projectWeek(ctl, ramp);
      wk.tss = p.tss;
      wk.ctlEnd = Math.round(p.ctlEnd);
      ctl = p.ctlEnd;
    }
    weeks.push(wk);
  }

  const calendarPhase = getSeasonState({ mode: 'auto' }, new Date(`${start}T12:00:00`)).phase;
  const config = {
    ...(phase === calendarPhase ? { mode: 'auto' } : { mode: 'manual', phase, phaseStart: start }),
    cycle, cycleStart: start, cycleFocus: focus,
  };
  const matchesCurrent = running
    && season.cycle === cycle
    && (season.cycleFocus || 'auto') === focus
    && seasonState.phase === phase;

  return {
    start, phase, cycle, focus, weeks, reasons, config, matchesCurrent,
    title: `${PHASES[phase].label} · ${cycle === '3:1' ? '3+1' : '2+1'} sem.${focus !== 'auto' ? ` · ${CYCLE_FOCUS[focus]}` : ''}`,
    summary: load.ctl != null && weeks.length
      ? `CTL ${Math.round(load.ctl)} → ${weeks[weeks.length - 1].ctlEnd} · ${weeks.filter(w => w.kind === 'load').map(w => w.tss).join('/')} TSS`
      : '',
  };
}
