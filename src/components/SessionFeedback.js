import React from 'react';
import { reviewSession, activitiesOn } from '../services/sessionReview';
import { TYPE_LABELS, sessionType, dayOf, isRace, fmtDur } from '../services/dailyPlan';

const dateLabel = (key) => {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const d = new Date(`${key}T12:00:00`);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
};

/**
 * What was planned on a date: the session Today prescribed (saved each day),
 * else a calendar session with blocks, else nothing.
 */
export function planFor(date, prescriptions = {}, plannedEvents = []) {
  const rx = prescriptions[date];
  if (rx) return { ...rx, source: 'today' };
  const ev = plannedEvents.find(e => dayOf(e) === date && !isRace(e) && e.workoutBlocks?.length);
  if (!ev) return null;
  return {
    type: sessionType(ev) || 'endurance', title: ev.name || ev.title, source: 'calendar',
    blocks: ev.workoutBlocks.map(b => ({ ...b, durationMin: Number(b.durationMin) || 0 })),
  };
}

export function feedbackFor(date, activities, prescriptions, plannedEvents) {
  const plan = planFor(date, prescriptions, plannedEvents);
  const { rides } = activitiesOn(activities, date);
  return { plan, rides, review: reviewSession(plan || { type: 'none' }, rides, { past: true }) };
}

/** The last rides as cards, newest first; the dot is the plan compliance colour. */
export function RecentRides({ rides, selectedId, onSelect, toneOf }) {
  return (
    <div className="recent-rides" role="listbox" aria-label="Dernières sorties">
      {rides.map(a => {
        const key = String(a.start_date_local).slice(0, 10);
        const tone = toneOf(key);
        const on = String(a.id) === String(selectedId);
        return (
          <button key={a.id} type="button" role="option" aria-selected={on} className={`recent-ride${on ? ' is-on' : ''}`} onClick={() => onSelect(a.id)}>
            <span className="recent-ride-date">{dateLabel(key)}</span>
            <span className="recent-ride-name">{a.name || 'Sortie'}</span>
            <span className="recent-ride-meta">
              {fmtDur(Math.round((a.moving_time || 0) / 60))}{a.icu_training_load ? ` · ${Math.round(a.icu_training_load)} TSS` : ''}
            </span>
            {tone && <i className={`recent-ride-dot tone-${tone}`} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

export default function SessionFeedback({ date, plan, review, children }) {
  const planned = plan && plan.type !== 'rest' && plan.type !== 'none' && plan.blocks?.length;
  return (
    <section className={`feedback tone-${review?.tone || 'muted'}`}>
      <div className="feedback-date">{dateLabel(date)}</div>
      <div className="feedback-plan">
        {planned
          ? <>Prévu : <strong>{plan.title || TYPE_LABELS[plan.type]}</strong> · {TYPE_LABELS[plan.type] || plan.type}, {fmtDur(plan.minutes || plan.blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0))}</>
          : plan?.type === 'rest' ? 'Prévu : repos'
          : plan?.type === 'race' ? `Prévu : course${plan.title ? ` (${plan.title})` : ''}`
          : 'Pas de séance prévue ce jour-là'}
        {plan?.source === 'calendar' && <span className="feedback-src"> (calendrier)</span>}
      </div>
      {review && (
        <>
          <h2 className="feedback-title">{review.title}</h2>
          {review.pct != null && <p className="feedback-pct">{review.pct} % de la charge prévue</p>}
          {review.rows.length > 0 && (
            <table className="today-review-table feedback-table">
              <thead><tr><th /><th>Prévu</th><th>Fait</th></tr></thead>
              <tbody>
                {review.rows.map(r => (
                  <tr key={r.label} className={r.ok === false ? 'is-off' : ''}>
                    <td>{r.label}</td><td>{r.planned ?? '—'}</td><td>{r.done}{r.ok === true ? ' ✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {review.notes.map(n => <p key={n} className="feedback-note">{n}</p>)}
        </>
      )}
      {children}
    </section>
  );
}
