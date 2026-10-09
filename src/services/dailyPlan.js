/**
 * Today's decision, end to end — pure and deterministic, no React, no storage.
 * Used by the Today view and, bundled, by the server cron that refreshes the
 * home-screen widget every morning (api/_lib/daily-plan.js, `npm run build:server`).
 */

import { inferTrainingType } from './workout-rules';
import {
  PHASES, getSeasonState, templateForDay, weekPlan, pickWorkout, fitToDuration, keepRepRatio,
  lowerOneZone, countWork, blocksMinutes, progressionFor, strengthLevel, shrinkToFit,
} from './periodization';
import { strengthSession } from '../data/strengthLibrary';
import { levelShifts, feedbackReadiness } from './rideFeedbackRules';
import { analyzeTraining, decideSession, dataWeaknesses, estimateTss, suggestCycle } from './coachEngine';
import { num } from './number';

export const ZONE_PCT = {
  Z1: [45, 55], Z2: [56, 75], Z3: [76, 90],
  Z4: [91, 105], Z5: [106, 120], Z6: [121, 150], Z7: [151, 200],
};
export const TYPE_LABELS = {
  recovery: 'Récupération', endurance: 'Endurance', durability: 'Durabilité', tempo: 'Tempo', force: 'Force',
  sweetspot: 'Sweet spot', threshold: 'Seuil', vo2: 'VO2 max', anaerobic: 'Anaérobie',
  sprint: 'Sprint', race_sim: 'Simulation course', openers: 'Déblocage', rest: 'Repos', race: 'Course', test: 'Test FTP',
};

export function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayOf(e) {
  return String(e?.start_date_local || e?.date || '').slice(0, 10);
}

export { num };

export function mean(values) {
  const v = values.filter(x => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export function fmtDur(min) {
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min % 1) return `${Math.floor(min)}′${String(Math.round((min % 1) * 60)).padStart(2, '0')}`;
  return `${min} min`;
}

export function isRace(e) {
  const k = String(e?.kind || e?.category || '').toLowerCase();
  return k === 'race' || k.startsWith('race_');
}

export function isRestDay(e) {
  return String(e?.kind || '').toLowerCase() === 'rest' || e?.trainingType === 'rest';
}

export function sessionMinutes(e) {
  const fromBlocks = blocksMinutes(e?.workoutBlocks || []);
  if (fromBlocks > 0) return Math.round(fromBlocks);
  if (num(e?.durationMin)) return num(e.durationMin);
  if (num(e?.moving_time)) return Math.round(e.moving_time / 60);
  if (num(e?.workout_doc?.duration)) return Math.round(e.workout_doc.duration / 60);
  return null;
}

export function sessionType(e) {
  if (!e) return null;
  if (e.trainingType) return e.trainingType;
  return inferTrainingType(e.name || e.title || '', e.notes || e.description || '');
}

/* ───────────── form & readiness (pure, deterministic) ───────────── */

export function formStatus(tsb) {
  if (tsb == null) return { label: '—', tone: 'muted', hint: 'Pas de données de charge' };
  if (tsb > 15) return { label: 'Très frais', tone: 'blue', hint: 'Bien reposé — idéal pour une course ou un test' };
  if (tsb > 5) return { label: 'Frais', tone: 'green', hint: 'Prêt pour une séance intense' };
  if (tsb > -10) return { label: 'Équilibré', tone: 'green', hint: 'Zone neutre — entraînement normal' };
  if (tsb > -25) return { label: 'Fatigue productive', tone: 'yellow', hint: 'Tu construis — surveille la récup' };
  return { label: 'Surcharge', tone: 'red', hint: 'Fatigue élevée — risque de sur-entraînement' };
}

export const CHECKIN_QUESTIONS = [
  { key: 'sleep', label: 'Sommeil', options: [
    { v: 'bad', label: 'Mauvais', pts: -20 }, { v: 'ok', label: 'Moyen', pts: 0 }, { v: 'good', label: 'Bon', pts: 10 },
  ] },
  { key: 'legs', label: 'Jambes', options: [
    { v: 'heavy', label: 'Lourdes', pts: -20 }, { v: 'normal', label: 'Normales', pts: 0 }, { v: 'fresh', label: 'Fraîches', pts: 10 },
  ] },
  { key: 'energy', label: 'Énergie / moral', options: [
    { v: 'low', label: 'Bas', pts: -15 }, { v: 'ok', label: 'OK', pts: 0 }, { v: 'high', label: 'Au top', pts: 5 },
  ] },
];

export const DEFAULT_CHECKIN = { sleep: 'ok', legs: 'normal', energy: 'ok', sick: false, minutes: null };

export function computeReadiness({ tsb, hrvStatus, hrvRatio, rhrDelta, checkin, extra = [] }) {
  const reasons = [];
  let score = 60;

  if (tsb != null) {
    const pts = tsb > 15 ? 10 : tsb > 5 ? 15 : tsb > -10 ? 5 : tsb > -25 ? -10 : -25;
    score += pts;
    if (pts < 0) reasons.push(`Forme (TSB ${Math.round(tsb)})`);
  }
  // Baseline-band HRV (7 d vs 60 d) when enough history, else today vs 7-day mean.
  if (hrvStatus) {
    if (hrvStatus === 'low') { score -= 15; reasons.push('VFC sous ta normale'); }
    else if (hrvStatus === 'high') score += 5;
  } else if (hrvRatio != null) {
    if (hrvRatio < 0.9) { score -= 15; reasons.push('VFC sous ta moyenne'); }
    else if (hrvRatio > 1.05) score += 5;
  }
  if (rhrDelta != null && rhrDelta >= 5) { score -= 10; reasons.push(`FC repos +${Math.round(rhrDelta)} bpm`); }

  CHECKIN_QUESTIONS.forEach(q => {
    const opt = q.options.find(o => o.v === checkin[q.key]);
    if (!opt) return;
    score += opt.pts;
    if (opt.pts < 0) reasons.push(`${q.label} : ${opt.label.toLowerCase()}`);
  });

  // How yesterday's session felt (services/rideFeedback).
  extra.forEach(x => { score += x.delta; if (x.delta < 0) reasons.push(x.reason); });

  score = Math.max(0, Math.min(100, Math.round(score)));

  let level;
  if (checkin.sick) { level = 'rest'; reasons.unshift('Malade / douleur'); }
  else if (score >= 65) level = 'go';
  else if (score >= 45) level = 'adjust';
  else if (score >= 25) level = 'downgrade';
  else level = 'recover';

  return { score, level, reasons };
}

export const LEVELS = {
  go: { title: 'Feu vert', text: 'Fais la séance comme prévue.', effect: 'séance inchangée', tone: 'green' },
  adjust: { title: 'Séance allégée', text: 'Même objectif, un tiers de répétitions en moins.', effect: '−1/3 des répétitions, volume −15 %', tone: 'yellow' },
  downgrade: { title: 'Intensité réduite', text: 'Intensité retirée, endurance à la place.', effect: 'intensité → endurance, volume −30 %', tone: 'orange' },
  recover: { title: 'Récupération', text: 'Sortie très facile de 45 min max.', effect: 'remplacée par récupération 45 min', tone: 'red' },
  rest: { title: 'Repos', text: 'Pas d’entraînement aujourd’hui. Soigne-toi.', effect: 'repos complet', tone: 'red' },
};

const ADAPT_HARD_TYPES = ['vo2', 'threshold', 'sweetspot', 'tempo', 'force', 'anaerobic', 'sprint', 'race_sim', 'durability', 'test'];

/**
 * Today's bodyweight session, adjusted like the ride: lighter level when the day is
 * "adjust", core only when intensity is removed, nothing on a rest day.
 */
export function adaptStrength(kind, level, readinessLevel) {
  if (!kind || readinessLevel === 'rest') return null;
  if (readinessLevel === 'downgrade' || readinessLevel === 'recover') {
    return { ...strengthSession('core', 1), adjusted: kind !== 'core' || level > 1 ? 'Allégé : gainage seulement' : null };
  }
  if (readinessLevel === 'adjust' && level > 1) return { ...strengthSession(kind, level - 1), adjusted: 'Allégé : niveau en dessous' };
  return strengthSession(kind, level);
}

/** Adapt the actual planned blocks to today's readiness + time available. */
export function adaptWorkout(base, level, availableMin, phase) {
  if (!base || level === 'rest') return null;
  let { blocks, trainingType: type, title, objective } = base;
  const baseMin = blocksMinutes(blocks);

  if (type === 'test' && level !== 'go') {
    // A test only means something when fresh: ride easy, test another day.
    const w = pickWorkout('endurance', Math.round(Math.min(baseMin, 75) / 5) * 5, phase);
    ({ blocks, title, objective } = w);
    type = 'endurance';
  } else if (level === 'adjust') {
    blocks = keepRepRatio(blocks, 0.67);
    blocks = fitToDuration(blocks, Math.round(Math.min(blocksMinutes(blocks), baseMin * 0.85)));
  } else if (level === 'downgrade') {
    if (ADAPT_HARD_TYPES.includes(type)) {
      const w = pickWorkout('endurance', Math.round(baseMin * 0.7 / 5) * 5, phase);
      ({ blocks, title, objective } = w);
      type = 'endurance';
    } else {
      blocks = fitToDuration(lowerOneZone(blocks), Math.round(baseMin * 0.7));
    }
  } else if (level === 'recover') {
    const w = pickWorkout('recovery', Math.min(45, baseMin || 45), phase);
    ({ blocks, title, objective } = w);
    type = 'recovery';
  }

  if (availableMin && blocksMinutes(blocks) > availableMin + 3) blocks = shrinkToFit(blocks, availableMin);

  return { title, objective, trainingType: type, blocks, minutes: Math.round(blocksMinutes(blocks)) };
}

export function diffWorkouts(base, adapted) {
  const out = [];
  if (!base || !adapted) return out;
  if (base.trainingType !== adapted.trainingType) {
    out.push(`${TYPE_LABELS[base.trainingType] || base.trainingType} → ${TYPE_LABELS[adapted.trainingType] || adapted.trainingType}`);
  } else {
    const a = countWork(base.blocks), b = countWork(adapted.blocks);
    if (a !== b) out.push(`${a} → ${b} efforts`);
  }
  const m1 = Math.round(blocksMinutes(base.blocks)), m2 = adapted.minutes;
  if (Math.abs(m1 - m2) >= 3) out.push(`${m1} → ${m2} min`);
  return out;
}

const isRest = (b) => /recover|récup/i.test(b?.label || '');
const sameBlock = (a, b) => a && b && a.zone === b.zone && a.durationMin === b.durationMin;

export function groupBlocks(blocks) {
  const rows = [];
  let i = 0;
  while (i < blocks.length) {
    const w = blocks[i];
    const r = blocks[i + 1];
    let n = 1;
    let j = i;
    if (!isRest(w) && isRest(r)) {
      while (sameBlock(blocks[j + 1], r) && isRest(blocks[j + 1]) && sameBlock(blocks[j + 2], w)) {
        n++;
        j += 2;
      }
    }
    rows.push(n > 1 ? { ...w, label: String(w.label).replace(/\s*#\d+$/, ''), reps: n, rest: r } : w);
    i = j + 1;
  }
  return rows;
}

function dateOf(key) {
  return new Date(`${key}T12:00:00`);
}

/** Fitness / fatigue / form + today's HRV and resting HR vs the previous 7 days. */
export function computePhysio(wellness, today) {
  const sorted = [...wellness].filter(w => w?.id && w.id <= today).sort((a, b) => a.id.localeCompare(b.id));
  // Start of the day: today's row already includes today's ride.
  const before = sorted.filter(w => w.id < today);
  const last = before[before.length - 1] || sorted[sorted.length - 1] || {};
  // Intervals.icu wellness uses ctl/atl; synthetic (Strava-only) wellness uses icu_ctl/icu_atl.
  const ctl = num(last.icu_ctl ?? last.ctl);
  const atl = num(last.icu_atl ?? last.atl);
  const tsb = ctl != null && atl != null ? ctl - atl : null;

  const todayW = sorted.find(w => w.id === today) || {};
  const prev = sorted.filter(w => w.id < today).slice(-7);
  const hrv = num(todayW.hrv);
  const hrvBase = mean(prev.map(w => num(w.hrv)));
  const rhr = num(todayW.restingHR);
  const rhrBase = mean(prev.map(w => num(w.restingHR)));

  return {
    ctl, atl, tsb,
    hrv, hrvRatio: hrv && hrvBase ? hrv / hrvBase : null,
    rhr, rhrDelta: rhr && rhrBase ? rhr - rhrBase : null,
  };
}

/** Local plan first, then Intervals.icu events not already copied locally; notes dropped. */
function mergeCalendar(plannedEvents, events) {
  return [
    ...plannedEvents.map(e => ({ ...e, _local: true })),
    ...events.filter(e => !plannedEvents.some(p => dayOf(p) === dayOf(e) && (p.name || p.title) === e.name)),
  ].filter(e => String(e.category || '').toUpperCase() !== 'NOTE');
}

/** Today's planned session and races, local plan first, then the Intervals.icu calendar. */
export function buildCalendar(plannedEvents, events, today) {
  const all = mergeCalendar(plannedEvents, events);
  const todays = all.filter(e => dayOf(e) === today);
  const raceDays = new Set(all.filter(isRace).map(dayOf));
  const t = dateOf(today); t.setDate(t.getDate() + 1);
  const nextRace = all.filter(e => isRace(e) && dayOf(e) >= today).sort((a, b) => dayOf(a).localeCompare(dayOf(b)))[0];
  return {
    planned: todays.find(e => !isRace(e)) || null,
    race: todays.find(isRace) || null,
    raceDays,
    raceTomorrow: raceDays.has(localDayKey(t)),
    nextRace,
    nextRaceDays: nextRace ? Math.round((new Date(`${dayOf(nextRace)}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000) : null,
  };
}

/** Base session: planned blocks > planned name matched to library > season template — then the data checks. */
export function buildBaseSession({ cal, seasonState, progression, weaknesses, analysis, date, override = null, responder = null, maxMinutes = null, targetMinutes = null }) {
  // A day edited by hand in the plan beats whatever the calendar had.
  const planned = override ? null : cal.planned;
  if (planned) {
    if (isRestDay(planned)) return { rest: true, source: 'planned' };
    const type = sessionType(planned);
    const plannedMin = sessionMinutes(planned) || 60;
    const d = decideSession({ type, minutes: plannedMin }, analysis);
    if (planned.workoutBlocks?.length && d.type === type) {
      let blocks = planned.workoutBlocks.map(b => ({ ...b, durationMin: Number(b.durationMin) || 0 }));
      if (maxMinutes && blocksMinutes(blocks) > maxMinutes + 3) blocks = shrinkToFit(blocks, maxMinutes);
      return {
        source: 'planned', title: planned.name || planned.title, objective: planned.notes || '',
        trainingType: type, blocks, dataChanges: d.changes,
      };
    }
    const w = pickWorkout(d.type, maxMinutes ? Math.min(d.minutes, maxMinutes) : d.minutes, seasonState.phase, progression);
    return { ...w, source: 'planned-matched', plannedName: planned.name || planned.title, trainingType: d.type, dataChanges: d.changes };
  }
  const tpl = templateForDay(seasonState, date, { weaknesses, hasRaceTomorrow: cal.raceTomorrow, override, responder });
  if (tpl.type === 'rest') return { rest: true, source: tpl.overridden ? 'override' : 'season' };
  if (targetMinutes && tpl.type !== 'recovery') tpl.minutes = targetMinutes;
  else if (maxMinutes) tpl.minutes = Math.min(tpl.minutes, maxMinutes);
  const d = decideSession(tpl, analysis);
  const w = pickWorkout(d.type, d.minutes, seasonState.phase, progression);
  return { ...w, source: tpl.overridden ? 'override' : 'season', trainingType: d.type, plannedType: tpl.type, dataChanges: d.changes };
}

/**
 * Everything the Today view shows.
 * season: season config; profileWeaknesses: self-declared; checkin: today's answers (or DEFAULT_CHECKIN).
 * responder: traits from services/responderProfile ({ volume, intensity, rest }) or null.
 */
export function computeDay({
  wellness = [], activities = [], athlete = null, events = [], plannedEvents = [], powerCurve = null,
  season, profileWeaknesses = [], checkin = DEFAULT_CHECKIN, today = localDayKey(), responder = null,
  availability = {}, feedback = {},
}) {
  const date = dateOf(today);
  // A cycle scheduled from the suggestion takes over on its start date.
  const pending = season?.pendingCycle;
  if (pending?.cycleStart && pending.cycleStart <= today) season = { ...season, ...pending, pendingCycle: null };
  const physio = computePhysio(wellness, today);
  const cal = buildCalendar(plannedEvents, events, today);
  const seasonState = getSeasonState(season, date);
  const analysis = analyzeTraining({ wellness, activities, athlete, powerCurve, seasonState, today });
  // Manual cycle focus > limiter measured on the power curve > self-declared profile.
  const weaknesses = season?.cycleFocus && season.cycleFocus !== 'auto'
    ? [season.cycleFocus]
    : dataWeaknesses(analysis, profileWeaknesses);
  const progression = { ...progressionFor(seasonState, responder), levelShift: levelShifts(feedback) };
  const overrides = season?.dayOverrides || {};
  const yesterday = (() => { const y = dateOf(today); y.setDate(y.getDate() - 1); return localDayKey(y); })();
  const week = weekPlan(seasonState, date, { weaknesses, raceDays: cal.raceDays, overrides, responder, availability, today });
  const todayPlan = week.find(d => d.date === today) || {};
  const avail = availability?.[today] || null;
  const readiness = computeReadiness({
    tsb: physio.tsb, hrvStatus: analysis.hrv?.status, hrvRatio: physio.hrvRatio,
    rhrDelta: analysis.rhr.delta ?? physio.rhrDelta, checkin,
    extra: feedbackReadiness(feedback[yesterday]),
  });
  // A day off or a session moved here by the availability beats the calendar and the template.
  const availOverride = todayPlan.unavailable || todayPlan.movedFrom ? { type: todayPlan.type, minutes: todayPlan.minutes } : null;
  const base = {
    ...buildBaseSession({
      cal, seasonState, progression, weaknesses, analysis, date, override: overrides[today] || availOverride, responder,
      // Time available: sets the session length (calendar sessions are only shortened).
      maxMinutes: num(avail?.minutes),
      targetMinutes: todayPlan.capped || todayPlan.carried ? todayPlan.minutes : null,
    }),
    ...(todayPlan.unavailable ? { unavailable: true } : {}),
    ...(todayPlan.movedFrom ? { movedFrom: todayPlan.movedFrom } : {}),
    ...(todayPlan.movedTo ? { movedTo: todayPlan.movedTo } : {}),
    ...(todayPlan.dropped ? { dropped: todayPlan.dropped } : {}),
    ...(todayPlan.carried ? { carried: todayPlan.carried } : {}),
  };
  // checkin.minutes is the pre-availability way of saying "short on time today".
  const timeCap = [avail ? null : checkin.minutes, num(avail?.minutes)].filter(Boolean);
  const adapted = cal.race || base.rest ? null : adaptWorkout(base, readiness.level, timeCap.length ? Math.min(...timeCap) : null, seasonState.phase);
  const strengthKind = week.find(d => d.date === today)?.strength || null;
  const strength = cal.race ? null : adaptStrength(strengthKind, strengthLevel(seasonState), readiness.level);
  const cycle = suggestCycle({ analysis, seasonState, season, today, weaknesses: profileWeaknesses });
  return {
    today, season, physio, cal, seasonState, analysis, weaknesses, progression, week, readiness, base, adapted, strength, cycle,
    changes: diffWorkouts(base, adapted),
    form: formStatus(physio.tsb),
    level: LEVELS[readiness.level],
    phaseInfo: PHASES[seasonState.phase],
  };
}

/**
 * The next `weeks` weeks (from this Monday), day by day, with the session each day
 * would get. Precedence per day: race > hand-made override > calendar session > season template.
 * No readiness adaptation here — that only exists for today.
 */
export function buildOutlook({ season, plannedEvents = [], events = [], weaknesses = [], today = localDayKey(), weeks = 4, responder = null, availability = {}, feedback = {} }) {
  const shift = levelShifts(feedback);
  const all = mergeCalendar(plannedEvents, events);
  const byDay = new Map();
  for (const e of all) byDay.set(dayOf(e), [...(byDay.get(dayOf(e)) || []), e]);
  const raceDays = new Set(all.filter(isRace).map(dayOf));
  const overrides = season?.dayOverrides || {};

  return Array.from({ length: weeks }, (_, w) => {
    const ref = dateOf(today);
    ref.setDate(ref.getDate() + 7 * w);
    if (w > 0) ref.setDate(ref.getDate() - ((ref.getDay() + 6) % 7)); // Monday of later weeks
    const refKey = localDayKey(ref);
    // A scheduled cycle counts for the weeks after its start.
    const p = season?.pendingCycle;
    const cfg = p?.cycleStart && p.cycleStart <= refKey ? { ...season, ...p, pendingCycle: null } : season;
    const state = getSeasonState(cfg, ref);
    const progression = { ...progressionFor(state, responder), levelShift: shift };
    const sLevel = strengthLevel(state);
    const days = weekPlan(state, ref, { weaknesses, raceDays, overrides, responder, availability, today }).map(d => {
      const evs = byDay.get(d.date) || [];
      const race = evs.find(isRace);
      if (race) return { ...d, type: 'race', minutes: 0, source: 'race', title: race.name || race.title || 'Course', blocks: [], strength: null };
      d = { ...d, strength: d.strength ? strengthSession(d.strength, sLevel) : null };
      if (d.unavailable) return { date: d.date, type: 'rest', minutes: 0, source: 'availability', unavailable: true, movedTo: d.movedTo, dropped: d.dropped, blocks: [], strength: null };
      const planned = !d.overridden && !d.movedFrom && evs.find(e => !isRace(e));
      if (planned && isRestDay(planned)) return { date: d.date, type: 'rest', minutes: 0, source: 'planned', blocks: [], strength: d.strength };
      if (planned) {
        const type = sessionType(planned) || 'endurance';
        const minutes = sessionMinutes(planned) || 60;
        const cap = num(availability?.[d.date]?.minutes);
        let blocks = planned.workoutBlocks?.length
          ? planned.workoutBlocks.map(b => ({ ...b, durationMin: Number(b.durationMin) || 0 }))
          : pickWorkout(type, cap ? Math.min(minutes, cap) : minutes, state.phase, progression).blocks;
        if (cap && blocksMinutes(blocks) > cap + 3) blocks = shrinkToFit(blocks, cap);
        return {
          date: d.date, type, minutes, source: 'planned', blocks, strength: d.strength,
          title: planned.name || planned.title, objective: planned.notes || '', tss: estimateTss(blocks),
        };
      }
      const source = d.overridden ? 'override' : d.movedFrom ? 'moved' : 'plan';
      if (d.type === 'rest') return { ...d, source, blocks: [] };
      const wk = pickWorkout(d.type, d.minutes, state.phase, progression);
      return {
        ...d, source, blocks: wk.blocks, title: wk.title, objective: wk.objective, tss: estimateTss(wk.blocks),
        family: wk.family, familyLabel: wk.familyLabel, level: wk.level, levelCount: wk.levelCount,
      };
    });
    return { start: days[0].date, state, phaseInfo: PHASES[state.phase], days };
  });
}

/** Compact JSON for the widgets (iOS Scriptable, GNOME extension). */
export function buildSnapshot(day, { ftp = null, source = 'app' } = {}) {
  const { cal, base, adapted, strength, readiness, analysis, week, physio, seasonState, form, level, phaseInfo, changes, cycle } = day;
  const wattsFor = (zone) => {
    const pct = ZONE_PCT[zone];
    if (!ftp || !pct) return '';
    return zone === 'Z7' ? ` >${Math.round(ftp * 1.5)}W` : ` ${Math.round(ftp * pct[0] / 100)}-${Math.round(ftp * pct[1] / 100)}W`;
  };
  let session = null;
  if (cal.race) session = { kind: 'race', title: cal.race.name || cal.race.title || 'Course' };
  else if (base.rest) session = { kind: 'rest', title: 'Repos' };
  else if (readiness.level === 'rest') session = { kind: 'rest', title: 'Repos conseillé' };
  else if (adapted) {
    session = {
      kind: 'workout',
      title: adapted.title,
      type: TYPE_LABELS[adapted.trainingType] || adapted.trainingType,
      minutes: adapted.minutes,
      tss: estimateTss(adapted.blocks),
      lines: groupBlocks(adapted.blocks).filter(b => !/warm|cool|échauff|retour/i.test(b.label || '')).slice(0, 5).map(b => (b.reps
        ? `${b.reps}×${fmtDur(b.durationMin)} ${b.zone}${wattsFor(b.zone)} / ${fmtDur(b.rest.durationMin)}`
        : `${fmtDur(b.durationMin)} ${b.zone}${wattsFor(b.zone)} ${b.label}`)),
      zones: adapted.blocks.map(b => [b.zone, Number(b.durationMin) || 0]),
      changes: [...(base.dataChanges || []).map(c => c.text), ...changes],
    };
  }
  return {
    v: 1,
    source,
    date: day.today,
    generatedAt: new Date().toISOString(),
    phase: `${phaseInfo.label}${seasonState.isRecoveryWeek ? ' · récup' : ` · S${seasonState.weekInCycle}/${seasonState.cycleLen}`}`,
    form: { tsb: physio.tsb != null ? Math.round(physio.tsb) : null, ctl: physio.ctl != null ? Math.round(physio.ctl) : null, label: form.label, tone: form.tone },
    readiness: { score: readiness.score, title: level.title, tone: level.tone },
    load: { done: analysis.week.doneTss, target: analysis.week.weekTarget },
    session,
    strength: strength ? { title: strength.title, minutes: strength.minutes } : null,
    week: week.map(d => ({ date: d.date, type: d.type === 'rest' ? 'Repos' : TYPE_LABELS[d.type], minutes: d.minutes, strength: !!d.strength })),
    nextRace: cal.nextRace ? { name: cal.nextRace.name || cal.nextRace.title || 'Course', days: cal.nextRaceDays } : null,
    signals: analysis.signals.slice(0, 3).map(sig => ({ title: sig.title, tone: sig.tone })),
    cycle: cycle ? { title: cycle.title, start: cycle.start, summary: cycle.summary } : null,
  };
}
