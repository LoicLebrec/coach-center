import React from 'react';

/**
 * Hand-drawn landscape for the Today header. The season phase picks the palette:
 * autumn for transition, frost for base, spring for build, summer for competition,
 * dawn lilac for peak / taper.
 */
const SEASONS = {
  transition: { sky: '#f6e6c8', sun: '#f0663a', far: '#d9c38f', mid: '#c08a45', near: '#7d6431', tree: '#b4552a', tree2: '#d98a2f', road: '#f7efdc', round: true },
  base: { sky: '#e4ecea', sun: '#fbf6e4', far: '#c4d4d1', mid: '#93aca6', near: '#5f7d71', tree: '#2f5247', tree2: '#3e6457', road: '#f4f7f3', snow: true },
  build: { sky: '#eef2cf', sun: '#f6c445', far: '#c2d791', mid: '#86b34d', near: '#4f812e', tree: '#2c5a2a', tree2: '#3d6e2f', road: '#f7f5e2' },
  competition: { sky: '#f5e9ad', sun: '#f0663a', far: '#cdcc78', mid: '#93ac42', near: '#5d7b27', tree: '#2f4a22', tree2: '#41602a', road: '#f8f1d6', burst: true },
  peak: { sky: '#e7e1fb', sun: '#f0663a', far: '#c5c3e6', mid: '#8fa86a', near: '#55783a', tree: '#2c4a2d', tree2: '#3c5f35', road: '#f6f3fb', burst: true },
};
SEASONS.taper = SEASONS.peak;
const BY_SEASON = { autumn: 'transition', winter: 'base', spring: 'build', summer: 'competition' };

// Left of centre: the right side carries the race chip.
const SUN = [430, 62];

// Trees standing on the mid hills: [x, base y, height]
const TREES = [
  [500, 160, 34], [522, 158, 26], [545, 156, 40], [566, 157, 28], [590, 158, 34],
  [700, 152, 30], [722, 150, 42], [746, 151, 30], [770, 149, 36],
  [40, 172, 30], [62, 170, 38], [86, 171, 26],
];

function Pine({ x, y, h, c, snow }) {
  const w = h * 0.5;
  const tier = (top, bottom, half) => `${x},${top} ${x - half},${bottom} ${x + half},${bottom}`;
  return (
    <g>
      <rect x={x - 1.5} y={y - 4} width="3" height="5" fill="#5b4330" />
      <polygon points={tier(y - h, y - h * 0.45, w * 0.55)} fill={c} />
      <polygon points={tier(y - h * 0.72, y - 3, w * 0.75)} fill={c} />
      {snow && <polygon points={tier(y - h, y - h * 0.8, w * 0.22)} fill="#fff" />}
    </g>
  );
}

function RoundTree({ x, y, h, c }) {
  return (
    <g>
      <rect x={x - 1.5} y={y - h * 0.4} width="3" height={h * 0.4} fill="#5b4330" />
      <ellipse cx={x} cy={y - h * 0.62} rx={h * 0.3} ry={h * 0.36} fill={c} />
    </g>
  );
}

export default function SeasonLandscape({ season, phase, className }) {
  // Drawn from the real season; `phase` kept for callers that still pass it.
  const p = SEASONS[BY_SEASON[season]] || SEASONS[phase] || SEASONS.build;
  const Tree = p.round ? RoundTree : Pine;
  return (
    <svg className={className} viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <rect width="800" height="220" fill={p.sky} />
      {p.burst && (
        <g stroke={p.sun} strokeWidth="6" strokeLinecap="round" opacity="0.9">
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <line key={i} x1={SUN[0] + Math.cos(a) * 44} y1={SUN[1] + Math.sin(a) * 44} x2={SUN[0] + Math.cos(a) * 60} y2={SUN[1] + Math.sin(a) * 60} />;
          })}
        </g>
      )}
      <circle cx={SUN[0]} cy={SUN[1]} r="30" fill={p.sun} />
      <path d="M0 140 L70 112 L130 128 L210 88 L280 122 L350 104 L420 132 L500 96 L570 118 L640 92 L720 120 L800 104 V220 H0Z" fill={p.far} />
      {p.snow && (
        <path d="M196 95 L210 88 L224 96 L214 94 L208 99Z M486 103 L500 96 L514 104 L504 102 L497 107Z M626 99 L640 92 L654 100 L644 98 L637 103Z" fill="#fff" />
      )}
      <path d="M0 176 C110 150 220 166 330 158 S520 148 620 158 S740 146 800 146 V220 H0Z" fill={p.mid} />
      {TREES.map(([x, y, h], i) => <Tree key={x} x={x} y={y} h={h} c={i % 2 ? p.tree2 : p.tree} snow={p.snow} />)}
      <path d="M-20 232 C120 214 220 206 320 196 S470 176 560 168" fill="none" stroke={p.road} strokeWidth="12" strokeLinecap="round" />
      <path d="M-20 232 C120 214 220 206 320 196 S470 176 560 168" fill="none" stroke={p.near} strokeWidth="1.5" strokeDasharray="8 10" opacity="0.5" />
      <path d="M0 206 C140 196 260 214 420 204 S680 192 800 202 V220 H0Z" fill={p.near} />
    </svg>
  );
}
