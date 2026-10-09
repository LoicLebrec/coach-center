/**
 * Stick-figure poses for the bodyweight exercises, side view.
 *
 * viewBox 0 -10 120 106, ground at y = 92. A pose is a set of joints:
 *   h head · s shoulder · e/w near elbow/wrist · e2/w2 far elbow/wrist
 *   p hip · k1/f1 near knee/foot · k2/f2 far knee/foot
 * Far limbs default to the near ones. Each figure: { a, b?, props?, speed? } —
 * the drawing moves a → b → a; no b = held position.
 * props: [x, y, w, h] rectangles (chair, step, wall).
 */

export const GROUND = 92;

const P = (o) => o;
const STAND = P({ h: [58, 9], s: [58, 19], e: [58, 34], w: [59, 48], p: [58, 49], k1: [59, 70], f1: [60, 92] });

function shift(pose, dx, dy) {
  return Object.fromEntries(Object.entries(pose).map(([k, [x, y]]) => [k, [x + dx, y + dy]]));
}

const SQUAT_LOW = P({
  h: [55, 25], s: [52, 34], e: [66, 34], w: [80, 32], p: [40, 62], k1: [63, 63], f1: [60, 92],
});
const SQUAT_ARMS_BACK = { ...SQUAT_LOW, e: [42, 44], w: [32, 52] };
const AIR = P({
  h: [58, 0], s: [58, 10], e: [68, 2], w: [76, -6], p: [58, 40], k1: [59, 62], f1: [61, 84],
});

const LUNGE = P({
  h: [58, 23], s: [58, 32], e: [58, 46], w: [60, 58], p: [58, 62],
  k1: [77, 64], f1: [78, 92], k2: [48, 88], f2: [30, 90],
});

const PLANK = P({
  h: [95, 59], s: [85, 64], e: [85, 90], w: [100, 90], p: [55, 75], k1: [35, 83], f1: [15, 90],
});

const SIDE_PLANK = P({
  h: [88, 51], s: [80, 58], e: [80, 90], w: [93, 90], e2: [68, 62], w2: [54, 70],
  p: [50, 74], k1: [32, 82], f1: [14, 90],
});

const HIGH_PLANK = P({
  h: [95, 56], s: [85, 62], e: [85, 76], w: [85, 90], p: [55, 73], k1: [35, 81], f1: [15, 89],
});

const SUPINE = { h: [20, 82], s: [30, 86], p: [60, 86] };

const QUAD = P({
  h: [86, 55], s: [76, 62], e: [76, 76], w: [76, 90], p: [46, 62], k1: [46, 90], f1: [26, 90],
});

export const FIGURES = {
  squat: { a: { ...STAND, e: [70, 22], w: [84, 22] }, b: SQUAT_LOW },

  lunge: { a: STAND, b: LUNGE },

  jumpLunge: {
    a: LUNGE,
    b: { ...LUNGE, k1: [48, 88], f1: [30, 90], k2: [77, 64], f2: [78, 92], e: [66, 44], w: [72, 54] },
    speed: 1.4,
  },

  bridge: {
    a: { h: [20, 84], s: [30, 88], e: [42, 90], w: [54, 91], p: [55, 88], k1: [72, 70], f1: [84, 92], k2: [72, 70], f2: [94, 60] },
    b: { h: [20, 84], s: [30, 88], e: [42, 90], w: [54, 91], p: [55, 70], k1: [74, 68], f1: [84, 92], k2: [76, 62], f2: [98, 54] },
  },

  calf: {
    a: { ...STAND, k2: [57, 70], f2: [47, 78], w: [72, 30], e: [66, 32] },
    b: { ...shift({ ...STAND, k2: [57, 70], f2: [47, 78], w: [72, 30], e: [66, 32] }, 0, -6), f1: [62, 88] },
    props: [[52, 88, 30, 4]],
  },

  plank: { a: PLANK },

  sidePlank: { a: SIDE_PLANK },

  sidePlankLeg: { a: SIDE_PLANK, b: { ...SIDE_PLANK, k2: [34, 70], f2: [18, 64] } },

  shoulderTap: { a: HIGH_PLANK, b: { ...HIGH_PLANK, e: [96, 72], w: [88, 64] } },

  bulgarian: {
    a: { h: [60, 11], s: [60, 20], e: [66, 32], w: [62, 44], p: [58, 50], k1: [62, 71], f1: [64, 92], k2: [44, 68], f2: [28, 74] },
    b: { h: [58, 27], s: [57, 36], e: [63, 48], w: [59, 60], p: [52, 66], k1: [72, 68], f1: [68, 92], k2: [40, 86], f2: [28, 74] },
    props: [[10, 74, 22, 18]],
  },

  rdl: {
    a: { ...STAND, k2: [56, 70], f2: [52, 90] },
    b: { h: [95, 43], s: [86, 47], e: [86, 61], w: [86, 75], p: [58, 50], k1: [60, 71], f1: [60, 92], k2: [37, 47], f2: [15, 45] },
  },

  stepUp: {
    a: { h: [52, 11], s: [52, 20], e: [52, 35], w: [54, 49], p: [50, 50], k1: [68, 58], f1: [72, 80], k2: [49, 71], f2: [48, 92] },
    b: { h: [70, -1], s: [70, 8], e: [70, 23], w: [71, 37], p: [70, 38], k1: [71, 59], f1: [72, 80], k2: [64, 58], f2: [58, 74] },
    props: [[60, 80, 34, 12]],
  },

  wallSit: {
    a: { h: [37, 31], s: [36, 40], e: [44, 52], w: [50, 60], p: [36, 66], k1: [60, 66], f1: [60, 92] },
    props: [[28, 0, 4, 92]],
  },

  wallSit1: {
    a: { h: [37, 31], s: [36, 40], e: [44, 52], w: [50, 60], p: [36, 66], k1: [60, 66], f1: [60, 92], k2: [60, 64], f2: [84, 64] },
    props: [[28, 0, 4, 92]],
  },

  pistol: {
    a: { h: [52, 36], s: [48, 44], e: [62, 46], w: [76, 46], p: [34, 72], k1: [56, 70], f1: [60, 92], k2: [56, 68], f2: [78, 64] },
    b: { ...STAND, e: [70, 22], w: [84, 22], k2: [74, 56], f2: [90, 66] },
    props: [[16, 74, 24, 18]],
  },

  nordic: {
    a: { h: [40, 23], s: [40, 32], e: [48, 40], w: [44, 36], p: [40, 62], k1: [40, 90], f1: [18, 88] },
    b: { h: [93, 47], s: [86, 53], e: [92, 64], w: [98, 76], p: [62, 72], k1: [40, 90], f1: [18, 88] },
    props: [[8, 80, 8, 8]],
  },

  squatJump: { a: SQUAT_ARMS_BACK, b: AIR, speed: 1.4 },

  hop: {
    a: { ...STAND, h: [58, 14], s: [58, 24], e: [58, 38], w: [60, 50], p: [57, 53], k1: [62, 72], f1: [60, 92], k2: [54, 72], f2: [44, 80] },
    b: { ...shift(STAND, 0, -10), k2: [54, 62], f2: [44, 70] },
    speed: 1.2,
  },

  skater: {
    a: { h: [54, 25], s: [52, 34], e: [62, 40], w: [70, 48], p: [45, 62], k1: [42, 76], f1: [40, 92], k2: [50, 78], f2: [58, 86] },
    b: { h: [66, 25], s: [68, 34], e: [58, 40], w: [50, 48], p: [75, 62], k1: [78, 76], f1: [80, 92], k2: [70, 78], f2: [62, 86] },
    speed: 1.6,
  },

  boxJump: {
    a: shift(SQUAT_ARMS_BACK, -18, 0),
    b: { ...shift(SQUAT_LOW, 40, -20), f1: [96, 72] },
    props: [[80, 72, 30, 20]],
    speed: 1.6,
  },

  depthJump: {
    a: shift(STAND, -36, -18),
    b: shift(AIR, 22, 0),
    props: [[10, 74, 24, 18]],
    speed: 1.6,
  },

  broadJump: {
    a: shift(SQUAT_ARMS_BACK, -18, 0),
    b: shift(SQUAT_LOW, 40, 0),
    speed: 1.6,
  },

  deadBug: {
    a: { ...SUPINE, e: [30, 72], w: [30, 58], k1: [60, 68], f1: [76, 68] },
    b: { ...SUPINE, e: [18, 72], w: [6, 66], e2: [30, 72], w2: [30, 58], k1: [60, 68], f1: [76, 68], k2: [78, 82], f2: [98, 84] },
  },

  birdDog: {
    a: QUAD,
    b: { ...QUAD, e: [91, 63], w: [107, 63], k2: [26, 62], f2: [5, 62] },
  },

  superman: {
    a: { h: [97, 84], s: [90, 88], e: [104, 90], w: [115, 90], p: [55, 88], k1: [35, 88], f1: [15, 88] },
    b: { h: [95, 76], s: [88, 82], e: [101, 82], w: [114, 78], p: [55, 87], k1: [35, 85], f1: [15, 79] },
  },

  hollow: {
    a: { h: [30, 79], s: [38, 80], e: [28, 66], w: [16, 60], p: [60, 88], k1: [80, 82], f1: [98, 76] },
  },

  hollowRock: {
    a: { h: [30, 79], s: [38, 80], e: [28, 66], w: [16, 60], p: [60, 88], k1: [80, 82], f1: [98, 76] },
    b: { h: [31, 85], s: [39, 86], e: [29, 73], w: [17, 68], p: [60, 88], k1: [80, 77], f1: [97, 66] },
    speed: 1.4,
  },

  copenhagen: {
    a: { h: [90, 52], s: [82, 59], e: [82, 90], w: [95, 90], e2: [70, 62], w2: [58, 68], p: [52, 66], k1: [34, 69], f1: [16, 70], k2: [40, 80], f2: [30, 90] },
    props: [[4, 70, 22, 22]],
  },
};

const MATCH = [
  [/^squat bulgare/i, 'bulgarian'],
  [/^squat jump/i, 'squatJump'],
  [/^squat/i, 'squat'],
  [/fentes sautées/i, 'jumpLunge'],
  [/fente/i, 'lunge'],
  [/pont fessier/i, 'bridge'],
  [/mollets/i, 'calf'],
  [/copenhagen/i, 'copenhagen'],
  [/planche latérale \+/i, 'sidePlankLeg'],
  [/planche latérale/i, 'sidePlank'],
  [/touches/i, 'shoulderTap'],
  [/^planche/i, 'plank'],
  [/soulevé/i, 'rdl'],
  [/step-up/i, 'stepUp'],
  [/chaise 1 jambe/i, 'wallSit1'],
  [/chaise contre/i, 'wallSit'],
  [/pistol/i, 'pistol'],
  [/nordic/i, 'nordic'],
  [/skater/i, 'skater'],
  [/saut sur marche/i, 'boxJump'],
  [/contre-saut/i, 'depthJump'],
  [/sauts 1 jambe/i, 'hop'],
  [/bond en longueur/i, 'broadJump'],
  [/dead bug/i, 'deadBug'],
  [/bird dog/i, 'birdDog'],
  [/superman/i, 'superman'],
  [/hollow rock/i, 'hollowRock'],
  [/hollow/i, 'hollow'],
];

export function figureFor(name) {
  const hit = MATCH.find(([re]) => re.test(name));
  return hit ? FIGURES[hit[1]] : null;
}
