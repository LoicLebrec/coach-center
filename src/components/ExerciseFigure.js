import React from 'react';
import { figureFor, GROUND } from '../data/exerciseFigures';

// Flat illustration: jersey, bib shorts, skin, shoes. Far limbs a shade darker, drawn first.
const C = {
  skin: '#f1c39d', skinFar: '#d9a47c', jersey: '#f0663a', jerseyFar: '#c9502a',
  shorts: '#24402e', shortsFar: '#3d5c43', shoe: '#1b2e22', hair: '#4a3324',
};
const FALLBACK = { e2: 'e', w2: 'w', k2: 'k1', f2: 'f1' };

// [from, to, width, colour] or [joint, radius, colour, dx, dy] for dots; drawn in order.
const PARTS = [
  ['p', 'k2', 10, C.shortsFar], ['k2', 'f2', 7.5, C.skinFar], ['f2', 4.2, C.shoe],
  ['s', 'e2', 7, C.jerseyFar], ['e2', 'w2', 5.5, C.skinFar], ['w2', 3.2, C.skinFar],
  ['s', 'h', 5, C.skin],
  ['s', 'p', 15, C.jersey], ['p', 3, C.shorts],
  ['p', 'k1', 10.5, C.shorts], ['k1', 'f1', 7.5, C.skin], ['f1', 4.4, C.shoe],
  ['s', 'e', 7.5, C.jersey], ['e', 'w', 5.5, C.skin], ['w', 3.4, C.skin],
  ['h', 7.6, C.hair, -0.8, -1.4], ['h', 6.6, C.skin],
];

const joint = (pose, k) => pose[k] || pose[FALLBACK[k]];

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Start → end → start, with a short hold at each end. */
function Anim({ attr, from, to, dur }) {
  if (from === to) return null;
  return (
    <animate attributeName={attr} dur={`${dur}s`} repeatCount="indefinite"
      values={`${from};${from};${to};${to};${from}`} keyTimes="0;0.15;0.5;0.65;1" />
  );
}

function Part({ part, a, b, still, dur }) {
  if (typeof part[1] === 'number') {
    const [k, r, fill, dx = 0, dy = 0] = part;
    const A = joint(a, k); const B = joint(b, k);
    return (
      <circle cx={A[0] + dx} cy={A[1] + dy} r={r} fill={fill}>
        {!still && <>
          <Anim attr="cx" from={A[0] + dx} to={B[0] + dx} dur={dur} />
          <Anim attr="cy" from={A[1] + dy} to={B[1] + dy} dur={dur} />
        </>}
      </circle>
    );
  }
  const [p, q, w, stroke] = part;
  const A = joint(a, p); const B = joint(a, q);
  const A2 = joint(b, p); const B2 = joint(b, q);
  return (
    <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={stroke} strokeWidth={w} strokeLinecap="round">
      {!still && <>
        <Anim attr="x1" from={A[0]} to={A2[0]} dur={dur} />
        <Anim attr="y1" from={A[1]} to={A2[1]} dur={dur} />
        <Anim attr="x2" from={B[0]} to={B2[0]} dur={dur} />
        <Anim attr="y2" from={B[1]} to={B2[1]} dur={dur} />
      </>}
    </line>
  );
}

/** Animated illustration of a bodyweight exercise (null when none is drawn). */
export default function ExerciseFigure({ name, size = 104 }) {
  const fig = figureFor(name);
  if (!fig) return null;
  const a = fig.a;
  const b = fig.b || fig.a;
  const still = !fig.b || reducedMotion();
  const dur = fig.speed || 2.6;
  const xs = [...Object.values(a), ...Object.values(b)].map(p => p[0]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  return (
    <svg className="exfig" viewBox="0 -12 120 110" width={size} height={size * 110 / 120} role="img" aria-label={name}>
      <circle cx="60" cy="50" r="50" className="exfig-disc" />
      <ellipse cx={cx} cy={GROUND + 1.5} rx="34" ry="3.5" className="exfig-shadow" />
      {(fig.props || []).map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="2.5" className="exfig-prop" />
      ))}
      {PARTS.map((part, i) => <Part key={i} part={part} a={a} b={b} still={still} dur={dur} />)}
    </svg>
  );
}
