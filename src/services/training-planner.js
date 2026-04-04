/**
 * Training Planner
 *
 * Pure computation module — no React, no side effects.
 * Produces a week prescription based on current PMC state, EF trend,
 * zone distribution and upcoming race calendar.
 */

import { buildRuleBasedWorkout } from './workout-rules.js';
import analytics from './analytics.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return 'YYYY-MM-DD' string for a given Date object.
 */
function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Return the next Monday >= today as a Date.
 */
function getNextMonday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay(); // 0=Sun, 1=Mon, …
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7 || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
  return monday;
}

/**
 * Parse a date string or Date to a plain Date at midnight local.
 */
function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  // 'YYYY-MM-DD' → local midnight
  const [y, m, day] = d.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, day);
}

/**
 * Difference in calendar days between two dates (b - a).
 */
function daysBetween(a, b) {
  const msPerDay = 86400000;
  return Math.round((parseDate(b) - parseDate(a)) / msPerDay);
}

// ─── Zone estimation from IF ────────────────────────────────────────────────

/**
 * Given a single activity, return estimated seconds per zone (Z1–Z7).
 * We only populate Z1–Z5 based on icu_intensity (IF); Z6/Z7 share the >Z5 bucket.
 */
function estimateZoneSeconds(activity) {
  const IF = activity.icu_intensity || 0;
  const totalSec = activity.moving_time || 0;
  const zones = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0 };

  if (totalSec === 0 || IF === 0) return zones;

  if (IF < 0.55) {
    zones.Z1 = totalSec;
  } else if (IF < 0.75) {
    zones.Z2 = totalSec * 0.70;
    zones.Z1 = totalSec * 0.30;
  } else if (IF < 0.90) {
    zones.Z3 = totalSec * 0.60;
    zones.Z2 = totalSec * 0.30;
    zones.Z1 = totalSec * 0.10;
  } else if (IF < 1.05) {
    zones.Z4 = totalSec * 0.50;
    zones.Z3 = totalSec * 0.30;
    zones.Z2 = totalSec * 0.20;
  } else {
    // IF > 1.05 — heavy Z5/Z6/Z7 work; split Z6+Z7 equally from the ">Z5" bucket
    zones.Z5 = totalSec * 0.20;
    zones.Z6 = totalSec * 0.10;
    zones.Z7 = totalSec * 0.10;
    zones.Z4 = totalSec * 0.40;
    zones.Z3 = totalSec * 0.20;
  }

  return zones;
}

/**
 * Sum zone seconds across an array of activities.
 */
function sumZones(activities) {
  const totals = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0 };
  for (const act of activities) {
    const z = estimateZoneSeconds(act);
    for (const k of Object.keys(totals)) totals[k] += z[k];
  }
  return totals;
}

// ─── TSS estimation per session type ────────────────────────────────────────

/**
 * Rough TSS estimate from session type and duration.
 * Based on typical IF for each type:
 *   rest:0, recovery:0.60, endurance:0.65, sweetspot:0.87,
 *   threshold:0.95, vo2:1.05, openers:0.75, race:1.00
 */
const TYPE_IF = {
  rest: 0,
  recovery: 0.60,
  endurance: 0.65,
  sweetspot: 0.87,
  threshold: 0.95,
  vo2: 1.05,
  openers: 0.75,
  race: 1.00,
};

function estimateTSS(type, durationMin) {
  if (!durationMin || durationMin === 0) return 0;
  const IF = TYPE_IF[type] || 0.65;
  // TSS = (duration_h * IF^2) * 100
  return Math.round((durationMin / 60) * IF * IF * 100);
}

// ─── Signal detection ────────────────────────────────────────────────────────

function detectSignals(wellness, activities, efTrend, tsb) {
  const signals = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── LOW_AEROBIC_BASE ──────────────────────────────────────────────────────
  // EF declining OR last 10 rides have > 35% time in Z3
  const last10Rides = activities
    .filter(a => a.type === 'Ride')
    .slice(-10);

  let lowAerobicBase = false;

  if (efTrend && efTrend.trendPct < -3) {
    lowAerobicBase = true;
  } else if (last10Rides.length >= 3) {
    const zones = sumZones(last10Rides);
    const totalSec = Object.values(zones).reduce((s, v) => s + v, 0);
    if (totalSec > 0 && zones.Z3 / totalSec > 0.35) {
      lowAerobicBase = true;
    }
  }

  if (lowAerobicBase) {
    signals.push({
      code: 'LOW_AEROBIC_BASE',
      label: 'Base aérobie',
      severity: 'warning',
      message: 'Base aérobie insuffisante — prioriser Z2',
    });
  }

  // ── OVERREACHING ──────────────────────────────────────────────────────────
  if (tsb < -28) {
    signals.push({
      code: 'OVERREACHING',
      label: 'Surmenage',
      severity: 'critical',
      message: 'Accumulation de fatigue critique — récupération nécessaire',
    });
  }

  // ── POOR_COMPLIANCE ───────────────────────────────────────────────────────
  // Last 4 rides with icu_intensity > 0.85 had avg intensity < 0.90 of expected (0.85 baseline → target 1.0)
  const hardRides = activities
    .filter(a => a.type === 'Ride' && (a.icu_intensity || 0) > 0.85)
    .slice(-4);

  if (hardRides.length >= 2) {
    const avgIF = hardRides.reduce((s, a) => s + (a.icu_intensity || 0), 0) / hardRides.length;
    // "Expected" for hard rides ≈ 0.95 threshold-level; poor compliance = avg < 0.90 * 0.95
    if (avgIF < 0.90 * 0.95) {
      signals.push({
        code: 'POOR_COMPLIANCE',
        label: 'Compliance',
        severity: 'warning',
        message: 'Compliance faible — réduire les cibles',
      });
    }
  }

  // ── LACKS_ANAEROBIC ───────────────────────────────────────────────────────
  // Last 3 weeks: < 3% time in Z6/Z7
  const threeWeeksAgo = new Date(today);
  threeWeeksAgo.setDate(today.getDate() - 21);

  const last3wActivities = activities.filter(a => {
    const d = parseDate(a.start_date_local);
    return d && d >= threeWeeksAgo;
  });

  if (last3wActivities.length > 0) {
    const zones3w = sumZones(last3wActivities);
    const total3w = Object.values(zones3w).reduce((s, v) => s + v, 0);
    const anaerobicPct = total3w > 0 ? (zones3w.Z6 + zones3w.Z7) / total3w : 0;
    if (anaerobicPct < 0.03) {
      signals.push({
        code: 'LACKS_ANAEROBIC',
        label: 'Anaérobie',
        severity: 'info',
        message: 'Manque de travail anaérobie — ajouter des efforts courts',
      });
    }
  }

  // ── LACKS_THRESHOLD ───────────────────────────────────────────────────────
  if (last3wActivities.length > 0) {
    const zones3w = sumZones(last3wActivities);
    const total3w = Object.values(zones3w).reduce((s, v) => s + v, 0);
    const thresholdPct = total3w > 0 ? zones3w.Z4 / total3w : 0;
    if (thresholdPct < 0.04) {
      signals.push({
        code: 'LACKS_THRESHOLD',
        label: 'Seuil',
        severity: 'info',
        message: 'Manque de travail au seuil',
      });
    }
  }

  // ── HIGH_MONOTONY ─────────────────────────────────────────────────────────
  // std dev of daily TSS over last 14 days < 20
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  const last14wActivities = activities.filter(a => {
    const d = parseDate(a.start_date_local);
    return d && d >= fourteenDaysAgo;
  });

  if (last14wActivities.length >= 5) {
    // Build daily TSS map
    const dailyTSS = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgo);
      d.setDate(d.getDate() + i);
      dailyTSS[toDateStr(d)] = 0;
    }
    for (const act of last14wActivities) {
      const dateKey = (act.start_date_local || '').split('T')[0];
      if (dailyTSS[dateKey] !== undefined) {
        dailyTSS[dateKey] += act.icu_training_load || 0;
      }
    }
    const values = Object.values(dailyTSS);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev < 20) {
      signals.push({
        code: 'HIGH_MONOTONY',
        label: 'Monotonie',
        severity: 'info',
        message: "Monotonie d'entraînement — varier les stimuli",
      });
    }
  }

  // Return at most 3, most severe first
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return signals.slice(0, 3);
}

// ─── Phase detection ─────────────────────────────────────────────────────────

function detectPhase(wellness, efTrend, tsb, signals, nextRace) {
  const daysAway = nextRace ? nextRace.daysAway : Infinity;

  if (daysAway <= 7) return { phase: 'TAPER', phaseReason: "Course dans moins de 7 jours — affûtage pour arriver frais au départ." };
  if (daysAway <= 14) return { phase: 'PEAK', phaseReason: "Course dans 8 à 14 jours — maintenir la forme et polir les qualités spécifiques." };

  if (tsb < -28) return { phase: 'RECOVERY', phaseReason: "TSB très négatif (surcharge) — récupération prioritaire avant de reprendre la charge." };

  const hasLowBase = signals.some(s => s.code === 'LOW_AEROBIC_BASE');
  const lastWellness = wellness && wellness.length > 0 ? wellness[wellness.length - 1] : null;
  const avgCTL = lastWellness ? (lastWellness.icu_ctl || 0) : 0;

  const efDeclining = efTrend && efTrend.trendPct < -3;
  if (efDeclining || avgCTL < 40 || hasLowBase) {
    let reason = 'Construction de la base aérobie';
    if (avgCTL < 40) reason = `CTL bas (${Math.round(avgCTL)}) — priorité au volume aérobie.`;
    else if (efDeclining) reason = `EF en baisse (${efTrend.trendPct.toFixed(1)}%) — retour au travail de base.`;
    else if (hasLowBase) reason = 'Distribution de zones déséquilibrée — trop de "junk miles", renforcer Z2.';
    return { phase: 'BASE', phaseReason: reason };
  }

  return {
    phase: 'BUILD',
    phaseReason: `CTL suffisant (${Math.round(avgCTL)}) et forme stable — bloc de développement pour hausser le plafond aérobie.`,
  };
}

// ─── Next race detection ──────────────────────────────────────────────────────

const RACE_NAME_RE = /(race|course|compet|ronde|crit[eé]rium|etape|étape)/i;

function findNextRace(plannedEvents) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const races = (plannedEvents || []).filter(ev => {
    const kind = (ev.kind || '').toLowerCase();
    const name = (ev.name || ev.title || '').toLowerCase();
    const type = (ev.type || '').toLowerCase();
    return (
      kind === 'race' ||
      type.includes('race') ||
      RACE_NAME_RE.test(name)
    );
  });

  // filter future races
  const future = races
    .map(ev => {
      const dateStr = (ev.date || ev.start_date_local || '').split('T')[0];
      return { ...ev, _dateStr: dateStr };
    })
    .filter(ev => ev._dateStr >= todayStr)
    .sort((a, b) => a._dateStr.localeCompare(b._dateStr));

  if (future.length === 0) return null;

  const next = future[0];
  const daysAway = daysBetween(todayStr, next._dateStr);
  return {
    date: next._dateStr,
    name: next.name || next.title || 'Course',
    daysAway,
  };
}

// ─── Day session builder ──────────────────────────────────────────────────────

/**
 * Build a DaySession object.
 */
function makeSession({ dayIndex, date, type, durationMin, ftp, reasoning, isRaceDay = false }) {
  let workoutBlocks = [];
  if (type !== 'rest' && type !== 'race') {
    try {
      const workout = buildRuleBasedWorkout(type, durationMin, 'good', ftp, null);
      workoutBlocks = workout.blocks || [];
    } catch (_) {
      workoutBlocks = [];
    }
  }

  const TITLES = {
    rest: 'Repos',
    recovery: 'Récupération active',
    endurance: 'Endurance Z2',
    sweetspot: 'Sweet Spot',
    threshold: 'Seuil FTP',
    vo2: 'VO2 Max',
    openers: 'Activateurs',
    race: 'Course',
  };

  return {
    dayIndex,
    date,
    type,
    title: TITLES[type] || type,
    durationMin: isRaceDay ? 0 : durationMin,
    estimatedTSS: estimateTSS(type, durationMin),
    reasoning,
    workoutBlocks,
    isRaceDay,
  };
}

// ─── Week templates ───────────────────────────────────────────────────────────

function buildWeekTemplate(phase, signals, ftp, weekDates, nextRace) {
  const hasLacksThreshold = signals.some(s => s.code === 'LACKS_THRESHOLD');
  const hasLacksAnaerobic = signals.some(s => s.code === 'LACKS_ANAEROBIC');
  const hasPoorCompliance = signals.some(s => s.code === 'POOR_COMPLIANCE');

  // Check if race day falls within this week
  let raceDayIndex = -1;
  if (nextRace && (phase === 'TAPER' || phase === 'PEAK')) {
    raceDayIndex = weekDates.findIndex(d => d === nextRace.date);
  }

  // Template definitions — [type, durationMin]
  let template;

  if (phase === 'RECOVERY') {
    template = [
      ['rest', 0, 'Récupération active pour dissiper la fatigue.'],
      ['recovery', 45, 'Sortie légère pour maintenir la circulation sans créer de fatigue.'],
      ['endurance', 60, 'Volume modéré pour entretenir la base sans surcharger.'],
      ['recovery', 45, 'Session légère en milieu de semaine pour gérer la fatigue.'],
      ['rest', 0, 'Repos complet pour maximiser la récupération.'],
      ['endurance', 75, 'Sortie longue modérée pour entretenir le volume de base.'],
      ['endurance', 60, 'Clôture de semaine en endurance douce.'],
    ];
  } else if (phase === 'BASE') {
    template = [
      ['rest', 0, 'Repos pour assimiler le travail de la semaine précédente.'],
      [hasLacksThreshold ? 'sweetspot' : 'endurance', hasLacksThreshold ? 75 : 90,
        hasLacksThreshold
          ? 'Sweet Spot pour combler le déficit au seuil tout en construisant la base.'
          : 'Long bloc Z2 pour augmenter le volume aérobie.'],
      ['endurance', 75, 'Volume continu Z2 pour développer les mitochondries.'],
      ['endurance', 90, 'Sortie longue en semaine pour accumuler le volume aérobie.'],
      ['rest', 0, 'Repos pour préparer le week-end de charge.'],
      ['endurance', 150, 'Longue sortie fondamentale du week-end — effort aérobie soutenu.'],
      ['recovery', 45, 'Flush actif pour terminer la semaine et accélérer la récupération.'],
    ];
    // If LACKS_ANAEROBIC: add short openers logic — replace day 4 endurance with openers
    if (hasLacksAnaerobic) {
      template[3] = ['openers', 60, 'Session activateurs pour combler le déficit anaérobie.'];
    }
  } else if (phase === 'BUILD') {
    let day1Type = 'vo2';
    let day3Type = 'sweetspot';
    if (hasPoorCompliance) {
      day1Type = 'sweetspot';
      day3Type = 'endurance';
    } else if (hasLacksThreshold) {
      day1Type = 'threshold';
    }

    let day5Type = 'endurance';
    let day5Duration = 150;
    if (hasLacksAnaerobic && !hasPoorCompliance) {
      day5Type = 'openers';
      day5Duration = 60;
    }

    template = [
      ['rest', 0, 'Repos pour bien entamer la semaine de développement.'],
      [day1Type, 75,
        day1Type === 'vo2'
          ? 'Intervalles VO2 pour élever le plafond aérobie.'
          : day1Type === 'threshold'
            ? 'Travail au seuil pour hausser le FTP — priorité identifiée.'
            : 'Sweet Spot en remplacement VO2 pour respecter la compliance.'],
      ['endurance', 75, 'Récupération active en Z2 entre les deux sessions intenses.'],
      [day3Type, 75,
        day3Type === 'sweetspot'
          ? 'Sweet Spot pour combiner charge et développement aérobie.'
          : 'Volume Z2 pour consolider les adaptations sans surcharger.'],
      ['rest', 0, 'Repos avant le long week-end.'],
      [day5Type, day5Duration,
        day5Type === 'openers'
          ? 'Session activateurs pour combler le déficit anaérobie identifié.'
          : 'Longue sortie Z2 du week-end — volume clé de la semaine.'],
      ['recovery', 60, 'Flush actif du week-end pour terminer en douceur.'],
    ];
  } else if (phase === 'PEAK') {
    template = [
      ['rest', 0, 'Repos en début de semaine de pointe.'],
      ['threshold', 75, 'Travail au seuil pour maintenir la qualité sans accumuler.'],
      ['endurance', 60, 'Volume modéré pour conserver le moteur en température.'],
      ['openers', 60, 'Activateurs pour maintenir la vivacité neuromusculaire.'],
      ['rest', 0, 'Repos avant le week-end.'],
      ['recovery', 45, 'Sortie très légère, jambes fraîches avant la compétition.'],
      ['endurance', 90, 'Sortie endurance si pas de course ce dimanche.'],
    ];
  } else {
    // TAPER
    template = [
      ['rest', 0, 'Repos en début de semaine d\'affûtage.'],
      ['openers', 50, 'Activateurs pour maintenir la réactivité musculaire.'],
      ['recovery', 45, 'Session très légère pour éliminer les toxines.'],
      ['openers', 40, 'Activateurs courts pour rester vif sans fatiguer.'],
      ['rest', 0, 'Repos complet avant la course.'],
      ['recovery', 30, 'Sortie de 30 min très légère pour s\'activer.'],
      ['race', 0, 'Jour de course — exécuter le plan de course.'],
    ];
  }

  return template.map(([type, durationMin, reasoning], i) => {
    // Override with race day if detected
    if (raceDayIndex === i) {
      return makeSession({
        dayIndex: i,
        date: weekDates[i],
        type: 'race',
        durationMin: 0,
        ftp,
        reasoning: 'Jour de course — bonne chance !',
        isRaceDay: true,
      });
    }
    return makeSession({
      dayIndex: i,
      date: weekDates[i],
      type,
      durationMin,
      ftp,
      reasoning,
      isRaceDay: false,
    });
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

const trainingPlanner = {
  buildWeekPrescription(wellness = [], activities = [], plannedEvents = [], athlete = {}) {
    const ftp = athlete.icu_ftp || athlete.ftp || 250;

    // Next Monday
    const monday = getNextMonday();
    const weekStart = toDateStr(monday);

    // Build week dates array (Mon–Sun)
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return toDateStr(d);
    });

    // Current TSB from last wellness entry
    const lastWellness = wellness.length > 0 ? wellness[wellness.length - 1] : null;
    const currentCTL = lastWellness?.icu_ctl || 0;
    const currentATL = lastWellness?.icu_atl || 0;
    const tsb = currentCTL - currentATL;

    // EF trend
    const efTrend = analytics.computeEFTrend(activities);

    // Next race
    const nextRace = findNextRace(plannedEvents);

    // Signals
    const signals = detectSignals(wellness, activities, efTrend, tsb);

    // Phase
    const { phase, phaseReason } = detectPhase(wellness, efTrend, tsb, signals, nextRace);

    // Build sessions
    const sessions = buildWeekTemplate(phase, signals, ftp, weekDates, nextRace);

    // Week TSS
    const weekTSS = sessions.reduce((s, sess) => s + (sess.estimatedTSS || 0), 0);

    return {
      weekStart,
      phase,
      phaseReason,
      signals,
      sessions,
      weekTSS,
      nextRace,
    };
  },
};

export default trainingPlanner;
