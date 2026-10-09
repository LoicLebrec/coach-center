/**
 * Ride feedback rules — pure, no storage (bundled for the server cron too).
 * How the ride felt — the one thing power data can't tell.
 * { 'YYYY-MM-DD': { rpe 1-10, outcome: 'done'|'partial'|'failed', legs: 'heavy'|'normal'|'fresh',
 *                   note, type, family, level } }
 * Feeds tomorrow's readiness and the level of the next session of the same family.
 */
export const RPE_LABELS = { 1: 'Très facile', 2: 'Très facile', 3: 'Facile', 4: 'Facile', 5: 'Modéré', 6: 'Modéré', 7: 'Dur', 8: 'Dur', 9: 'Très dur', 10: 'À bloc' };

// Session RPE a session of each type should feel like (Foster CR-10).
const EXPECTED = {
  recovery: [1, 3], endurance: [2, 4], durability: [4, 6], tempo: [4, 6], force: [5, 7], sweetspot: [5, 7],
  threshold: [7, 8], vo2: [8, 9], anaerobic: [8, 9], sprint: [6, 8], race_sim: [7, 9], openers: [3, 5],
  race: [8, 10], test: [9, 10],
};

/** Session type for a ride nothing was planned for, from its intensity factor. */
export function typeFromRides(rides = []) {
  const ifs = rides.map(a => { const f = Number(a.icu_intensity ?? a.intensity_factor); return Number.isFinite(f) ? (f > 3 ? f / 100 : f) : null; }).filter(f => f != null);
  const f = ifs.length ? Math.max(...ifs) : null;
  if (f == null) return 'endurance';
  if (f >= 0.95) return 'race_sim';
  if (f >= 0.85) return 'threshold';
  if (f >= 0.76) return 'tempo';
  if (f < 0.6) return 'recovery';
  return 'endurance';
}

export function expectedRpe(type) {
  return EXPECTED[type] || [3, 6];
}

/**
 * Level change for the next session of each family, from the last two rated
 * sessions of that family: not held → −1, partly held → −1 (repeat the level
 * instead of moving on), held and easier than expected → +1. Clamped to ±2.
 */
export function levelShifts(feedback = {}) {
  const byFamily = {};
  Object.entries(feedback).sort(([a], [b]) => a.localeCompare(b)).forEach(([, f]) => {
    if (f?.family) (byFamily[f.family] = byFamily[f.family] || []).push(f);
  });
  const out = {};
  for (const [fam, list] of Object.entries(byFamily)) {
    let shift = 0;
    for (const f of list.slice(-2)) {
      const [lo] = expectedRpe(f.type);
      if (f.outcome === 'failed' || f.outcome === 'partial') shift -= 1;
      else if (f.outcome === 'done' && f.rpe != null && f.rpe < lo) shift += 1;
    }
    if (shift) out[fam] = Math.max(-2, Math.min(2, shift));
  }
  return out;
}

/** Readiness adjustments from yesterday's feedback: [{ delta, reason }]. */
export function feedbackReadiness(entry) {
  if (!entry) return [];
  const out = [];
  const [, hi] = expectedRpe(entry.type);
  if (entry.outcome === 'failed') out.push({ delta: -10, reason: 'séance d’hier pas tenue' });
  else if (entry.rpe != null && entry.rpe >= hi + 2) out.push({ delta: -8, reason: `séance d’hier bien plus dure que prévu (RPE ${entry.rpe})` });
  else if (entry.rpe != null && entry.rpe === hi + 1) out.push({ delta: -4, reason: `séance d’hier un peu plus dure que prévu (RPE ${entry.rpe})` });
  if (entry.legs === 'heavy') out.push({ delta: -5, reason: 'jambes lourdes après la séance d’hier' });
  return out;
}

/** One sentence on what the plan does with this feedback. */
export function feedbackEffect(entry) {
  if (!entry) return null;
  const [lo, hi] = expectedRpe(entry.type);
  const fam = entry.familyLabel || 'cette séance';
  if (entry.outcome === 'failed') return `Prochaine séance ${fam} : un niveau en dessous. Demain, la séance sera allégée.`;
  if (entry.outcome === 'partial') return `Prochaine séance ${fam} : même niveau, pour la boucler.`;
  if (entry.family && entry.rpe != null && entry.rpe < lo) return `Plus facile que prévu : la prochaine séance ${fam} monte d’un niveau.`;
  if (entry.rpe != null && entry.rpe > hi) return 'Plus dur que prévu : demain sera ajusté si la fatigue se confirme.';
  return 'Conforme à ce qui était prévu : le plan continue.';
}
