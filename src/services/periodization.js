/**
 * Season periodization — deterministic, no LLM.
 *
 * 1. Macrocycle: season phase from the calendar (French amateur road season)
 *    or from a target race, or set manually.
 * 2. Mesocycle: load weeks + 1 recovery week (3:1 or 2:1).
 * 3. Microcycle: weekday template per phase → session type + target duration.
 * 4. Session: picked from the workout library and fitted to the target duration.
 */

import { LIBRARY_WORKOUTS } from '../data/workoutLibrary';

export const PHASES = {
  transition:  { label: 'Transition', season: 'Automne', desc: 'Repos actif, plaisir, pas de structure.' },
  base:        { label: 'Base', season: 'Hiver', desc: 'Volume Z2, force, tempo. Garder les sprints courts.' },
  build:       { label: 'Construction', season: 'Printemps', desc: 'Seuil et VO2, charge qui monte.' },
  competition: { label: 'Compétition', season: 'Été', desc: 'Maintenir, spécifique course, récupérer entre les courses.' },
  peak:        { label: 'Pic de forme', season: 'Objectif', desc: 'Qualité haute, volume réduit avant l’objectif.' },
  taper:       { label: 'Affûtage', season: 'Objectif', desc: 'Dernière semaine : fraîcheur, déblocages.' },
};

export const PHASE_ORDER = ['transition', 'base', 'build', 'competition', 'peak', 'taper'];

export const DEFAULT_SEASON_CONFIG = {
  mode: 'auto',        // 'auto' | 'manual'
  phase: 'base',       // used in manual mode
  phaseStart: null,    // YYYY-MM-DD, manual mode
  cycle: '3:1',        // '3:1' | '2:1'
  targetDate: null,    // A-race date YYYY-MM-DD
  targetName: '',
  cycleStart: null,    // YYYY-MM-DD — "new cycle" restarts week counting (and progression) here
  cycleFocus: 'auto',  // 'auto' (athlete profile weaknesses) | sprint | punch | vo2max | threshold
  dayOverrides: {},    // { 'YYYY-MM-DD': { type, minutes } } — days the athlete changed by hand
};

export const CYCLE_FOCUS = {
  auto: 'Auto (profil)',
  sprint: 'Sprint / explosivité',
  punch: 'Relances / course',
  vo2max: 'VO2 max',
  threshold: 'Seuil / grimpe',
};

// Calendar phases (month/day starts), French road season: races Mar → Sep.
const CALENDAR = [
  { phase: 'transition', from: [10, 1] },
  { phase: 'base', from: [11, 16] },
  { phase: 'build', from: [2, 1] },
  { phase: 'competition', from: [4, 1] },
];

function parseDay(key) {
  return new Date(`${key}T00:00:00`);
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}

function mondayOf(d) {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
}

function calendarPhase(date) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const starts = CALENDAR.map(c => ({ ...c, md: c.from[0] * 100 + c.from[1] })).sort((a, b) => a.md - b.md);
  let current = starts[starts.length - 1];
  for (const s of starts) if (md >= s.md) current = s;

  // start date of that phase (may be in the previous year)
  let year = date.getFullYear();
  if (current.md > md) year -= 1;
  const start = new Date(year, current.from[0] - 1, current.from[1]);
  return { phase: current.phase, start };
}

/**
 * A phase picked by hand (or by a scheduled cycle) doesn't last forever: it ends
 * when the road calendar moves to its next phase after it was started, unless an
 * A-race is still ahead; and after 20 weeks in any case.
 */
function manualExpired(cfg, today, todayKey) {
  if (!cfg.phaseStart) return false;
  const start = parseDay(cfg.phaseStart);
  if ((today - start) / (7 * 86400000) > 20) return true;
  const targetAhead = cfg.targetDate && cfg.targetDate > todayKey;
  return !targetAhead && start < calendarPhase(today).start;
}

const SEASONS = [
  { key: 'winter', label: 'Hiver', from: [12, 21] },
  { key: 'spring', label: 'Printemps', from: [3, 20] },
  { key: 'summer', label: 'Été', from: [6, 21] },
  { key: 'autumn', label: 'Automne', from: [9, 22] },
];

/** The real season for a date (northern hemisphere), independent of the training phase. */
export function seasonOf(date = new Date()) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  let cur = SEASONS[0];
  for (const s of SEASONS) if (md >= s.from[0] * 100 + s.from[1]) cur = s;
  if (md >= 1221) cur = SEASONS[0];
  return cur;
}

/**
 * Resolve today's season position.
 * Returns { phase, source, phaseStart, weekInPhase, weekInCycle, cycleLen, isRecoveryWeek, daysToTarget, reason }
 */
export function getSeasonState(config = DEFAULT_SEASON_CONFIG, today = new Date()) {
  const cfg = { ...DEFAULT_SEASON_CONFIG, ...config };
  const todayKey = dayKey(today);
  let phase, phaseStart, source, reason;

  const daysToTarget = cfg.targetDate && cfg.targetDate >= todayKey ? daysBetween(todayKey, cfg.targetDate) : null;

  if (daysToTarget != null && daysToTarget <= 7) {
    phase = 'taper'; source = 'target';
    phaseStart = new Date(parseDay(cfg.targetDate).getTime() - 7 * 86400000);
    reason = `${cfg.targetName || 'Objectif'} dans ${daysToTarget} j`;
  } else if (daysToTarget != null && daysToTarget <= 21) {
    phase = 'peak'; source = 'target';
    phaseStart = new Date(parseDay(cfg.targetDate).getTime() - 21 * 86400000);
    reason = `${cfg.targetName || 'Objectif'} dans ${daysToTarget} j`;
  } else if (cfg.mode === 'manual' && cfg.phase && !manualExpired(cfg, today, todayKey)) {
    phase = cfg.phase; source = 'manual';
    phaseStart = cfg.phaseStart ? parseDay(cfg.phaseStart) : mondayOf(today);
    reason = cfg.targetDate && cfg.targetDate > todayKey ? `Préparation de ${cfg.targetName || 'ton objectif'}` : 'Phase choisie manuellement';
  } else {
    const cal = calendarPhase(today);
    phase = cal.phase; phaseStart = cal.start; source = 'calendar';
    reason = `${seasonOf(today).label}, calendrier route`;
  }

  const cycleLen = cfg.cycle === '2:1' ? 3 : 4;
  // A manually started cycle takes over week counting once it is inside the current phase.
  const cycleStartDay = cfg.cycleStart && cfg.cycleStart <= todayKey ? parseDay(cfg.cycleStart) : null;
  const anchor = cycleStartDay && cycleStartDay > phaseStart ? cycleStartDay : phaseStart;
  const weekInPhase = Math.max(0, Math.round((mondayOf(today) - mondayOf(anchor)) / (7 * 86400000)));
  const weekInCycle = (weekInPhase % cycleLen) + 1;
  // No recovery week during taper/peak/transition: they are already unloading phases.
  const isRecoveryWeek = weekInCycle === cycleLen && !['taper', 'peak', 'transition'].includes(phase);

  return { phase, source, reason, phaseStart, cycleStart: anchor, weekInPhase: weekInPhase + 1, weekInCycle, cycleLen, isRecoveryWeek, daysToTarget };
}

// ── Weekday templates (index 0 = Monday) ──────────────────────────────────────
// [trainingType, minutes]; 'rest' = day off.
const TEMPLATES = {
  transition: [['rest', 0], ['endurance', 60], ['rest', 0], ['endurance', 60], ['rest', 0], ['endurance', 90], ['endurance', 60]],
  base: [['rest', 0], ['force', 75], ['endurance', 90], ['tempo', 90], ['recovery', 45], ['endurance', 180], ['endurance', 120]],
  build: [['rest', 0], ['threshold', 90], ['endurance', 90], ['vo2', 75], ['recovery', 45], ['durability', 150], ['sweetspot', 90]],
  competition: [['rest', 0], ['race_sim', 90], ['endurance', 90], ['threshold', 75], ['recovery', 45], ['openers', 45], ['race', 0]],
  peak: [['rest', 0], ['vo2', 75], ['endurance', 75], ['race_sim', 75], ['recovery', 45], ['openers', 45], ['endurance', 120]],
  taper: [['rest', 0], ['vo2', 60], ['endurance', 60], ['openers', 45], ['rest', 0], ['openers', 45], ['race', 0]],
};

const LIMITER_SWAP = {
  // weakness → session type that replaces the 2nd quality day in build/competition
  sprint: 'sprint', punch: 'race_sim', vo2max: 'vo2', threshold: 'threshold', climbing: 'threshold',
};

/**
 * Session the plan wants on a given date.
 * opts: { weaknesses: [], hasRaceThatDay, hasRaceTomorrow, override: { type, minutes },
 *         responder: { volume, intensity, rest } traits in -1|0|1 (services/responderProfile) }
 * A race on the day beats everything; a hand-made override beats the template.
 */
export function templateForDay(state, date, opts = {}) {
  const idx = (date.getDay() + 6) % 7;
  let [type, minutes] = TEMPLATES[state.phase]?.[idx] || ['endurance', 60];

  if (opts.hasRaceThatDay) return { type: 'race', minutes: 0 };
  if (opts.override?.type) {
    return { type: opts.override.type, minutes: opts.override.type === 'rest' ? 0 : Number(opts.override.minutes) || 60, overridden: true };
  }
  if (opts.hasRaceTomorrow) return { type: 'openers', minutes: 45 };
  if (type === 'race') { type = 'endurance'; minutes = 150; } // no race planned this Sunday
  if (type === 'openers' && !opts.hasRaceTomorrow && state.phase === 'competition') { type = 'durability'; minutes = 150; }

  const limiter = (opts.weaknesses || []).map(w => LIMITER_SWAP[w]).find(Boolean);
  if (limiter && idx === 3 && ['build', 'competition'].includes(state.phase)) type = limiter;

  // Rider's measured response to rest days (responder profile).
  const rest = opts.responder?.rest || 0;
  if (rest > 0 && idx === 4 && type === 'recovery') { type = 'rest'; minutes = 0; }
  if (rest < 0 && idx === 0 && type === 'rest' && state.phase !== 'transition') { type = 'recovery'; minutes = 45; }

  if (state.isRecoveryWeek) {
    if (!['rest', 'recovery'].includes(type)) {
      type = 'endurance';
      minutes = Math.round(Math.min(minutes || 60, idx === 5 ? 120 : 75) * 0.8);
    }
  } else if (state.weekInCycle > 1 && minutes && type === 'endurance') {
    // progressive overload inside the mesocycle: +10% per load week on endurance volume.
    // Quality sessions progress through workout levels instead (see progressionFor).
    minutes = Math.round(minutes * (1 + 0.1 * (state.weekInCycle - 1)));
  }
  // Rider's measured response to volume: ±15 % endurance time on load weeks.
  const volume = opts.responder?.volume || 0;
  if (volume && !state.isRecoveryWeek && ['endurance', 'durability'].includes(type)) {
    minutes = Math.max(45, Math.round(minutes * (1 + 0.15 * volume)));
  }

  return { type, minutes: Math.round(minutes / 5) * 5 };
}

/**
 * Where we are in the progression.
 *  level    — 1 on the first load week of the phase, +1 each load week, +1 per mesocycle.
 *  rotation — changes each mesocycle so the session family (e.g. 30/15 vs 4×4) rotates.
 */
export function progressionFor(state, responder = null) {
  const mesoIndex = Math.floor((state.weekInPhase - 1) / state.cycleLen);
  if (state.isRecoveryWeek) return { level: 1, rotation: mesoIndex, mesoIndex };
  // Rider's measured response to Z5-Z7 work shifts quality sessions one level.
  const level = Math.max(1, mesoIndex + state.weekInCycle + (responder?.intensity || 0));
  return { level, rotation: mesoIndex, mesoIndex };
}

// ── Bodyweight strength (off the bike) ────────────────────────────────────────
// Sessions per week by phase: 2 to build strength, 1 is enough to maintain in
// season (Rønnestad 2010), none in the last week before the A-race.
// The first kind is the demanding one (legs / jumps), the second is core.
const STRENGTH_PLAN = {
  transition: ['legs', 'core'],
  base: ['legs', 'core'],
  build: ['legs', 'plyo'],
  competition: ['plyo'],
  peak: ['core'],
  taper: [],
};

const HARD_OR_LONG = (d) => d && (['threshold', 'vo2', 'anaerobic', 'sprint', 'race_sim', 'race', 'force', 'sweetspot'].includes(d.type) || d.minutes >= 120);

/**
 * Strength days for a week of templates ([{ type, minutes }], Monday first): the
 * lowest-volume days — short rides first, then spare rest days — never two days in a
 * row, never on or the day before a race. The demanding session goes where the
 * next day is easiest; core goes before the hard or long day.
 * Returns one kind (or null) per day.
 */
export function strengthForWeek(state, days, raceFlags = []) {
  let kinds = STRENGTH_PLAN[state.phase] || [];
  if (state.isRecoveryWeek) kinds = kinds.length ? ['core'] : [];
  // Rest days come last, and only when the week keeps another full day off.
  const restDays = days.filter(d => d.type === 'rest' && !d.unavailable).length;
  const score = (d) => (d.type === 'rest' ? 1000 : d.minutes);
  const order = days.map((d, i) => i)
    .filter(i => !raceFlags[i]?.today && !raceFlags[i]?.tomorrow && days[i].type !== 'race' && !days[i].unavailable)
    .filter(i => days[i].type !== 'rest' || restDays >= 2)
    .sort((a, b) => score(days[a]) - score(days[b]) || a - b);
  const picks = [];
  for (const i of order) {
    if (picks.length >= kinds.length) break;
    if (picks.some(j => Math.abs(j - i) < 2)) continue;
    picks.push(i);
  }
  // Demanding kind on the pick followed by the easiest day.
  const nextLoad = (i) => (HARD_OR_LONG(days[i + 1]) ? 2 : days[i + 1]?.type === 'rest' ? 0 : 1);
  picks.sort((a, b) => nextLoad(a) - nextLoad(b) || a - b);
  const out = days.map(() => null);
  picks.forEach((i, n) => { out[i] = kinds[n]; });
  return out;
}

/** Strength level: +1 per mesocycle in the phase, back to 1 on recovery weeks. */
export function strengthLevel(state) {
  if (state.isRecoveryWeek) return 1;
  return Math.min(3, 1 + Math.floor((state.weekInPhase - 1) / state.cycleLen));
}

const QUALITY = ['threshold', 'vo2', 'sweetspot', 'anaerobic', 'sprint', 'race_sim', 'force', 'tempo', 'durability'];
const HARD_DAY = (d) => d && (QUALITY.includes(d.type) || d.type === 'race');

/**
 * The athlete's availability: { 'YYYY-MM-DD': { off: true } | { minutes: 60 } }.
 * A day off becomes rest; its quality session moves to another free day of the
 * week (an easy or rest day, not next to another hard day, later days first,
 * never in the past); with no such day it is dropped rather than stacked. A time
 * given time sets the day's length. Races are never touched. Mutates `days`.
 */
export function applyAvailability(days, availability = {}, today = null) {
  if (!availability) return days;
  const capOf = (d) => num0(availability[d.date]?.minutes);
  days.forEach((d, i) => {
    const a = availability[d.date];
    if (!a?.off || d.type === 'race' || d._race?.today) return;
    const moved = { type: d.type, minutes: d.minutes };
    Object.assign(d, { type: 'rest', minutes: 0, unavailable: true });
    if (!QUALITY.includes(moved.type)) return;
    const order = days.map((_, j) => j).filter(j => j !== i)
      .sort((x, y) => (x > i) === (y > i) ? Math.abs(x - i) - Math.abs(y - i) : (x > i ? -1 : 1));
    const target = order.find(j => {
      const t = days[j];
      // An easy day or a rest day (the day off itself keeps the week's rest), never in the past.
      if (t.unavailable || t._race?.today || t._race?.tomorrow || !['endurance', 'recovery', 'rest'].includes(t.type)) return false;
      if (today && t.date < today) return false;
      if (HARD_DAY(days[j - 1]) || HARD_DAY(days[j + 1])) return false;
      const cap = capOf(t);
      return !cap || cap >= 45;
    });
    if (target == null) { d.dropped = moved.type; return; }
    const t = days[target];
    Object.assign(t, { type: moved.type, minutes: moved.minutes, movedFrom: d.date });
    d.movedTo = t.date;
  });
  // Time available = the session's length (longer endurance when there's more time,
  // shorter when there's less); a recovery ride is never stretched.
  days.forEach(d => {
    const cap = capOf(d);
    if (!cap || d.unavailable || d.type === 'rest' || d.type === 'race') return;
    const minutes = d.type === 'recovery' ? Math.min(d.minutes, cap) : cap;
    if (minutes !== d.minutes) Object.assign(d, { minutes, capped: cap });
  });
  return days;
}

function num0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function weekPlan(state, fromDate = new Date(), opts = {}) {
  const monday = mondayOf(fromDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const key = dayKey(d);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const ctx = {
      weaknesses: opts.weaknesses,
      hasRaceThatDay: opts.raceDays?.has(key),
      hasRaceTomorrow: opts.raceDays?.has(dayKey(next)),
      override: opts.overrides?.[key],
      responder: opts.responder,
    };
    return { date: key, ...templateForDay(state, d, ctx), _race: { today: ctx.hasRaceThatDay, tomorrow: ctx.hasRaceTomorrow } };
  });
  applyAvailability(days, opts.availability, opts.today);
  const auto = strengthForWeek(state, days, days.map(d => d._race));
  // A hand edit wins: false = none, a kind = that kind, true = the phase's kind (core by default).
  return days.map(({ _race, ...d }, i) => {
    const o = opts.overrides?.[d.date]?.strength;
    const strength = o === false ? null : typeof o === 'string' ? o : o === true ? (auto[i] || 'core') : auto[i];
    return { ...d, strength };
  });
}

// ── Library selection & fitting ───────────────────────────────────────────────

export function blocksMinutes(blocks = []) {
  return blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0);
}

const isEdge = (b) => /warm|cool|échauff|retour/i.test(b.label || '');
const isFiller = (b) => ['Z1', 'Z2'].includes(b.zone) && !isEdge(b) && (Number(b.durationMin) || 0) >= 5;
const isWork = (b) => !['Z1', 'Z2'].includes(b.zone) && !isEdge(b);

/** Stretch or shrink the longest Z1/Z2 filler to hit target minutes. */
export function fitToDuration(blocks, targetMin) {
  const out = blocks.map(b => ({ ...b }));
  let diff = targetMin - blocksMinutes(out);
  if (Math.abs(diff) < 3) return out;

  const fillers = out.map((b, i) => ({ b, i })).filter(x => isFiller(x.b)).sort((a, b) => b.b.durationMin - a.b.durationMin);
  if (diff > 0) {
    if (fillers.length) fillers[0].b.durationMin = Math.round(fillers[0].b.durationMin + diff);
    else {
      const cdIdx = out.findIndex(b => /cool/i.test(b.label || ''));
      out.splice(cdIdx >= 0 ? cdIdx : out.length, 0, { label: 'Endurance', durationMin: Math.round(diff), zone: 'Z2' });
    }
    return out;
  }

  // shrink fillers down to 5 min each
  for (const f of fillers) {
    if (diff >= 0) break;
    const cut = Math.min(f.b.durationMin - 5, -diff);
    f.b.durationMin = Math.round(f.b.durationMin - cut);
    diff += cut;
  }
  // still too long → drop trailing work reps
  return diff < -3 ? dropReps(out, Math.round(-diff)) : out;
}

/**
 * Hit the target duration: stretch/shrink Z1–Z2 fillers, then shorten warm-up
 * (down to 10 min) and cool-down (down to 5 min), then drop trailing reps.
 */
export function shrinkToFit(blocks, targetMin) {
  let out = fitToDuration(blocks, targetMin);
  let over = blocksMinutes(out) - targetMin;
  // fitToDuration may already have dropped a long rep: top back up with Z2.
  if (over < -3) return fitToDuration(out, targetMin);
  if (over <= 3) return out;
  out = out.map(b => {
    if (over <= 0 || !isEdge(b)) return b;
    const floor = /warm|échauff/i.test(b.label || '') ? 10 : 5;
    const cut = Math.min(Math.max(0, (Number(b.durationMin) || 0) - floor), over);
    over -= cut;
    return { ...b, durationMin: Math.round((Number(b.durationMin) || 0) - cut) };
  });
  if (over <= 3) return out;
  out = dropReps(out, Math.round(over));
  // A long rep can take more than needed: top back up with Z2.
  return blocksMinutes(out) < targetMin - 3 ? fitToDuration(out, targetMin) : out;
}

/** Remove work reps (and their recoveries) from the end of the main set. */
export function dropReps(blocks, minutesToCut, minKeep = 1) {
  const out = blocks.map(b => ({ ...b }));
  let cut = 0;
  const workCount = () => out.filter(isWork).length;
  while (cut < minutesToCut && workCount() > minKeep) {
    let last = -1;
    out.forEach((b, i) => { if (isWork(b)) last = i; });
    if (last < 0) break;
    cut += Number(out[last].durationMin) || 0;
    out.splice(last, 1);
    const prev = out[last - 1];
    if (prev && !isWork(prev) && !isEdge(prev) && /recover|récup|set/i.test(prev.label || '')) {
      cut += Number(prev.durationMin) || 0;
      out.splice(last - 1, 1);
    }
  }
  return out;
}

export function countWork(blocks) {
  return blocks.filter(isWork).length;
}

/** Keep ~ratio of the work reps. */
export function keepRepRatio(blocks, ratio) {
  const n = countWork(blocks);
  const keep = Math.max(1, Math.ceil(n * ratio));
  if (keep >= n) return blocks.map(b => ({ ...b }));
  const out = blocks.map(b => ({ ...b }));
  while (countWork(out) > keep) {
    const before = countWork(out);
    const next = dropReps(out, 0.01, keep);
    out.length = 0; out.push(...next);
    if (countWork(out) === before) break;
  }
  return out;
}

/** Lower every work block by one zone (Z7/Z6 sprints stay — they are short and neural). */
export function lowerOneZone(blocks) {
  return blocks.map(b => {
    if (!isWork(b)) return { ...b };
    const z = parseInt(String(b.zone).slice(1), 10);
    if (z >= 6 || !Number.isFinite(z)) return { ...b };
    return { ...b, zone: `Z${Math.max(2, z - 1)}` };
  });
}

const NO_FAMILY_ROTATION = ['endurance', 'recovery', 'openers'];

/**
 * Pick a library workout for a session type.
 *  - Progressive families (quality sessions): family rotates per mesocycle, level = progression.
 *    Natural duration is kept (only extended with Z2 if the day has more time).
 *  - Otherwise: closest duration, fitted to the target.
 */
export function pickWorkout(type, minutes, phase, { library = LIBRARY_WORKOUTS, level = 1, rotation = 0, exclude = [] } = {}) {
  const rides = library.filter(w => (w.type || 'Ride') === 'Ride' && w.kind !== 'race' && w.blocks?.length);
  let pool = rides.filter(w => w.trainingType === type && (!w.phases || w.phases.includes(phase)));
  if (!pool.length) pool = rides.filter(w => w.trainingType === type);
  if (!pool.length) pool = rides.filter(w => w.trainingType === 'endurance');
  const filtered = pool.filter(w => !exclude.includes(w.id) && !exclude.includes(w.family));
  if (filtered.length) pool = filtered;

  const familyNames = [...new Set(pool.filter(w => w.family).map(w => w.family))].sort();
  if (familyNames.length && !NO_FAMILY_ROTATION.includes(type)) {
    const fam = familyNames[Math.abs(rotation) % familyNames.length];
    const levels = pool.filter(w => w.family === fam).sort((a, b) => a.level - b.level);
    let idx = Math.max(0, Math.min(levels.length - 1, level - 1));
    // The time available wins: step down to the highest level that fits.
    if (minutes) while (idx > 0 && blocksMinutes(levels[idx].blocks) > minutes + 5) idx--;
    const w = levels[idx];
    const natural = blocksMinutes(w.blocks);
    let blocks = w.blocks.map(b => ({ ...b }));
    if (minutes && minutes > natural + 5) blocks = fitToDuration(w.blocks, minutes);
    else if (minutes && natural > minutes + 5) blocks = shrinkToFit(w.blocks, minutes);
    return { ...w, blocks, ...(idx !== level - 1 && level - 1 < levels.length ? { steppedDown: true } : {}) };
  }

  const ranked = [...pool].sort((a, b) =>
    Math.abs(blocksMinutes(a.blocks) - minutes) - Math.abs(blocksMinutes(b.blocks) - minutes));
  const top = ranked.slice(0, Math.min(3, ranked.length));
  const w = top[Math.abs(rotation) % top.length];
  return { ...w, blocks: minutes ? shrinkToFit(w.blocks, minutes) : w.blocks.map(b => ({ ...b })) };
}

/** Same family, next level — for a "next week" preview. */
export function nextLevelOf(workout, library = LIBRARY_WORKOUTS) {
  if (!workout?.family || workout.level >= workout.levelCount) return null;
  return library.find(w => w.family === workout.family && w.level === workout.level + 1) || null;
}
