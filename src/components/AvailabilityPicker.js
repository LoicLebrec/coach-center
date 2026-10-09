import React from 'react';
import { AVAILABILITY_OPTIONS, availabilityValue, setAvailability } from '../services/availability';

/** "Ta dispo ce jour-là" — one tap per option; shared by the calendar dialogs. */
export default function AvailabilityPicker({ date, availability, onChange, title = 'Ton temps dispo ce jour-là' }) {
  const current = availabilityValue(availability[date]);
  return (
    <div className="cal-avail-picker">
      <div className="cal-avail-title">{title}</div>
      <div className="cal-avail-options" role="radiogroup" aria-label="Disponibilité">
        {AVAILABILITY_OPTIONS.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={current === o.value}
            className={current === o.value ? 'is-on' : ''}
            onClick={() => setAvailability(date, o.value).then(onChange)}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="cal-avail-help">Pas dispo : la séance passe sur un autre jour de la semaine. Un temps : la séance est calée dessus.</p>
    </div>
  );
}
