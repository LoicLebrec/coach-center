import React, { useEffect, useState } from 'react';
import { RPE_LABELS, saveFeedback, feedbackEffect, expectedRpe } from '../services/rideFeedback';

const OUTCOMES = [['done', 'Tout fait'], ['partial', 'En partie'], ['failed', 'Pas tenue']];
const LEGS = [['heavy', 'Lourdes'], ['normal', 'Normales'], ['fresh', 'Fraîches']];

/**
 * "Comment c'était ?" after a ride. `plan` is what was prescribed that day
 * ({ type, family, familyLabel, level }) so the feedback can move that family's level.
 */
export default function RideFeedbackForm({ date, plan, entry, onSaved, compact = false }) {
  const [draft, setDraft] = useState(entry || { rpe: null, outcome: null, legs: 'normal', note: '' });
  const [editing, setEditing] = useState(!entry);
  useEffect(() => { setDraft(entry || { rpe: null, outcome: null, legs: 'normal', note: '' }); setEditing(!entry); }, [entry, date]);

  const quality = plan?.family || ['threshold', 'vo2', 'sweetspot', 'anaerobic', 'sprint', 'race_sim', 'force', 'test', 'tempo'].includes(plan?.type);
  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const save = async () => {
    const full = {
      ...draft, outcome: quality ? draft.outcome || 'done' : 'done',
      type: plan?.type || 'endurance', family: plan?.family || null, familyLabel: plan?.familyLabel || null, level: plan?.level || null,
    };
    const all = await saveFeedback(date, full);
    setEditing(false);
    onSaved?.(all);
  };

  if (!editing && entry) {
    return (
      <div className={`rfb rfb-done${compact ? ' is-compact' : ''}`}>
        <div className="rfb-summary">
          <strong>Ressenti : {entry.rpe}/10 · {RPE_LABELS[entry.rpe]}</strong>
          {entry.outcome && entry.outcome !== 'done' && <span> · {OUTCOMES.find(o => o[0] === entry.outcome)?.[1].toLowerCase()}</span>}
          {entry.legs && entry.legs !== 'normal' && <span> · jambes {LEGS.find(l => l[0] === entry.legs)?.[1].toLowerCase()}</span>}
          <button type="button" className="today-link" onClick={() => setEditing(true)}>modifier</button>
        </div>
        {entry.note && <p className="rfb-note">« {entry.note} »</p>}
        <p className="rfb-effect">{feedbackEffect(entry)}</p>
      </div>
    );
  }

  const [lo, hi] = expectedRpe(plan?.type);
  return (
    <div className={`rfb${compact ? ' is-compact' : ''}`}>
      <div className="rfb-title">Comment c’était ?</div>
      <div className="rfb-q">
        <div className="rfb-label">Difficulté ressentie {plan?.type ? <span className="today-muted">(attendu : {lo}–{hi})</span> : null}</div>
        <div className="rfb-scale" role="radiogroup" aria-label="Difficulté de 1 à 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" role="radio" aria-checked={draft.rpe === n} className={`rpe-${n}${draft.rpe === n ? ' is-on' : ''}`} onClick={() => set({ rpe: n })}>{n}</button>
          ))}
        </div>
        <div className="rfb-hint">{draft.rpe ? RPE_LABELS[draft.rpe] : '1 = très facile · 10 = à bloc'}</div>
      </div>
      {quality && (
        <div className="rfb-q">
          <div className="rfb-label">Séance tenue ?</div>
          <div className="today-seg">
            {OUTCOMES.map(([v, l]) => <button key={v} type="button" className={draft.outcome === v ? 'on' : ''} onClick={() => set({ outcome: v })}>{l}</button>)}
          </div>
        </div>
      )}
      <div className="rfb-q">
        <div className="rfb-label">Jambes</div>
        <div className="today-seg">
          {LEGS.map(([v, l]) => <button key={v} type="button" className={draft.legs === v ? 'on' : ''} onClick={() => set({ legs: v })}>{l}</button>)}
        </div>
      </div>
      <label className="rfb-q rfb-notefield">
        <span className="rfb-label">Un mot (facultatif)</span>
        <textarea rows={2} value={draft.note || ''} onChange={e => set({ note: e.target.value })} placeholder="Vent, chaleur, sensations…" />
      </label>
      <div className="rfb-actions">
        <button type="button" className="btn btn-primary" disabled={!draft.rpe || (quality && !draft.outcome)} onClick={save}>Enregistrer</button>
        {entry && <button type="button" className="btn" onClick={() => setEditing(false)}>Annuler</button>}
      </div>
    </div>
  );
}
