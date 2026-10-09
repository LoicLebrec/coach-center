import React from 'react';
import { figureFor, GROUND } from '../data/exerciseFigures';

const FAR = [['s', 'e2', 'e'], ['e2', 'w2', 'w'], ['p', 'k2', 'k1'], ['k2', 'f2', 'f1']];
const NEAR = [['s', 'p'], ['s', 'e'], ['e', 'w'], ['p', 'k1'], ['k1', 'f1']];
const FALLBACK = { e2: 'e', w2: 'w', k2: 'k1', f2: 'f1' };

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

function Bone({ a, b, pa, pb, still, dur, className }) {
  const A = joint(pa, a); const B = joint(pa, b);
  const A2 = joint(pb, a); const B2 = joint(pb, b);
  return (
    <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} className={className}>
      {!still && <>
        <Anim attr="x1" from={A[0]} to={A2[0]} dur={dur} />
        <Anim attr="y1" from={A[1]} to={A2[1]} dur={dur} />
        <Anim attr="x2" from={B[0]} to={B2[0]} dur={dur} />
        <Anim attr="y2" from={B[1]} to={B2[1]} dur={dur} />
      </>}
    </line>
  );
}

/** Animated stick figure for a bodyweight exercise (null when none is drawn). */
export default function ExerciseFigure({ name, size = 96 }) {
  const fig = figureFor(name);
  if (!fig) return null;
  const a = fig.a;
  const b = fig.b || fig.a;
  const still = !fig.b || reducedMotion();
  const dur = (fig.speed || 2.6);
  return (
    <svg className="exfig" viewBox="0 -10 120 106" width={size} height={size * 106 / 120} role="img" aria-label={name}>
      <line x1="0" y1={GROUND} x2="120" y2={GROUND} className="exfig-ground" />
      {(fig.props || []).map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="1.5" className="exfig-prop" />
      ))}
      {FAR.map(([p, q]) => (
        <Bone key={`f${q}`} a={p} b={q} pa={a} pb={b} still={still} dur={dur} className="exfig-far" />
      ))}
      {NEAR.map(([p, q]) => (
        <Bone key={`n${p}${q}`} a={p} b={q} pa={a} pb={b} still={still} dur={dur} className="exfig-near" />
      ))}
      <circle cx={a.h[0]} cy={a.h[1]} r="6" className="exfig-head">
        {!still && <>
          <Anim attr="cx" from={a.h[0]} to={b.h[0]} dur={dur} />
          <Anim attr="cy" from={a.h[1]} to={b.h[1]} dur={dur} />
        </>}
      </circle>
    </svg>
  );
}
