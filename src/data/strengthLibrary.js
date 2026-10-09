/**
 * Bodyweight strength sessions — no gym, no equipment beyond a chair/bench and a wall.
 *
 * Three session kinds, three levels each (level = mesocycle in the phase):
 *   legs  — unilateral strength, slow eccentrics (bodyweight can't go heavy, so time under tension does the work)
 *   plyo  — jumps for rate of force development (sprint, relances)
 *   core  — trunk and hip stability: posture on the bike, lower back
 *
 * Exercise: { name, sets, reps | secs, perSide, rest (s), cue }
 */

const WARMUP = [
  'Cercles de hanches et de chevilles — 1 min',
  'Squats lents, amplitude complète — 10',
  'Fentes avant dynamiques — 5 / jambe',
  'Montées de genoux sur place — 30 s',
];

const S = (name, sets, dose, rest, cue, perSide = false) => ({
  name, sets, rest, cue, perSide, ...(typeof dose === 'string' ? { secs: parseInt(dose, 10) } : { reps: dose }),
});

const SESSIONS = {
  legs: {
    title: 'Force jambes',
    objective: 'Force unilatérale et chaîne postérieure, descente lente',
    notes: 'Descente en 3 s, remontée dynamique. Si la dernière série est facile, ralentis la descente avant d’ajouter des reps.',
    levels: [
      [
        S('Squat', 3, 15, 60, 'Descente 3 s, cuisses parallèles'),
        S('Fente arrière', 3, 10, 60, 'Genou avant au-dessus de la cheville', true),
        S('Pont fessier 1 jambe', 3, 10, 45, 'Bassin à plat, 1 s en haut', true),
        S('Mollets 1 jambe (marche)', 3, 15, 45, 'Amplitude complète', true),
        S('Planche', 3, '30', 45, 'Fessiers serrés, dos plat'),
      ],
      [
        S('Squat bulgare (pied arrière sur chaise)', 3, 10, 75, 'Descente 3 s, buste légèrement penché', true),
        S('Soulevé de terre 1 jambe', 3, 10, 60, 'Dos plat, hanche qui recule', true),
        S('Step-up sur chaise', 3, 10, 60, 'Pousser par le talon, ne pas s’aider de la jambe arrière', true),
        S('Pont fessier 1 jambe', 3, 12, 45, 'Pause 2 s en haut', true),
        S('Chaise contre le mur', 3, '45', 60, 'Cuisses parallèles au sol'),
      ],
      [
        S('Squat bulgare tempo', 4, 12, 75, 'Descente 4 s, pause 1 s en bas', true),
        S('Pistol squat assisté (sur banc)', 3, 6, 90, 'S’asseoir lentement, remonter sans élan', true),
        S('Nordic ischios (pieds calés)', 3, 5, 90, 'Freiner la chute le plus longtemps possible'),
        S('Step-up haut', 4, 12, 60, 'Contrôle à la descente', true),
        S('Chaise 1 jambe', 3, '20', 60, 'Bassin horizontal', true),
      ],
    ],
  },
  plyo: {
    title: 'Explosivité',
    objective: 'Sauts courts et réactifs : production de force rapide',
    notes: 'Qualité avant quantité : chaque saut à fond, récup complète. Arrête la série dès que la hauteur baisse.',
    levels: [
      [
        S('Squat jump', 3, 6, 90, 'Réception souple, rebondir vers le haut'),
        S('Fentes sautées', 3, 8, 90, 'Alterner, buste droit'),
        S('Skater (bonds latéraux)', 3, 8, 60, 'Stabiliser 1 s à chaque réception', true),
        S('Planche latérale', 3, '25', 45, 'Corps aligné', true),
      ],
      [
        S('Squat jump', 4, 6, 90, 'Hauteur max, temps au sol court'),
        S('Saut sur marche / banc', 4, 5, 90, 'Redescendre en marchant'),
        S('Fentes sautées', 3, 10, 90, 'Alterner, réception silencieuse'),
        S('Skater (bonds latéraux)', 3, 10, 60, 'Distance max', true),
        S('Planche latérale', 3, '30', 45, 'Corps aligné', true),
      ],
      [
        S('Contre-saut depuis une marche', 4, 5, 120, 'Tomber, toucher, rebondir — sol le plus court possible'),
        S('Sauts 1 jambe sur place', 3, 5, 90, 'Genou dans l’axe', true),
        S('Bond en longueur', 4, 5, 90, 'Bras en balancier, réception stable'),
        S('Skater (bonds latéraux)', 3, 12, 60, 'Distance max', true),
        S('Planche latérale + élévation jambe', 3, '25', 45, 'Bassin haut', true),
      ],
    ],
  },
  core: {
    title: 'Gainage & posture',
    objective: 'Tronc et bassin stables : transmettre la puissance, protéger le dos',
    notes: 'Respire pendant le maintien. Tremblements OK, cambrure non : arrête la série si le dos se creuse.',
    levels: [
      [
        S('Planche', 3, '30', 30, 'Fessiers serrés, dos plat'),
        S('Planche latérale', 3, '20', 30, 'Hanche haute', true),
        S('Dead bug', 3, 10, 30, 'Bas du dos collé au sol', true),
        S('Bird dog', 3, 10, 30, 'Bassin immobile', true),
        S('Superman', 3, 12, 30, 'Regard au sol, 1 s en haut'),
      ],
      [
        S('Planche', 3, '45', 30, 'Fessiers serrés, dos plat'),
        S('Planche latérale', 3, '30', 30, 'Hanche haute', true),
        S('Dead bug lent', 3, 12, 30, '3 s par répétition', true),
        S('Hollow hold', 3, '20', 45, 'Lombaires au sol'),
        S('Pont fessier 1 jambe', 3, 12, 30, 'Pause 2 s en haut', true),
      ],
      [
        S('Planche + touches d’épaule', 3, 20, 45, 'Bassin immobile'),
        S('Copenhagen plank (adducteurs)', 3, '20', 45, 'Jambe du dessus sur chaise', true),
        S('Hollow rock', 3, 15, 45, 'Garder la forme banane'),
        S('Bird dog avec pause', 3, 12, 30, '2 s bras/jambe tendus', true),
        S('Superman', 3, 15, 30, 'Regard au sol'),
      ],
    ],
  },
};

export const STRENGTH_KINDS = Object.keys(SESSIONS);
export const STRENGTH_LABELS = Object.fromEntries(Object.entries(SESSIONS).map(([k, v]) => [k, v.title]));

/** Minutes for an exercise list: ~3 s per rep, work + rest per set, plus warm-up. */
export function strengthMinutes(exercises, warmupMin = 5) {
  const secs = exercises.reduce((s, e) => {
    const work = (e.secs || (e.reps || 0) * 3) * (e.perSide ? 2 : 1);
    return s + e.sets * work + (e.sets - 1) * e.rest + 60; // + 1 min to set up / move on
  }, 0);
  return Math.round(warmupMin + secs / 60);
}

export function strengthSession(kind, level = 1) {
  const s = SESSIONS[kind] || SESSIONS.core;
  const lv = Math.max(1, Math.min(s.levels.length, level));
  const exercises = s.levels[lv - 1];
  return {
    kind: SESSIONS[kind] ? kind : 'core',
    title: `${s.title} · poids du corps`,
    objective: s.objective,
    notes: s.notes,
    level: lv,
    levelCount: s.levels.length,
    warmup: WARMUP,
    exercises,
    minutes: strengthMinutes(exercises),
    ref: 'Rønnestad & Mujika 2014 · Vikmoen 2016',
  };
}

export function fmtDose(e) {
  const dose = e.secs ? `${e.secs} s` : `${e.reps}`;
  return `${e.sets} × ${dose}${e.perSide ? ' / côté' : ''}`;
}
