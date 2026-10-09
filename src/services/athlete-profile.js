// Athlete profile — stored in localStorage, drives all personalized suggestions

export const RACE_TYPES = {
  criterium:    { label: 'Critérium / Circuit', description: 'Courses courtes, explosives, répétées chaque semaine', weeklyRaces: true },
  road_race:    { label: 'Course sur route', description: 'Épreuves FFC/FSGT, 1 à 4 fois par mois', weeklyRaces: false },
  cyclosportive:{ label: 'Cyclosportive', description: '1 à 2 grandes épreuves par an (Marmotte, Étape…)', weeklyRaces: false },
  gravel:       { label: 'Gravel / Tout-terrain', description: 'Épreuves variées, autonomie, endurance', weeklyRaces: false },
  track:        { label: 'Piste', description: 'Vitesse, explosivité, efforts courts', weeklyRaces: true },
  mtb:          { label: 'VTT / XC', description: 'Technique, explosivité, dénivelé', weeklyRaces: false },
};

export const WEAKNESSES = {
  sprint:      { label: 'Sprint / Finish', icon: 'bolt', training: 'intervals', focus: 'neuromuscular power, <30s efforts' },
  climbing:    { label: 'Grimpeur / Cols', icon: 'mountain', training: 'threshold', focus: 'sustained power at threshold, VAM' },
  threshold:   { label: 'Seuil / Tempo', icon: 'fire', training: 'threshold', focus: '20-40min FTP intervals' },
  vo2max:      { label: 'VO2max / 5min', icon: 'wind', training: 'intervals', focus: '3-8min efforts at 110-120% FTP' },
  endurance:   { label: 'Endurance / Base aérobie', icon: 'heart', training: 'endurance', focus: 'long Z2, fat oxidation' },
  punch:       { label: 'Explosivité / Relances', icon: 'burst', training: 'intervals', focus: 'short hard efforts after tempo' },
  recovery:    { label: 'Récupération / Répétition', icon: 'recover', training: 'endurance', focus: 'aerobic efficiency, low HR training' },
  descending:  { label: 'Descente / Technique', icon: 'mountain', training: 'skills', focus: 'bike handling, confidence' },
};

export const SEASON_PHASES = {
  base:        { label: 'Base (hiver)', description: 'Volume aérobie, développer les fondations', intensity: 0.7 },
  build:       { label: 'Construction', description: 'Augmentation charge, seuil, force', intensity: 0.85 },
  peak:        { label: 'Pic de forme', description: 'Séances de qualité, réduction volume', intensity: 0.95 },
  competition: { label: 'Compétition', description: 'Maintien, récupération entre courses', intensity: 1.0 },
  transition:  { label: 'Transition', description: 'Repos actif après saison', intensity: 0.5 },
};

const STORAGE_KEY = 'apex-athlete-profile';

export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}

export function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function isProfileComplete(profile) {
  return profile && profile.raceType && profile.weaknesses?.length > 0 && profile.phase;
}

// ── Core suggestion engine ────────────────────────────────────────────────────

export function buildWeekPlan({ profile, ctl, atl, tsb, avgWeeklyTss, activities, plannedEvents, wellness, weekDates, hoursAvailable }) {
  const raceType   = profile.raceType || 'road_race';
  const weaknesses = profile.weaknesses || [];
  const phase      = profile.phase || 'build';
  const isWeeklyRacer = RACE_TYPES[raceType]?.weeklyRaces;
  const today      = weekDates[0] ? new Date(weekDates[0]) : new Date();

  const reasons = [];
  const warnings = [];

  // ── Detect week context ──
  const hasRaceThisWeek = (plannedEvents || []).some(e => {
    const d = (e.start_date_local || '').slice(0, 10);
    return (e.kind === 'race' || (e.title || '').toLowerCase().match(/course|race|critérium/)) &&
      weekDates.includes(d);
  });

  const upcomingRace = (plannedEvents || [])
    .filter(e => {
      const d = (e.start_date_local || '').slice(0, 10);
      return (e.kind === 'race' || (e.title || '').toLowerCase().match(/course|race/)) && d > weekDates[0];
    })
    .sort((a, b) => (a.start_date_local || '').localeCompare(b.start_date_local || ''))[0];

  const daysToRace = upcomingRace
    ? Math.round((new Date((upcomingRace.start_date_local || '').slice(0, 10)) - new Date(weekDates[0])) / 86400000)
    : null;

  // ── Consecutive hard weeks detection ──
  const lastWeekTss = getWeekTss(activities, -7, 0);
  const prev2Tss    = getWeekTss(activities, -14, -7);
  const prev3Tss    = getWeekTss(activities, -21, -14);
  const consecutiveHard = [prev3Tss, prev2Tss, lastWeekTss].filter(t => t >= avgWeeklyTss * 0.85).length;

  // ── Determine week TYPE ──
  let weekType = 'build';

  if (isWeeklyRacer && hasRaceThisWeek) {
    weekType = 'race_week';
    reasons.push(`Course cette semaine → prépa spécifique : activation + récup post-course`);
    reasons.push(`En tant que ${RACE_TYPES[raceType].label}, les courses FONT partie de l'entraînement`);
  } else if (daysToRace !== null && daysToRace <= 7) {
    weekType = 'taper';
    reasons.push(`Course "${upcomingRace?.title}" dans ${daysToRace}j → affûtage : -40% volume, garder l'intensité`);
  } else if (daysToRace !== null && daysToRace <= 14) {
    weekType = 'pre_race';
    reasons.push(`Course dans ${daysToRace}j → semaine de consolidation avant affûtage`);
  } else if (tsb < -25 || consecutiveHard >= 3) {
    weekType = 'recovery';
    if (tsb < -25) reasons.push(`TSB = ${tsb} (très fatigué) → récupération obligatoire`);
    if (consecutiveHard >= 3) reasons.push(`${consecutiveHard} semaines de charge élevée → semaine de récupération planifiée`);
  } else if (tsb < -10) {
    weekType = 'maintain';
    reasons.push(`TSB = ${tsb} → charge maintenue, pas d'augmentation`);
  } else if (phase === 'base') {
    weekType = 'base';
    reasons.push(`Phase de base → priorité volume Z2, développement aérobie`);
  } else if (tsb > 5) {
    weekType = 'build';
    reasons.push(`TSB = +${tsb} → tu es frais, moment idéal pour une semaine de charge`);
  } else {
    weekType = 'build';
    reasons.push(`TSB = ${tsb}, progression régulière → +8% vs charge moyenne`);
  }

  // ── Weakness-based session priorities ──
  const weaknessSessions = weaknesses.slice(0, 2).map(w => WEAKNESSES[w]);
  if (weaknesses.length > 0) {
    const wLabels = weaknesses.map(w => WEAKNESSES[w]?.label).filter(Boolean).join(', ');
    reasons.push(`Faiblesses ciblées : ${wLabels} → séances spécifiques incluses`);
  }

  reasons.push(`Charge 4 semaines : ${avgWeeklyTss} TSS/sem · CTL ${ctl} · ATL ${atl}`);
  if (phase) reasons.push(`Phase actuelle : ${SEASON_PHASES[phase]?.label}`);

  // ── Build the 7-day session plan ──
  const sessionsByType = buildSessionPlan(weekType, raceType, weaknesses, phase, hasRaceThisWeek, daysToRace, weekDates, plannedEvents, hoursAvailable);

  return { weekType, reasons, warnings, sessions: sessionsByType };
}

function getWeekTss(activities, daysFrom, daysTo) {
  const now = new Date();
  const from = new Date(now); from.setDate(now.getDate() + daysFrom);
  const to   = new Date(now); to.setDate(now.getDate() + daysTo);
  const fStr = from.toISOString().slice(0, 10);
  const tStr = to.toISOString().slice(0, 10);
  return Math.round((activities || [])
    .filter(a => { const d = (a.start_date_local || a.date || '').slice(0, 10); return d >= fStr && d < tStr; })
    .reduce((s, a) => s + (a.icu_training_load || 0), 0));
}

// Session plans by week type and race type
function buildSessionPlan(weekType, raceType, weaknesses, phase, hasRaceThisWeek, daysToRace, weekDates, plannedEvents, hoursAvailable) {
  const isCrit    = raceType === 'criterium' || raceType === 'track';
  const isCyclo   = raceType === 'cyclosportive' || raceType === 'gravel';
  const weakPrimary = weaknesses[0];

  // Base templates: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  const plans = {
    race_week: isCrit
      ? ['activation', null, 'recovery', null, 'activation', 'race', 'recovery']
      : ['endurance', null, 'activation', null, 'recovery', 'race', 'recovery'],

    taper: ['endurance', null, 'activation', null, 'recovery', null, 'recovery'],

    pre_race: isCrit
      ? ['endurance', 'intervals_short', null, 'intervals_short', 'recovery', null, 'endurance']
      : ['endurance', 'threshold', null, 'intervals', 'recovery', null, 'long'],

    recovery: ['recovery', null, 'endurance_easy', null, 'recovery', null, 'endurance_easy'],

    maintain: isCrit
      ? ['endurance', 'intervals_short', null, 'intervals_short', 'recovery', null, 'endurance']
      : ['endurance', 'threshold', null, 'intervals', 'recovery', null, 'long'],

    base: ['endurance', null, 'endurance', null, 'endurance', null, 'long'],

    build: isCrit
      ? ['endurance', 'intervals_short', null, 'intervals_short', 'recovery', 'endurance', null]
      : isCyclo
        ? ['endurance', 'threshold', null, 'intervals', 'recovery', null, 'long']
        : ['endurance', 'threshold', null, 'intervals', 'recovery', null, 'long'],
  };

  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const plan = plans[weekType] || plans.build;

  // Apply weakness override: insert a specific weakness session if not already addressed
  if (weakPrimary && weekType === 'build') {
    const wInfo = WEAKNESSES[weakPrimary];
    if (wInfo?.training === 'intervals' && !plan.includes('intervals') && !plan.includes('intervals_short')) {
      plan[3] = 'intervals'; // Thursday
    } else if (wInfo?.training === 'threshold' && !plan.includes('threshold')) {
      plan[1] = 'threshold'; // Tuesday
    }
  }

  return plan.map((sessionType, i) => {
    if (!sessionType) return null;
    const dateKey = weekDates[i];
    if (!dateKey) return null;

    // Check if day already has a planned event
    const dayEvents = (plannedEvents || []).filter(e => (e.start_date_local || '').slice(0, 10) === dateKey);
    if (dayEvents.some(e => e.planned || e.kind === 'race')) return null;

    const session = SESSION_DEFINITIONS[sessionType];
    if (!session) return null;

    // Hours available for this day (0=Sun,1=Mon... but plan index i is Mon=0)
    const dowMap = [1,2,3,4,5,6,0]; // plan index → day of week
    const dow = dowMap[i];
    const h = hoursAvailable?.[dow];
    const hoursNote = h ? ` · ${h < 1 ? '30min' : `${h}h`} dispo` : '';

    // Weakness-specific justification
    let reason = session.reason + hoursNote;
    if (sessionType === 'intervals' && weakPrimary && WEAKNESSES[weakPrimary]?.training === 'intervals') {
      reason = `Ciblé faiblesse "${WEAKNESSES[weakPrimary]?.label}" — ${WEAKNESSES[weakPrimary]?.focus}${hoursNote}`;
    } else if (sessionType === 'threshold' && weakPrimary === 'threshold') {
      reason = `Ciblé faiblesse "Seuil" — efforts 20-40min à 90-95% FTP${hoursNote}`;
    }

    // Adjust session type if not enough time (e.g. long needs 3h+, intervals needs 1h min)
    let finalSessionType = sessionType;
    if (h && h < 1 && sessionType !== 'recovery') finalSessionType = 'recovery';
    else if (h && h < 1.5 && sessionType === 'long') finalSessionType = 'endurance';
    else if (h && h < 1 && sessionType === 'intervals') finalSessionType = 'endurance_easy';

    const finalSession = SESSION_DEFINITIONS[finalSessionType] || session;

    return { dateKey, dayLabel: dayNames[i], sessionType: finalSessionType, reason, accepted: true, session: finalSession };
  }).filter(Boolean);
}

export const SESSION_DEFINITIONS = {
  endurance:       { label: 'Endurance Z2', color: '#22c55e', type: 'Workout', kind: 'training', duration: '1h30-2h30', reason: 'Base aérobie Z2 — développe les mitochondries et l\'économie à basse intensité' },
  endurance_easy:  { label: 'Sortie facile', color: '#86efac', type: 'Workout', kind: 'training', duration: '1h-1h30', reason: 'Récupération active — maintient le flux sanguin, accélère la récupération musculaire' },
  threshold:       { label: 'Seuil FTP', color: '#f97316', type: 'Workout', kind: 'training', duration: '1h-1h30', reason: 'Développe la puissance au seuil — 2×20min ou 3×15min à 90-95% FTP' },
  intervals:       { label: 'Intervalles VO2', color: '#ef4444', type: 'Workout', kind: 'training', duration: '1h-1h15', reason: 'Stimule VO2max — 5×5min à 110-120% FTP, récupération 2min' },
  intervals_short: { label: 'Efforts courts', color: '#f97316', type: 'Workout', kind: 'training', duration: '45min-1h', reason: 'Puissance anaérobie/explosivité — 8×30s max + 2min récup, spécifique critérium' },
  activation:      { label: 'Activation pré-course', color: '#f59e0b', type: 'Workout', kind: 'training', duration: '45min-1h', reason: 'Activation neuromusculaire — quelques efforts courts pour préparer le système sans fatiguer' },
  long:            { label: 'Longue sortie', color: '#22c55e', type: 'Workout', kind: 'training', duration: '3h-5h', reason: 'Volume aérobie long — économie d\'effort, oxydation des graisses, capacité à encaisser la durée' },
  recovery:        { label: 'Récupération active', color: '#94a3b8', type: 'Workout', kind: 'training', duration: '45min-1h', reason: 'Récupération active Z1 — sortie très légère pour éliminer les lactates sans ajouter de fatigue' },
  race:            { label: 'Course', color: '#f06060', type: 'Race', kind: 'race', duration: 'variable', reason: 'La course fait partie de la préparation — intensité maximale, compétition réelle' },
};
