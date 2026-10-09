import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Outdoor pictograms in the logo's palette — pine, moss, sun — replacing emojis.
 * 24×24, flat shapes, round strokes. <Picto name="bike" size={16} />
 */
const P = 'currentColor'; // pine by default (.picto colour), cream on the dark sidebar
const M = '#8db255'; // moss
const L = '#c9e08f'; // meadow
const S = '#f0663a'; // sun
const Y = '#f6c445'; // gold
const B = '#4f97c4'; // water
const W = '#f3f6e4'; // snow

const line = { fill: 'none', stroke: P, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const ICONS = {
  mountain: <><polygon points="1,21 9,7 13,13 16,9 23,21" fill={M} /><polygon points="9,7 7,10.5 9,9.6 11,10.8" fill={W} /><circle cx="18.5" cy="5" r="2.6" fill={S} /></>,
  flag: <><line x1="5" y1="3" x2="5" y2="22" {...line} /><path d="M6 4h13l-3 4.5 3 4.5H6z" fill={S} /><path d="M9 4h3v3H9zM12 7h3v3h-3zM9 10h3v3H9z" fill={W} opacity="0.85" /></>,
  bike: <><circle cx="6" cy="16" r="4.2" {...line} /><circle cx="18" cy="16" r="4.2" {...line} /><path d="M6 16l4-7h6l2 7M10 9l3 7 3-7M9 6.5h3" {...line} stroke={S} /></>,
  run: <><circle cx="15" cy="4.5" r="2.3" fill={S} /><path d="M13 8l-3 5 4 2-1 6M10 13l-4 1M13 8l4 3 3-1" {...line} /><path d="M13 8l-2.5 4.5" stroke={S} strokeWidth="3.4" strokeLinecap="round" /></>,
  swim: <><circle cx="16" cy="7" r="2.4" fill={S} /><path d="M5 12l5-3 4 3" {...line} /><path d="M2 16c2.5-2 4.5 2 7 0s4.5 2 7 0 4.5 2 6 0M2 20c2.5-2 4.5 2 7 0s4.5 2 7 0 4.5 2 6 0" fill="none" stroke={B} strokeWidth="2" strokeLinecap="round" /></>,
  hike: <><path d="M6 3h6l1 8 6 3c1.5.7 2 2 2 3.5V19H4l1-5z" fill={M} /><path d="M4 19h17v2H4z" fill={P} /><path d="M7 7h4M7 10h4" stroke={P} strokeWidth="1.6" strokeLinecap="round" /></>,
  ski: <><polygon points="2,20 22,9 22,20" fill={L} /><circle cx="14" cy="5" r="2.3" fill={S} /><path d="M13 8l-3 5h5l-2 4M3 17l17-9" {...line} /></>,
  yoga: <><path d="M3 18h18" {...line} /><path d="M6.5 18a5.5 5.5 0 0 1 11 0" fill={Y} /><path d="M12 5v3M5 8l2 2M19 8l-2 2" {...line} stroke={S} /></>,
  strength: <><path d="M7 11V9a5 5 0 0 1 10 0v2" fill="none" stroke={P} strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="15" r="6.5" fill={M} /><rect x="10" y="13.5" width="4" height="3" rx="1" fill={W} /></>,
  bolt: <polygon points="13,2 5,14 11,14 10,22 19,9 13,9" fill={S} />,
  wind: <path d="M3 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h7" {...line} />,
  battery: <><rect x="3" y="7" width="16" height="10" rx="2.5" fill="none" stroke={P} strokeWidth="2" /><rect x="5.5" y="9.5" width="9" height="5" rx="1" fill={M} /><rect x="19.5" y="10" width="2" height="4" rx="1" fill={P} /></>,
  pin: <><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" fill={S} /><circle cx="12" cy="10" r="2.6" fill={W} /></>,
  sun: <><circle cx="12" cy="12" r="5" fill={Y} /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke={S} strokeWidth="2" strokeLinecap="round" /></>,
  moon: <><path d="M20 15A8.5 8.5 0 1 1 9 4a7 7 0 0 0 11 11z" fill={P} /><circle cx="17" cy="5" r="1.2" fill={Y} /><circle cx="20" cy="9" r="0.9" fill={Y} /></>,
  leaf: <><path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill={M} /><path d="M4 20L14 10" {...line} /></>,
  drop: <path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" fill={B} />,
  plate: <><circle cx="12" cy="13" r="7" fill={L} /><circle cx="12" cy="13" r="4" fill="none" stroke={M} strokeWidth="1.6" /><path d="M2 5v6M4 5v6M3 11v10M21 4c-2 1-2 5-2 7h2v10" {...line} /></>,
  apple: <><path d="M12 7c-4-2-8 0-8 5s3 9 5 9c1.2 0 2-.6 3-.6s1.8.6 3 .6c2 0 5-4 5-9s-4-7-8-5z" fill={S} /><path d="M12 7c0-2 1-4 3-4" {...line} /><path d="M12 6c-1.5-2-3.5-2-4.5-1.5 1 1.8 3 2 4.5 1.5z" fill={M} /></>,
  egg: <path d="M12 3c3.5 0 6.5 6 6.5 10.5a6.5 6.5 0 0 1-13 0C5.5 9 8.5 3 12 3z" fill={Y} stroke={P} strokeWidth="1.6" />,
  cart: <><path d="M2 4h3l2.5 11h11L21 7H6" {...line} /><circle cx="9" cy="19.5" r="1.7" fill={S} /><circle cx="17" cy="19.5" r="1.7" fill={S} /></>,
  map: <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill={L} /><path d="M9 4v14M15 6v14" stroke={M} strokeWidth="1.6" /><path d="M5 14c2-3 4 1 6-2s4-1 7-4" fill="none" stroke={S} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 2" /></>,
  send: <><path d="M3 11L21 3l-6 18-3-8z" fill={M} /><path d="M12 13l9-10" {...line} /></>,
  compass: <><circle cx="12" cy="12" r="9" fill="none" stroke={P} strokeWidth="2" /><polygon points="12,5 14.5,12 12,19 9.5,12" fill={S} /><polygon points="12,12 14.5,12 12,19 9.5,12" fill={P} /></>,
  fire: <><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 3s1-4 1-8z" fill={S} /><path d="M12 13c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 3-5z" fill={Y} /></>,
  target: <><circle cx="12" cy="12" r="9" fill={L} /><circle cx="12" cy="12" r="5.5" fill={W} /><circle cx="12" cy="12" r="2.5" fill={S} /></>,
  wave: <path d="M2 9c3-3 5 3 8 0s5 3 8 0 3 0 4 0M2 15c3-3 5 3 8 0s5 3 8 0 3 0 4 0" fill="none" stroke={B} strokeWidth="2.2" strokeLinecap="round" />,
  burst: <><polygon points="12,1 14.5,8 22,6 16.5,12 22,18 14.5,16 12,23 9.5,16 2,18 7.5,12 2,6 9.5,8" fill={S} /><circle cx="12" cy="12" r="3" fill={Y} /></>,
  house: <><path d="M3 11l9-7 9 7" {...line} /><path d="M5 10v10h14V10l-7-5z" fill={L} /><rect x="10" y="14" width="4" height="6" fill={M} /></>,
  signal: <><circle cx="12" cy="17" r="2" fill={S} /><path d="M8 13a5.5 5.5 0 0 1 8 0M5 10a9.5 9.5 0 0 1 14 0" {...line} /><path d="M12 19v3" {...line} /></>,
  heart: <path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" fill={S} />,
  sparkle: <path d="M12 3c.8 4.5 2.5 6.2 7 7-4.5.8-6.2 2.5-7 7-.8-4.5-2.5-6.2-7-7 4.5-.8 6.2-2.5 7-7z" fill={Y} />,
  coffee: <><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" fill={M} /><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" {...line} /><path d="M8 3c-1 1.5 1 2 0 4M12 3c-1 1.5 1 2 0 4" {...line} stroke={S} /></>,
  binoculars: <><circle cx="7" cy="15" r="4" fill={M} /><circle cx="17" cy="15" r="4" fill={M} /><path d="M5 11l2-6h3v8M19 11l-2-6h-3v8M10 9h4" {...line} /></>,
  recover: <><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" {...line} /><path d="M18 3v4h-4M6 21v-4h4" {...line} stroke={S} /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" fill={L} /><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill={P} /><path d="M8 11h8M8 15h5" {...line} /></>,
  book: <><path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" fill={M} /><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" fill={L} /></>,
  shuffle: <path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" {...line} />,
  warning: <><path d="M12 3l10 18H2z" fill={Y} /><path d="M12 10v5" stroke={P} strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="18" r="1.2" fill={P} /></>,
  fresh: <circle cx="12" cy="12" r="7" fill={M} />,
  normal: <circle cx="12" cy="12" r="7" fill={Y} />,
  tired: <circle cx="12" cy="12" r="7" fill={S} />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" fill={L} /><path d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3H3z" fill={M} /><path d="M8 3v4M16 3v4" stroke={P} strokeWidth="2.2" strokeLinecap="round" /><circle cx="15.5" cy="16" r="2.3" fill={S} /></>,
  chart: <><rect x="3.5" y="12" width="4.5" height="8" rx="1.2" fill={M} /><rect x="9.75" y="6" width="4.5" height="14" rx="1.2" fill={S} /><rect x="16" y="9.5" width="4.5" height="10.5" rx="1.2" fill={L} /><path d="M2 21h20" stroke={P} strokeWidth="2" strokeLinecap="round" /></>,
  trend: <><path d="M3 20v-3l6-6 4 3 8-8v14z" fill={L} /><path d="M3 17l6-6 4 3 8-8" {...line} /><circle cx="21" cy="6" r="2.2" fill={S} /></>,
  load: <><rect x="2.5" y="14" width="4" height="7" rx="1" fill={M} /><rect x="7.5" y="10" width="4" height="11" rx="1" fill={M} /><rect x="12.5" y="5" width="4" height="16" rx="1" fill={S} /><rect x="17.5" y="13" width="4" height="8" rx="1" fill={L} /></>,
  dashboard: <><rect x="3" y="3" width="8" height="10" rx="2" fill={M} /><rect x="13" y="3" width="8" height="6" rx="2" fill={L} /><rect x="3" y="15" width="8" height="6" rx="2" fill={L} /><rect x="13" y="11" width="8" height="10" rx="2" fill={S} /></>,
  blocks: <><path d="M2 21v-6h4v-4h3v10zM13 21V7h4v14z" fill={M} /><path d="M9 21V4h4v17z" fill={S} /><path d="M17 21v-8h5v8z" fill={L} /></>,
  person: <><circle cx="12" cy="7.5" r="4" fill={S} /><path d="M4 21c0-4.5 3.6-7.5 8-7.5s8 3 8 7.5z" fill={M} /></>,
  gear: <><path d="M12 2l1.6 2.6 3-.7.7 3 2.6 1.6-1.4 2.7 1.4 2.7-2.6 1.6-.7 3-3-.7L12 22l-1.6-2.6-3 .7-.7-3-2.6-1.6L5.5 12 4.1 9.3l2.6-1.6.7-3 3 .7z" fill={M} /><circle cx="12" cy="12" r="3.4" fill={W} /><circle cx="12" cy="12" r="1.6" fill={S} /></>,
  door: <><path d="M4 3h9v18H4z" fill={L} /><path d="M4 3h9v18H4z" fill="none" stroke={P} strokeWidth="1.8" strokeLinejoin="round" /><path d="M11 12h10M18 9l3 3-3 3" {...line} stroke={S} /></>,
  more: <><circle cx="5" cy="12" r="2.4" fill={M} /><circle cx="12" cy="12" r="2.4" fill={S} /><circle cx="19" cy="12" r="2.4" fill={M} /></>,
};

export const PICTO_NAMES = Object.keys(ICONS);

export default function Picto({ name, size = 18, className, title }) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg className={`picto${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24"
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {icon}
    </svg>
  );
}

/** Same pictogram as an SVG string, for HTML built outside React (map markers). */
export function pictoSvg(name, size = 18) {
  return renderToStaticMarkup(<Picto name={name} size={size} />);
}
