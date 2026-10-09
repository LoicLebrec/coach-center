/**
 * Planned vs done — deterministic, no LLM.
 *
 * Compliance colour as in TrainingPeaks: TSS (or duration when no TSS) within 80–120 %
 * of the plan = green, 50–79 / 121–150 % = yellow, beyond = orange, nothing done = red.
 * On top of that, the intent of the session is checked from power zone times:
 * a quality day must contain most of its work above threshold, an easy day must stay easy.
 */

import { estimateTss, HARD_TYPES } from './coachEngine';
import { num } from './number';

const RIDE = /ride|cycl|bike|velo/i;
const STRENGTH = /weight|strength|workout|crossfit|training|renfo|muscu/i;
const EASY_TYPES = ['recovery', 'endurance', 'durability'];

const actDay = (a) => String(a?.start_date_local || a?.date || '').slice(0, 10);

function ifOf(a) {
  let f = num(a.icu_intensity) ?? num(a.intensity_factor);
  if (f == null) return null;
  return f > 3 ? f / 100 : f;
}

/** Seconds at Z4 and above from Intervals.icu power zone times, or null. */
function secsAboveThreshold(a) {
  const z = Array.isArray(a.icu_zone_times) ? a.icu_zone_times : null;
  if (!z?.length) return null;
  return z.reduce((s, x) => s + (/^Z[4-7]$/i.test(String(x.id)) ? num(x.secs) || 0 : 0), 0);
}

export function activitiesOn(activities, date) {
  const day = activities.filter(a => actDay(a) === date);
  return {
    rides: day.filter(a => RIDE.test(String(a.type || 'Ride'))),
    strength: day.filter(a => !RIDE.test(String(a.type || 'Ride')) && STRENGTH.test(`${a.type || ''} ${a.name || ''}`)),
  };
}

function band(ratio) {
  if (ratio == null) return null;
  if (ratio >= 0.8 && ratio <= 1.2) return 'green';
  if (ratio >= 0.5 && ratio <= 1.5) return 'yellow';
  return 'orange';
}

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)}′`);

/**
 * planned: { type, blocks } — the session prescribed that day (type 'rest' / no blocks = nothing planned)
 * rides: activities of that day (see activitiesOn)
 * past: the day is over (no activity → missed)
 * Returns null when there is nothing to say yet.
 */
export function reviewSession(planned, rides, { past = false } = {}) {
  const hasPlan = planned && planned.type !== 'rest' && planned.type !== 'race' && planned.blocks?.length;
  if (!rides.length) {
    if (!hasPlan || !past) return null;
    return {
      verdict: 'missed', tone: 'red', title: 'Séance non faite',
      rows: [], notes: [HARD_TYPES.includes(planned.type)
        ? 'Pas besoin de la rattraper : on ne cumule pas deux séances dures, le plan continue.'
        : 'Pas grave isolément. Si ça se répète, réduis le volume prévu plutôt que de forcer.'],
    };
  }

  const minutes = rides.reduce((s, a) => s + (num(a.moving_time) || num(a.elapsed_time) || 0), 0) / 60;
  const tssKnown = rides.some(a => num(a.icu_training_load) != null);
  const tss = Math.round(rides.reduce((s, a) => s + (num(a.icu_training_load) || 0), 0));
  const ifs = rides.map(a => [ifOf(a), num(a.moving_time) || 0]).filter(([f, t]) => f != null && t);
  const IF = ifs.length ? ifs.reduce((s, [f, t]) => s + f * t, 0) / ifs.reduce((s, [, t]) => s + t, 0) : null;
  const highSecs = rides.map(secsAboveThreshold);
  const high = highSecs.every(x => x == null) ? null : highSecs.reduce((s, x) => s + (x || 0), 0) / 60;

  if (!hasPlan) {
    return {
      verdict: 'extra', tone: 'blue', title: planned?.type === 'rest' ? 'Sortie un jour de repos' : 'Sortie hors plan',
      rows: [
        { label: 'Durée', done: fmtMin(minutes) },
        tssKnown && { label: 'TSS', done: tss },
        IF != null && { label: 'IF', done: IF.toFixed(2) },
      ].filter(Boolean),
      notes: ['Comptée dans ta charge : le plan des prochains jours en tient compte.'],
    };
  }

  const pMin = planned.blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0);
  const pTss = estimateTss(planned.blocks);
  const pIF = pMin ? Math.sqrt(pTss / ((pMin / 60) * 100)) : null;
  const pHigh = planned.blocks.reduce((s, b) => s + (/^Z[4-7]$/.test(b.zone) ? Number(b.durationMin) || 0 : 0), 0);

  const ratio = tssKnown && pTss ? tss / pTss : pMin ? minutes / pMin : null;
  let tone = band(ratio) || 'green';
  const notes = [];
  const hard = HARD_TYPES.includes(planned.type);

  if (hard && pHigh >= 3 && high != null) {
    if (high < 0.4 * pHigh) {
      notes.push(`Intensité pas faite : ${Math.round(high)} min au-dessus du seuil pour ${Math.round(pHigh)} prévues.`);
      tone = 'orange';
    } else if (high < 0.7 * pHigh) {
      notes.push(`Intensité partielle : ${Math.round(high)} / ${Math.round(pHigh)} min au-dessus du seuil.`);
      if (tone === 'green') tone = 'yellow';
    } else {
      notes.push(`Travail au seuil fait : ${Math.round(high)} / ${Math.round(pHigh)} min.`);
    }
  }
  if (EASY_TYPES.includes(planned.type)) {
    const tooHot = (IF != null && pIF != null && IF > pIF + 0.08) || (high != null && high > Math.max(10, pHigh * 1.5 + 5));
    if (tooHot) {
      notes.push(`Trop intense pour une séance ${planned.type === 'recovery' ? 'de récup' : 'facile'}${IF != null ? ` (IF ${IF.toFixed(2)} vs ~${pIF.toFixed(2)})` : ''} : la fatigue monte sans le bénéfice d’une vraie séance.`);
      tone = tone === 'green' ? 'yellow' : 'orange';
    }
  }
  if (ratio != null && ratio > 1.2) notes.push('Plus de charge que prévu : le moteur en tient compte dès demain (charge, espacement 48 h).');
  if (ratio != null && ratio < 0.8 && !notes.length) notes.push('Moins que prévu. Ponctuel = sans conséquence ; le plan continue.');

  const title = tone === 'green' ? 'Séance respectée' : tone === 'yellow' ? 'Séance en partie respectée' : 'Séance différente du plan';
  return {
    verdict: tone === 'green' ? 'ok' : 'off', tone, title,
    pct: ratio != null ? Math.round(ratio * 100) : null,
    rows: [
      { label: 'Durée', planned: fmtMin(pMin), done: fmtMin(minutes), ok: band(minutes / pMin) === 'green' },
      tssKnown && { label: 'TSS', planned: pTss, done: tss, ok: band(tss / pTss) === 'green' },
      IF != null && pIF != null && { label: 'IF', planned: pIF.toFixed(2), done: IF.toFixed(2), ok: Math.abs(IF - pIF) <= 0.08 },
      high != null && pHigh > 0 && { label: '≥ Z4', planned: `${Math.round(pHigh)}′`, done: `${Math.round(high)}′`, ok: high >= 0.7 * pHigh },
    ].filter(Boolean),
    notes,
  };
}
