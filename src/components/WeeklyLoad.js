import React, { useMemo, useState } from 'react';
import { isHardActivity } from '../services/coachEngine';
import { num } from '../services/number';

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function mondayOf(d) {
  const m = new Date(d);
  m.setHours(12, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** Monday → Sunday weeks, oldest first, the current week last. */
export function weeklyTotals(activities = [], weeks = 8, today = new Date()) {
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, k) => {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - 7 * (weeks - 1 - k));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const from = dayKey(start); const to = dayKey(end);
    const acts = activities.filter(a => {
      const d = String(a.start_date_local || a.date || '').slice(0, 10);
      return d >= from && d < to;
    });
    return {
      start: from,
      current: k === weeks - 1,
      tss: Math.round(acts.reduce((s, a) => s + (num(a.icu_training_load) || 0), 0)),
      hours: acts.reduce((s, a) => s + (num(a.moving_time) || 0), 0) / 3600,
      km: acts.reduce((s, a) => s + (num(a.distance) || 0), 0) / 1000,
      count: acts.length,
      hard: new Set(acts.filter(isHardActivity).map(a => String(a.start_date_local).slice(0, 10))).size,
    };
  });
}

const fmtWeek = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtH = (h) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

function Bars({ data, avg }) {
  const W = 760; const H = 220; const top = 22; const bottom = 26;
  const max = Math.max(avg * 1.2, ...data.map(d => d.tss), 1);
  const bw = W / data.length;
  const y = (v) => H - bottom - (v / max) * (H - top - bottom);
  return (
    <svg className="wl-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="TSS par semaine">
      {avg > 0 && (
        <>
          <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} className="wl-avg" />
          <text x={W - 4} y={y(avg) - 5} textAnchor="end" className="wl-avg-label">moyenne {Math.round(avg)}</text>
        </>
      )}
      {data.map((d, i) => {
        const h = Math.max(2, H - bottom - y(d.tss));
        const x = i * bw + bw * 0.18;
        return (
          <g key={d.start}>
            <rect x={x} y={H - bottom - h} width={bw * 0.64} height={h} rx="6" className={d.current ? 'wl-bar is-current' : 'wl-bar'} />
            {d.tss > 0 && <text x={x + bw * 0.32} y={H - bottom - h - 6} textAnchor="middle" className="wl-val">{d.tss}</text>}
            <text x={x + bw * 0.32} y={H - 8} textAnchor="middle" className="wl-week">{d.current ? 'cette sem.' : fmtWeek(d.start)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function WeeklyLoad({ activities = [], loading }) {
  const [weeks, setWeeks] = useState(8);
  const data = useMemo(() => weeklyTotals(activities, weeks), [activities, weeks]);
  const done = data.slice(0, -1);
  const last4 = done.slice(-4);
  const avg4 = last4.length ? last4.reduce((s, d) => s + d.tss, 0) / last4.length : 0;
  const cur = data[data.length - 1];
  const prev = done[done.length - 1];
  const change = prev?.tss ? ((prev.tss - (done[done.length - 2]?.tss || 0)) / (done[done.length - 2]?.tss || 1)) * 100 : null;

  let verdict = null;
  if (prev && done.length >= 2 && done[done.length - 2].tss > 0) {
    if (change > 15) verdict = { tone: 'orange', text: `La semaine dernière : +${Math.round(change)} % de charge. Au-delà de ~10–15 % d’une semaine à l’autre, le risque de fatigue monte.` };
    else if (change < -30) verdict = { tone: 'blue', text: `La semaine dernière : ${Math.round(change)} %. Semaine de récup ou coupure.` };
    else verdict = { tone: 'green', text: `La semaine dernière : ${change >= 0 ? '+' : ''}${Math.round(change)} %. Progression maîtrisée.` };
  }

  if (loading && !activities.length) return <div className="loading-state"><div className="loading-spinner" /></div>;

  return (
    <div className="wl">
      <div className="page-header wl-head">
        <div>
          <div className="page-title">Charge hebdo</div>
          <div className="page-subtitle">TSS par semaine, du lundi au dimanche</div>
        </div>
        <div className="nutri-tabs" role="tablist" aria-label="Période">
          {[8, 12, 26].map(w => (
            <button key={w} type="button" role="tab" aria-selected={weeks === w} className={weeks === w ? 'is-on' : ''} onClick={() => setWeeks(w)}>
              {w} sem.
            </button>
          ))}
        </div>
      </div>

      <div className="wl-tiles">
        <div className="wl-tile">
          <div className="wl-tile-label">Cette semaine</div>
          <div className="wl-tile-value">{cur.tss} <small>TSS</small></div>
          <div className="wl-tile-sub">{fmtH(cur.hours)} · {Math.round(cur.km)} km · {cur.count} sortie{cur.count > 1 ? 's' : ''}</div>
        </div>
        <div className="wl-tile">
          <div className="wl-tile-label">Moyenne des 4 dernières</div>
          <div className="wl-tile-value">{Math.round(avg4)} <small>TSS</small></div>
          <div className="wl-tile-sub">{fmtH(last4.reduce((s, d) => s + d.hours, 0) / (last4.length || 1))} par semaine</div>
        </div>
        <div className="wl-tile">
          <div className="wl-tile-label">Séances dures</div>
          <div className="wl-tile-value">{cur.hard} <small>cette semaine</small></div>
          <div className="wl-tile-sub">{(last4.reduce((s, d) => s + d.hard, 0) / (last4.length || 1)).toFixed(1)} en moyenne</div>
        </div>
      </div>

      {verdict && <p className={`wl-verdict tone-${verdict.tone}`}>{verdict.text}</p>}

      <section className="ride-card">
        <h3>TSS par semaine</h3>
        <Bars data={data} avg={done.length ? done.reduce((s, d) => s + d.tss, 0) / done.length : 0} />
      </section>

      <section className="ride-card">
        <h3>Détail</h3>
        <table className="ride-climbs wl-table">
          <thead><tr><th>Semaine du</th><th>TSS</th><th>Temps</th><th>Distance</th><th>Sorties</th><th>Dures</th></tr></thead>
          <tbody>
            {[...data].reverse().map(d => (
              <tr key={d.start} className={d.current ? 'is-current' : ''}>
                <td>{fmtWeek(d.start)}{d.current ? ' (en cours)' : ''}</td>
                <td><strong>{d.tss}</strong></td>
                <td>{fmtH(d.hours)}</td>
                <td>{Math.round(d.km)} km</td>
                <td>{d.count}</td>
                <td>{d.hard}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
