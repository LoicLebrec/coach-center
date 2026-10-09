import React, { useEffect, useMemo, useState } from 'react';
import persistence from '../services/persistence';
import { loadProfile } from '../services/athlete-profile';
import { PHASES, PHASE_ORDER, DEFAULT_SEASON_CONFIG, CYCLE_FOCUS, blocksMinutes, nextLevelOf, seasonOf } from '../services/periodization';
import { estimateTss } from '../services/coachEngine';
import {
  ZONE_PCT, TYPE_LABELS, CHECKIN_QUESTIONS, DEFAULT_CHECKIN, localDayKey, dayOf, num, fmtDur, groupBlocks,
  computeDay, buildSnapshot, buildOutlook,
} from '../services/dailyPlan';
import { pushWidgetSnapshot } from '../services/widgetSnapshot';
import { intervalsService } from '../services/intervals';
import { profileFromData, weekRanges, TRAIT_TEXT } from '../services/responderProfile';
import { reviewSession, activitiesOn } from '../services/sessionReview';
import { fmtDose, STRENGTH_KINDS, STRENGTH_LABELS } from '../data/strengthLibrary';
import ExerciseFigure from './ExerciseFigure';
import SeasonLandscape from './SeasonLandscape';
import { loadAvailability, setAvailability, availabilityValue, availabilityLabel, AVAILABILITY_OPTIONS } from '../services/availability';
import Picto from './Pictos';

/* ───────────────────────── helpers ───────────────────────── */

const ZONE_COLORS = {
  Z1: '#94a3b8', Z2: '#22c55e', Z3: '#eab308',
  Z4: '#f97316', Z5: '#ef4444', Z6: '#dc2626', Z7: '#a855f7',
};
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];


const PROFILE_TTL_DAYS = 7;
const PROFILE_HISTORY_DAYS = 730;

/**
 * Responder profile from 2 years of Intervals.icu rides + weekly best-power curves.
 * Cached a week; the fetch is two requests and stays out of the app's main activity state.
 */
function useResponderProfile() {
  const [state, setState] = useState({ status: 'loading', profile: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await persistence.getPref('responder-profile', null).catch(() => null);
      const fresh = cached?.computedAt && Date.now() - new Date(cached.computedAt).getTime() < PROFILE_TTL_DAYS * 86400000;
      if (cached?.profile && fresh) { if (alive) setState({ status: 'ok', profile: cached.profile }); return; }
      if (!intervalsService.isConfigured()) {
        if (alive) setState({ status: cached?.profile ? 'ok' : 'unavailable', profile: cached?.profile || null });
        return;
      }
      try {
        const newest = localDayKey();
        const oldest = localDayKey(new Date(Date.now() - PROFILE_HISTORY_DAYS * 86400000));
        const [acts, curves] = await Promise.all([
          intervalsService.getActivities(oldest, newest),
          intervalsService.getPowerCurves(weekRanges(oldest, newest)),
        ]);
        const profile = profileFromData(acts || [], curves);
        persistence.savePref('responder-profile', { computedAt: new Date().toISOString(), profile }).catch(() => { });
        if (alive) setState({ status: 'ok', profile });
      } catch {
        if (alive) setState({ status: cached?.profile ? 'ok' : 'error', profile: cached?.profile || null });
      }
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

/* ───────────────────────── UI bits ───────────────────────── */

function ZoneBar({ blocks }) {
  const total = Math.max(1, blocksMinutes(blocks));
  return (
    <div className="today-zonebar">
      {blocks.map((b, i) => (
        <div
          key={i}
          title={`${b.label} — ${fmtDur(b.durationMin)} @ ${b.zone}`}
          style={{
            width: `${((Number(b.durationMin) || 0) / total) * 100}%`,
            height: `${30 + (parseInt(String(b.zone).slice(1), 10) || 2) * 10}%`,
            background: ZONE_COLORS[b.zone] || ZONE_COLORS.Z2,
          }}
        />
      ))}
    </div>
  );
}

// Collapse "W R W R W" runs (same work, same rest) into one "n × W / R" row.

function BlockList({ blocks, ftp }) {
  return (
    <ol className="today-blocks">
      {groupBlocks(blocks).map((b, i) => {
        const pct = ZONE_PCT[b.zone];
        const watts = ftp && pct ? (b.zone === 'Z7' ? `> ${Math.round(ftp * 1.5)} W` : `${Math.round(ftp * pct[0] / 100)}–${Math.round(ftp * pct[1] / 100)} W`) : null;
        return (
          <li key={i}>
            <span className="today-zone-dot" style={{ background: ZONE_COLORS[b.zone] || ZONE_COLORS.Z2 }} />
            <span className="today-block-label">
              {b.reps ? `${b.reps} × ${fmtDur(b.durationMin)} ${b.label}` : b.label}
              {b.reps && <span className="today-block-rest"> / {fmtDur(b.rest.durationMin)} récup</span>}
            </span>
            <span className="today-block-meta">{b.reps ? '' : `${fmtDur(b.durationMin)} · `}{b.zone}{watts ? ` · ${watts}` : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Planned vs done for one day. */
function Review({ review, strengthPlanned, strengthDone }) {
  if (!review && !strengthPlanned && !strengthDone.length) return null;
  return (
    <div className="today-review">
      {review && (
        <>
          <div className={`today-review-head tone-${review.tone}`}>
            <strong>{review.title}</strong>
            {review.pct != null && <span className="today-muted"> · {review.pct} % de la charge prévue</span>}
          </div>
          {review.rows.length > 0 && (
            <table className="today-review-table">
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
          {review.notes.map(n => <p key={n} className="today-hint">{n}</p>)}
        </>
      )}
      {strengthDone.length > 0 ? (
        <p className="today-hint">✓ Renfo fait : {strengthDone.map(a => a.name || a.type).join(', ')}</p>
      ) : strengthPlanned && (
        <p className="today-hint today-muted">Renfo prévu ({strengthPlanned.title}) — pas d’activité enregistrée.</p>
      )}
    </div>
  );
}

function StrengthDetail({ session }) {
  return (
    <>
      <p className="today-hint">
        {session.objective} · ~{session.minutes} min · niv. {session.level}/{session.levelCount}
      </p>
      <p className="today-hint today-muted">Échauffement 5 min : {session.warmup.join(' · ')}</p>
      <ol className="today-exercises">
        {session.exercises.map((e, i) => (
          <li key={e.name}>
            <ExerciseFigure name={e.name} />
            <div className="today-exercise-text">
              <div className="today-exercise-name">{i + 1}. {e.name}</div>
              <div className="today-block-meta">{fmtDose(e)} · récup {e.rest} s</div>
              <div className="today-exercise-cue">{e.cue}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="today-note">{session.notes}</p>
    </>
  );
}

function Metric({ label, value, sub, tone }) {
  return (
    <div className="today-metric">
      <div className="today-metric-label">{label}</div>
      <div className={`today-metric-value tone-${tone || 'default'}`}>{value ?? '—'}</div>
      {sub && <div className="today-metric-sub">{sub}</div>}
    </div>
  );
}

function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return localDayKey(d);
}

function NewCycleForm({ config, onChange, onDone }) {
  const [draft, setDraft] = useState({
    phase: config.mode === 'manual' ? config.phase : 'auto',
    cycle: config.cycle,
    start: localDayKey(),
    focus: config.cycleFocus || 'auto',
  });
  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const submit = () => {
    onChange({
      ...(draft.phase === 'auto' ? { mode: 'auto' } : { mode: 'manual', phase: draft.phase, phaseStart: draft.start }),
      cycle: draft.cycle,
      cycleStart: draft.start,
      cycleFocus: draft.focus,
    });
    onDone();
  };
  return (
    <div className="today-newcycle">
      <div className="today-newcycle-title">Nouveau cycle</div>
      <p className="today-hint">Repart en semaine 1, niveau 1 des séances, puis progresse à chaque semaine de charge.</p>
      <div className="today-season-settings">
        <label>
          Début
          <div className="today-inline">
            <input type="date" value={draft.start} onChange={e => set({ start: e.target.value || localDayKey() })} />
            <button type="button" className="today-link" onClick={() => set({ start: nextMonday() })}>lundi prochain</button>
          </div>
        </label>
        <label>
          Phase
          <select value={draft.phase} onChange={e => set({ phase: e.target.value })}>
            <option value="auto">Auto (selon la date)</option>
            {PHASE_ORDER.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
          </select>
        </label>
        <label>
          Format
          <select value={draft.cycle} onChange={e => set({ cycle: e.target.value })}>
            <option value="3:1">3 sem. charge + 1 récup</option>
            <option value="2:1">2 sem. charge + 1 récup</option>
          </select>
        </label>
        <label>
          Priorité du cycle
          <select value={draft.focus} onChange={e => set({ focus: e.target.value })}>
            {Object.entries(CYCLE_FOCUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="today-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={submit}>Démarrer le cycle</button>
        <button type="button" className="btn" onClick={onDone}>Annuler</button>
      </div>
    </div>
  );
}

function SeasonSettings({ config, onChange }) {
  return (
    <div className="today-season-settings">
      <label>
        Phase
        <select value={config.mode === 'auto' ? 'auto' : config.phase}
          onChange={e => e.target.value === 'auto'
            ? onChange({ mode: 'auto' })
            : onChange({ mode: 'manual', phase: e.target.value, phaseStart: localDayKey() })}>
          <option value="auto">Auto (selon la date)</option>
          {PHASE_ORDER.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
        </select>
      </label>
      <label>
        Cycle
        <select value={config.cycle} onChange={e => onChange({ cycle: e.target.value })}>
          <option value="3:1">3 sem. charge / 1 récup</option>
          <option value="2:1">2 sem. charge / 1 récup</option>
        </select>
      </label>
      <label>
        Objectif (course A)
        <input type="text" placeholder="Nom" value={config.targetName || ''} onChange={e => onChange({ targetName: e.target.value })} />
      </label>
      <label>
        Date
        <input type="date" value={config.targetDate || ''} onChange={e => onChange({ targetDate: e.target.value || null })} />
      </label>
    </div>
  );
}

function fmtDay(key) {
  return new Date(`${key}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function CycleCard({ cycle, pending, onApply, onCancelPending }) {
  if (!cycle && !pending) return null;
  return (
    <section className="today-card">
      <div className="today-card-head">
        <h2>Cycle suggéré</h2>
        {cycle && <span className="today-pill tone-muted">dès le {fmtDay(cycle.start)}</span>}
      </div>
      {pending && (
        <p className="today-hint">
          Programmé : {PHASES[pending.phase || 'base']?.label || 'Auto'} · {pending.cycle} · départ {fmtDay(pending.cycleStart)}{' '}
          <button type="button" className="today-link" onClick={onCancelPending}>annuler</button>
        </p>
      )}
      {cycle && (
        <>
          <div className="today-session-title" style={{ fontSize: 17 }}>{cycle.title}</div>
          {cycle.summary && <p className="today-hint">{cycle.summary}</p>}
          <div className="today-cycle-weeks">
            {cycle.weeks.map((w, i) => (
              <div key={w.start} className={`today-cycle-week is-${w.kind}`}>
                <div className="today-metric-label">S{i + 1} · {w.kind === 'recovery' ? 'récup' : 'charge'}</div>
                <div className="today-data-value">{w.tss ?? '—'}<span className="today-muted"> TSS</span></div>
                <div className="today-metric-sub">{w.ctlEnd != null ? `CTL → ${w.ctlEnd} · ` : ''}{w.maxHard} dure{w.maxHard > 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
          <ul className="today-cycle-reasons">
            {cycle.reasons.map(r => <li key={r}>{r}</li>)}
          </ul>
          {cycle.matchesCurrent ? (
            <p className="today-hint">Ton cycle actuel suit déjà cette logique.</p>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onApply(cycle)}>
              Programmer ce cycle
            </button>
          )}
        </>
      )}
    </section>
  );
}

const EDIT_TYPES = ['recovery', 'endurance', 'durability', 'tempo', 'force', 'sweetspot', 'threshold', 'vo2',
  'anaerobic', 'sprint', 'race_sim', 'openers'];
const EDIT_MINUTES = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];
const TYPE_SHORT = {
  recovery: 'Réc', endurance: 'End', durability: 'Dur', tempo: 'Tmp', force: 'For', sweetspot: 'SS',
  threshold: 'Seuil', vo2: 'VO2', anaerobic: 'Ana', sprint: 'Spr', race_sim: 'Sim', openers: 'Débl', race: 'Course',
};
const SOURCE_LABELS = { override: 'modifié', planned: 'calendrier', plan: 'plan', race: 'course', moved: 'déplacée', availability: 'pas dispo' };

function weekLabel(w, i) {
  const start = new Date(`${w.start}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const when = i === 0 ? 'Cette semaine' : i === 1 ? 'Semaine prochaine' : `Semaine du ${start}`;
  const kind = w.state.isRecoveryWeek ? 'récup' : `S${w.state.weekInCycle}/${w.state.cycleLen}`;
  return { when, sub: `${w.phaseInfo.label} · ${kind}` };
}

/** Coming weeks of the plan: tap a day for the full session, change it or move it. */
function PlanAhead({ weeks, today, ftp, activities, overrides, onEdit, availability = {}, onAvailability }) {
  const [wi, setWi] = useState(0);
  const [sel, setSel] = useState(today);
  const week = weeks[wi];
  const idx = week.days.findIndex(d => d.date === sel);
  const day = idx >= 0 ? week.days[idx] : null;
  const label = weekLabel(week, wi);
  const totals = week.days.reduce((t, d) => ({
    min: t.min + (d.blocks?.length ? blocksMinutes(d.blocks) : 0), tss: t.tss + (d.tss || 0),
  }), { min: 0, tss: 0 });
  const goWeek = (i) => { setWi(i); setSel(i === 0 ? today : weeks[i].days[0].date); };
  const reviews = useMemo(() => Object.fromEntries(week.days.filter(d => d.date < today).map(d => {
    const done = activitiesOn(activities, d.date);
    return [d.date, { review: reviewSession(d, done.rides, { past: true }), strengthDone: done.strength }];
  })), [week, activities, today]);
  const dayReview = day && reviews[day.date];

  const editable = day && day.date >= today && day.source !== 'race';
  const avail = day ? availability[day.date] : null;
  const canSwap = (j) => {
    const other = week.days[j];
    return editable && other && other.date >= today && other.source !== 'race';
  };
  const swap = (j) => {
    const other = week.days[j];
    const asOverride = (d) => ({
      type: d.type, minutes: d.type === 'rest' ? 0 : Math.round(d.minutes || blocksMinutes(d.blocks)),
      strength: d.strength ? d.strength.kind : false,
    });
    onEdit({ [day.date]: asOverride(other), [other.date]: asOverride(day) });
    setSel(other.date);
  };
  const setDay = (patch) => onEdit({ [day.date]: { ...overrides[day.date], type: day.type, minutes: day.minutes || 60, ...patch } });
  // Strength alone doesn't freeze the ride: an override without its own type keeps the plan's.
  const setStrength = (v) => onEdit({ [day.date]: { ...overrides[day.date], strength: v } });

  return (
    <section className="today-card">
      <div className="today-card-head">
        <h2>Programme</h2>
        <span className="today-pill tone-muted">{Math.round(totals.min / 6) / 10} h · ~{totals.tss} TSS</span>
      </div>
      <div className="today-plan-nav">
        <button type="button" className="today-link" disabled={wi === 0} onClick={() => goWeek(wi - 1)} aria-label="Semaine précédente">‹</button>
        <div>
          <div className="today-plan-when">{label.when}</div>
          <div className="today-metric-sub">{label.sub}</div>
        </div>
        <button type="button" className="today-link" disabled={wi === weeks.length - 1} onClick={() => goWeek(wi + 1)} aria-label="Semaine suivante">›</button>
      </div>

      <div className="today-week">
        {week.days.map((d, i) => (
          <button type="button" key={d.date} onClick={() => setSel(d.date)}
            className={`today-week-day t-${d.type}${d.date === today ? ' is-today' : ''}${d.date === sel ? ' is-selected' : ''}`
              + `${d.date < today ? ' is-past' : ''}${['override', 'moved'].includes(d.source) ? ' is-edited' : ''}${d.unavailable ? ' is-off' : ''}`}>
            <div className="today-week-letter">{DAY_LETTERS[i]} {Number(d.date.slice(8))}</div>
            <div className="today-week-type">
              {d.type === 'rest' ? '—' : (
                <><span className="t-long">{TYPE_LABELS[d.type] || d.type}</span><span className="t-short">{TYPE_SHORT[d.type] || d.type}</span></>
              )}
            </div>
            {d.blocks?.length > 0 && <div className="today-week-min">{Math.round(blocksMinutes(d.blocks))}′</div>}
            {d.strength && <div className="today-week-strength" title={d.strength.title}>+ renfo</div>}
            {availability[d.date] && <div className="today-week-avail">{availability[d.date].off ? 'pas dispo' : `≤ ${Math.round(availability[d.date].minutes)}′`}</div>}
            {reviews[d.date]?.review && <span className={`today-week-check tone-${reviews[d.date].review.tone}`} title={reviews[d.date].review.title} />}
          </button>
        ))}
      </div>

      {day && (
        <div className="today-plan-day">
          <div className="today-card-head">
            <div>
              <div className="today-metric-label">{fmtDay(day.date)} · {SOURCE_LABELS[day.source]}</div>
              <div className="today-session-title" style={{ fontSize: 17 }}>
                {day.type === 'rest' ? 'Repos' : day.type === 'race' ? <><Picto name="flag" size={18} className="picto-inline" /> {day.title}</> : day.title || TYPE_LABELS[day.type]}
              </div>
            </div>
          </div>
          {day.blocks?.length > 0 && day.date !== today && (
            <>
              <p className="today-hint">
                {TYPE_LABELS[day.type]} · {Math.round(blocksMinutes(day.blocks))} min · ~{day.tss} TSS
                {day.familyLabel && day.level ? ` · ${day.familyLabel} niv. ${day.level}/${day.levelCount}` : ''}
                {day.objective ? ` · ${day.objective}` : ''}
              </p>
              <ZoneBar blocks={day.blocks} />
              <BlockList blocks={day.blocks} ftp={ftp} />
            </>
          )}
          {day.unavailable && (
            <p className="today-avail-note">
              Tu n’es pas dispo.{' '}
              {day.movedTo ? `La séance passe au ${fmtDay(day.movedTo)}.` : day.dropped ? `Pas de place pour ${TYPE_LABELS[day.dropped].toLowerCase()} sans enchaîner deux jours durs : séance sautée cette semaine.` : ''}
            </p>
          )}
          {day.movedFrom && <p className="today-avail-note">Séance déplacée du {fmtDay(day.movedFrom)} (pas dispo ce jour-là).</p>}
          {avail?.minutes && !day.unavailable && <p className="today-avail-note">Séance calée sur {availabilityLabel(avail)}.</p>}
          {day.date === today && (
            <p className="today-hint">Le détail du jour est en haut de la page.</p>
          )}
          {day.strength && day.date !== today && (
            <p className="today-plan-strength-line">
              <Picto name="strength" size={18} className="picto-inline" /> Renfo : {day.strength.title.replace(' · poids du corps', '')}, ~{day.strength.minutes} min
            </p>
          )}
          {dayReview && <Review review={dayReview.review} strengthPlanned={day.strength} strengthDone={dayReview.strengthDone} />}

          {editable && (
            <div className="today-plan-edit">
              <div className="today-plan-edit-title">Modifier ce jour</div>
              <div className="today-plan-edit-fields">
                <label>
                  <span>Vélo</span>
                  <select value={day.type} onChange={e => setDay(e.target.value === 'rest' ? { type: 'rest', minutes: 0 } : { type: e.target.value })}>
                    <option value="rest">Repos</option>
                    {EDIT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
                <label>
                  <span>Durée</span>
                  <select disabled={day.type === 'rest'} value={day.type === 'rest' ? '' : EDIT_MINUTES.includes(day.minutes) ? day.minutes : ''}
                    onChange={e => setDay({ minutes: Number(e.target.value) })}>
                    {day.type === 'rest' && <option value="">—</option>}
                    {day.type !== 'rest' && !EDIT_MINUTES.includes(day.minutes) && <option value="">{Math.round(day.minutes || 0)} min</option>}
                    {EDIT_MINUTES.map(m => <option key={m} value={m}>{fmtDur(m)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Ta dispo</span>
                  <select value={availabilityValue(availability[day.date])} onChange={e => onAvailability(day.date, e.target.value)}>
                    {AVAILABILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Renfo</span>
                  <select value={day.strength ? day.strength.kind : 'none'} onChange={e => setStrength(e.target.value === 'none' ? false : e.target.value)}>
                    <option value="none">Aucun</option>
                    {STRENGTH_KINDS.map(k => <option key={k} value={k}>{STRENGTH_LABELS[k]}</option>)}
                  </select>
                </label>
              </div>
              <div className="today-plan-edit-actions">
                <button type="button" className="btn" disabled={!canSwap(idx - 1)} onClick={() => swap(idx - 1)}>Échanger avec la veille</button>
                <button type="button" className="btn" disabled={!canSwap(idx + 1)} onClick={() => swap(idx + 1)}>Échanger avec le lendemain</button>
                {overrides[day.date] && (
                  <button type="button" className="today-link" onClick={() => onEdit({ [day.date]: null })}>Revenir au plan</button>
                )}
              </div>
            </div>
          )}
          {!editable && day.date >= today && (
            <div className="today-plan-edit">
              <div className="today-plan-edit-fields">
                <label>
                  <span>Ta dispo</span>
                  <select value={availabilityValue(availability[day.date])} onChange={e => onAvailability(day.date, e.target.value)}>
                    {AVAILABILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const TRAIT_NAMES = { volume: 'Volume', intensity: 'Intensité Z5–Z7', rest: 'Jours de repos' };

function ResponderCard({ state, enabled, onToggle }) {
  const { status, profile } = state;
  return (
    <section className="today-card">
      <div className="today-card-head">
        <h2>Ton profil de réponse</h2>
        {profile?.ready && <span className="today-pill tone-muted">{profile.blocks} blocs de 4 sem.</span>}
      </div>
      {status === 'loading' && <p className="today-hint">Calcul sur 2 ans d’entraînement…</p>}
      {(status === 'unavailable' || status === 'error') && (
        <p className="today-hint">
          {status === 'error' ? 'Impossible de charger l’historique Intervals.icu.' : 'Connecte Intervals.icu pour calculer ton profil.'}
        </p>
      )}
      {status === 'ok' && profile && !profile.ready && (
        <p className="today-hint">
          Il faut ~6 mois de sorties avec capteur de puissance : {profile.totalBlocks ?? 0} / {profile.minBlocks} blocs utilisables.
          En attendant, le plan suit la réponse moyenne.
        </p>
      )}
      {status === 'ok' && profile?.ready && (
        <>
          <p className="today-hint">
            Comment ta puissance (5 et 20 min) a réagi à tes blocs d’entraînement, comparé à ~1 400 cyclistes.
            Un trait ne change le plan que s’il sort nettement de la moyenne.
          </p>
          <div className="today-traits">
            {Object.entries(TRAIT_NAMES).map(([k, name]) => {
              const score = profile.scores[k];
              const t = profile.traits[k];
              const pos = score == null ? 50 : Math.max(0, Math.min(100, 50 + score * 25));
              return (
                <div key={k} className="today-trait">
                  <div className="today-trait-name">{name}</div>
                  <div className="today-trait-scale" title={score == null ? '' : `score ${score.toFixed(2)}`}>
                    <span className="today-trait-band" />
                    <span className={`today-trait-dot${t ? ' is-on' : ''}`} style={{ left: `${pos}%` }} />
                  </div>
                  <div className="today-trait-text">
                    {t ? <><strong>{TRAIT_TEXT[k][t].label}</strong> → {TRAIT_TEXT[k][t].plan}</> : <span className="today-muted">Dans la moyenne</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {Object.values(profile.traits).some(Boolean) && (
            <label className="today-sick">
              <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)} />
              Adapter mon plan à ce profil
            </label>
          )}
        </>
      )}
    </section>
  );
}

const LIMITER_LABELS = { sprint: 'Sprint (5 s)', punch: 'Punch (1 min)', vo2max: 'VO2 max (5 min)', threshold: 'Seuil (FTP)' };

function DataCard({ analysis }) {
  const { week, distribution, hrv, lastHard, profile, load, signals } = analysis;
  const weekPct = week.weekTarget ? Math.min(100, Math.round((week.doneTss / week.weekTarget) * 100)) : 0;
  return (
    <section className="today-card">
      <div className="today-card-head">
        <h2>Ce que disent tes données</h2>
        {load.ramp7 != null && (
          <span className={`today-pill tone-${load.ramp7 > 8 ? 'red' : load.ramp7 < -5 ? 'yellow' : 'muted'}`}>
            {load.ramp7 >= 0 ? '+' : ''}{load.ramp7.toFixed(1)} CTL / 7 j
          </span>
        )}
      </div>

      <div className="today-data-grid">
        {week.weekTarget != null && (
          <div className="today-data-item">
            <div className="today-metric-label">Charge semaine</div>
            <div className="today-data-value">{week.doneTss} <span className="today-muted">/ {week.weekTarget} TSS</span></div>
            <div className="today-meter"><div style={{ width: `${weekPct}%` }} /></div>
            <div className="today-metric-sub">
              Cible {week.rampTarget >= 0 ? '+' : ''}{week.rampTarget} CTL/sem
              {week.perDay != null && week.daysLeft > 0 ? ` · ~${week.perDay} TSS/jour restant` : ''}
            </div>
          </div>
        )}
        <div className="today-data-item">
          <div className="today-metric-label">Séances dures</div>
          <div className="today-data-value">{week.hard + (week.hardToday ? 1 : 0)} <span className="today-muted">/ {week.maxHard} max</span></div>
          <div className="today-metric-sub">
            {week.hardToday ? 'Dernière : aujourd’hui'
              : lastHard ? `Dernière : ${lastHard.daysAgo === 1 ? 'hier' : `il y a ${lastHard.daysAgo} j`}` : 'Aucune récente'}
          </div>
        </div>
        {distribution && (
          <div className="today-data-item">
            <div className="today-metric-label">Distribution 28 j · {distribution.hours} h</div>
            <div className="today-dist">
              <div className="d-low" style={{ width: `${distribution.low}%` }} />
              <div className="d-mid" style={{ width: `${distribution.mid}%` }} />
              <div className="d-high" style={{ width: `${distribution.high}%` }} />
            </div>
            <div className="today-metric-sub">
              {distribution.low}% facile · {distribution.mid}% Z3 · {distribution.high}% dur <span className="today-muted">(cible ~80/5/15)</span>
            </div>
          </div>
        )}
        {hrv && (
          <div className="today-data-item">
            <div className="today-metric-label">VFC 7 j vs norme 60 j</div>
            <div className={`today-data-value tone-${hrv.status === 'low' ? 'red' : hrv.status === 'high' ? 'green' : 'default'}`}>
              {hrv.roll7} ms
            </div>
            <div className="today-metric-sub">Norme {hrv.band[0]}–{hrv.band[1]} ms{hrv.today ? ` · ce matin ${hrv.today}` : ''}</div>
          </div>
        )}
        {profile && (
          <div className="today-data-item">
            <div className="today-metric-label">Profil de puissance</div>
            <div className="today-profile">
              {profile.rows.map(r => (
                <div key={r.key} className={r.key === profile.limiter ? 'is-limiter' : ''} title={`${r.watts} W · ${r.wkg} W/kg`}>
                  <span>{r.label}</span>
                  <div className="today-meter"><div style={{ width: `${Math.round(r.score * 100)}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="today-metric-sub">
              {profile.limiter ? `Point faible mesuré : ${LIMITER_LABELS[profile.limiter]}` : 'Profil équilibré'}
            </div>
          </div>
        )}
      </div>

      {signals.length > 0 && (
        <ul className="today-signals">
          {signals.map(sig => (
            <li key={sig.id} className={`tone-${sig.tone}`}>
              <strong>{sig.title}</strong> — {sig.detail}
              {sig.ref && <span className="today-ref-inline"> [{sig.ref}]</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────────────────── main ───────────────────────── */

export default function Today({
  wellness = [], activities = [], athlete, events = [], plannedEvents = [], powerCurve = null, loading,
  onAddPlannedEvent, onRemovePlannedEvent, onExportToZwift, onSendToWahoo, onOpenCalendar,
}) {
  const today = localDayKey();
  const [checkin, setCheckin] = useState(DEFAULT_CHECKIN);
  const [season, setSeason] = useState(DEFAULT_SEASON_CONFIG);
  const [showSeasonSettings, setShowSeasonSettings] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const profile = useMemo(() => loadProfile() || {}, []);

  useEffect(() => {
    persistence.getPref(`checkin-${today}`, null)
      .then(c => { if (c) setCheckin({ ...DEFAULT_CHECKIN, ...c }); })
      .catch(() => { });
    persistence.getPref('season-config', null)
      .then(c => { if (c) setSeason({ ...DEFAULT_SEASON_CONFIG, ...c }); })
      .catch(() => { });
  }, [today]);

  const updateCheckin = (patch) => {
    setCheckin(prev => {
      const next = { ...prev, ...patch };
      persistence.savePref(`checkin-${today}`, next).catch(() => { });
      return next;
    });
    setSaved(null);
  };

  // Hand edits of single days; value null = back to the plan. Past days are dropped.
  const editDays = (patch) => {
    setSeason(prev => {
      const cur = Object.fromEntries(Object.entries(prev.dayOverrides || {}).filter(([k]) => k >= today));
      Object.entries(patch).forEach(([k, v]) => { if (v) cur[k] = v; else delete cur[k]; });
      const next = { ...prev, dayOverrides: cur };
      persistence.savePref('season-config', next).catch(() => { });
      return next;
    });
  };

  const updateSeason = (patch) => {
    setSeason(prev => {
      const next = { ...prev, ...patch };
      persistence.savePref('season-config', next).catch(() => { });
      return next;
    });
  };

  const ftp = num(athlete?.icu_ftp) || num(athlete?.ftp) || null;
  const responderState = useResponderProfile();
  const useResponder = season.useResponder !== false;
  const responder = useResponder && responderState.profile?.ready ? responderState.profile.traits : null;

  // Days the rider can't ride or has limited time (set here or in the calendar).
  const [availability, setAvail] = useState({});
  useEffect(() => {
    loadAvailability().then(setAvail);
    const onChange = (e) => setAvail(e.detail || {});
    window.addEventListener('availability-changed', onChange);
    return () => window.removeEventListener('availability-changed', onChange);
  }, []);

  const day = useMemo(() => computeDay({
    wellness, activities, athlete, events, plannedEvents, powerCurve,
    season, profileWeaknesses: profile.weaknesses || [], checkin, today, responder, availability,
  }), [wellness, activities, athlete, events, plannedEvents, powerCurve, season, profile.weaknesses, checkin, today, responder, availability]);
  const {
    physio, cal, seasonState, analysis, readiness, base, adapted, strength, cycle, changes, form, phaseInfo,
    level: lvl,
  } = day;
  const outlook = useMemo(() => buildOutlook({
    season, plannedEvents, events, weaknesses: day.weaknesses, today, weeks: 4, responder, availability,
  }), [season, plannedEvents, events, day.weaknesses, today, responder, availability]);

  // Keep what was prescribed today so the session analysis can compare the ride to it.
  // The prescription is built from the start-of-day state, so it stays put once ridden.
  useEffect(() => {
    if (loading) return;
    const rx = cal.race ? { type: 'race', title: cal.race.name || cal.race.title || 'Course' }
      : base.rest || readiness.level === 'rest' || !adapted ? { type: 'rest' }
      : { type: adapted.trainingType, title: adapted.title, objective: adapted.objective, blocks: adapted.blocks, minutes: adapted.minutes };
    persistence.savePref(`prescription-${today}`, { ...rx, date: today, strength: strength ? strength.title : null }).catch(() => { });
  }, [loading, today, cal.race, base.rest, readiness.level, adapted, strength]);

  // Persist a scheduled cycle once its start date is reached.
  useEffect(() => {
    const p = season.pendingCycle;
    if (p?.cycleStart && p.cycleStart <= today) updateSeason({ ...p, pendingCycle: null });
  }, [season.pendingCycle, today]);

  // Prescription is built from the start-of-day state, so it can be compared with what was done.
  const doneToday = useMemo(() => activitiesOn(activities, today), [activities, today]);
  const todayReview = useMemo(() => (cal.race ? null : reviewSession(
    adapted && readiness.level !== 'rest' ? { type: adapted.trainingType, blocks: adapted.blocks } : { type: 'rest' },
    doneToday.rides,
  )), [cal.race, adapted, readiness.level, doneToday]);
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const workoutForExport = adapted ? {
    title: adapted.title, name: adapted.title, notes: adapted.objective,
    blocks: adapted.blocks, workoutBlocks: adapted.blocks, type: 'Ride',
  } : null;

  // Widgets: push a compact copy of today's decision + what the server cron needs to redo it.
  useEffect(() => {
    if (loading) return undefined;
    const timer = setTimeout(() => {
      const horizon = localDayKey(new Date(Date.now() + 21 * 86400000));
      pushWidgetSnapshot(buildSnapshot(day, { ftp, source: 'app' }), {
        season,
        profileWeaknesses: profile.weaknesses || [],
        responder,
        checkin: { date: today, ...checkin },
        plannedEvents: plannedEvents.filter(e => dayOf(e) >= today && dayOf(e) <= horizon),
        athlete: { icu_ftp: ftp, icu_weight: num(athlete?.icu_weight) || num(athlete?.weight) || null },
        availability: Object.fromEntries(Object.entries(availability).filter(([k]) => k <= horizon)),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [loading, day, ftp, athlete, season, profile.weaknesses, checkin, plannedEvents, today, responder, availability]);

  const handleSave = async () => {
    if (!adapted || !onAddPlannedEvent) return;
    setBusy(true);
    try {
      if (cal.planned?._local && cal.planned.id && onRemovePlannedEvent) await onRemovePlannedEvent(cal.planned.id);
      await onAddPlannedEvent({
        name: adapted.title, title: adapted.title, type: 'Ride', event_type: 'Ride',
        kind: 'training', trainingType: adapted.trainingType,
        start_date_local: `${today}T07:00:00`,
        notes: `${adapted.objective}${changes.length ? ` | Adapté : ${changes.join(', ')}` : ''}`,
        workoutBlocks: adapted.blocks, source: 'today',
      });
      setSaved('Séance enregistrée dans le calendrier');
    } catch (err) {
      setSaved(`Erreur : ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const minuteOptions = [30, 45, 60, 90, 120, 180];
  const noSession = cal.race || base.rest;

  return (
    <div className="today">
      <header className="today-header today-hero">
        <SeasonLandscape season={seasonOf(new Date()).key} className="today-hero-art" />
        <div>
          <div className="today-date">{dateLabel}</div>
          <h1 className="today-title">Aujourd’hui</h1>
          <div className="today-hero-phase">{seasonOf(new Date()).label} · phase {phaseInfo.label.toLowerCase()}</div>
        </div>
        {cal.nextRaceDays != null && (
          <div className="today-race-chip">
            {cal.nextRaceDays === 0 ? 'Course aujourd’hui' : `Course dans ${cal.nextRaceDays} j`}
          </div>
        )}
      </header>

      {/* ── 3. Today's session ── */}
      <section className={`today-card today-session tone-border-${lvl.tone}`}>
        <div className="today-card-head">
          <h2>Séance du jour</h2>
          {!noSession && <span className={`today-pill tone-${lvl.tone}`}>{lvl.title}</span>}
        </div>

        {todayReview && (
          <div className="today-done">
            ✓ Fait : {doneToday.rides.map(a => `${a.name || a.type}${a.icu_training_load ? ` (${Math.round(a.icu_training_load)} TSS)` : ''}`).join(', ')}
            <Review review={todayReview} strengthPlanned={null} strengthDone={[]} />
          </div>
        )}

        {cal.race ? (
          <div>
            <div className="today-session-title"><Picto name="flag" size={22} className="picto-inline" /> {cal.race.name || cal.race.title || 'Course'}</div>
            <p className="today-hint">
              Jour de course. Échauffement 20–30 min avec 2–3 accélérations, mange 2–3 h avant, bois régulièrement.
              {physio.tsb != null && physio.tsb < -10 && ' Ta forme est basse : pars prudemment et reste abrité.'}
            </p>
          </div>
        ) : base.unavailable ? (
          <div>
            <div className="today-session-title">Pas dispo aujourd’hui</div>
            <p className="today-hint">
              {base.movedTo ? `Ta séance passe au ${fmtDay(base.movedTo)}.` : base.dropped ? 'Pas de place cette semaine pour la séance prévue sans enchaîner deux jours durs : elle saute.' : 'Profite pour récupérer.'}
            </p>
          </div>
        ) : base.rest ? (
          <div>
            <div className="today-session-title">Jour de repos</div>
            <p className="today-hint">
              {base.source === 'season' ? `Repos prévu par ta phase ${phaseInfo.label.toLowerCase()}.` : 'Repos prévu au calendrier.'}
              {' '}Mobilité légère ou marche si tu veux bouger.
            </p>
          </div>
        ) : readiness.level === 'rest' ? (
          <div>
            <div className="today-session-title">Repos conseillé</div>
            <p className="today-hint">{lvl.text}</p>
          </div>
        ) : adapted && (
          <>
            <div className="today-session-title">{adapted.title}</div>
            <p className="today-hint">{fmtDur(adapted.minutes)} · {adapted.objective}</p>
            {readiness.level !== 'go' && <p className="today-verdict-short">{lvl.text}</p>}
            <ZoneBar blocks={adapted.blocks} />
            <BlockList blocks={adapted.blocks} ftp={ftp} />
            {base.notes && adapted.trainingType === base.trainingType && <p className="today-note">{base.notes}</p>}

            <div className="today-actions">
              {onAddPlannedEvent && (
                <button className="btn btn-primary" onClick={handleSave} disabled={busy}>
                  {cal.planned?._local ? 'Remplacer dans le calendrier' : 'Ajouter au calendrier'}
                </button>
              )}
              {onExportToZwift && (
                <button className="btn" onClick={() => onExportToZwift(workoutForExport)}>Export Zwift</button>
              )}
              {onSendToWahoo && (
                <button className="btn" onClick={() => onSendToWahoo(workoutForExport).then(() => setSaved('Envoyé à Wahoo')).catch(e => setSaved(`Erreur : ${e.message}`))}>
                  Envoyer à Wahoo
                </button>
              )}
            </div>
            {saved && <div className="today-saved">{saved}</div>}

            <details className="today-why">
              <summary>Pourquoi cette séance ?</summary>
              <div className="today-plan-line">
                {base.source === 'planned' && <>Prévu : <strong>{base.title}</strong> · {Math.round(blocksMinutes(base.blocks))} min</>}
                {base.source === 'planned-matched' && <>Prévu : <strong>{base.plannedName}</strong> — structure tirée de la bibliothèque</>}
                {base.source === 'season' && <>Rien au calendrier — séance du plan <strong>{phaseInfo.label}</strong> : {TYPE_LABELS[base.trainingType]}</>}
              </div>
              {base.dataChanges?.length > 0 && (
                <div className="today-changes">
                  {base.dataChanges.map(c => (
                    <span key={c.text} className="today-change is-data" title={c.ref}>{c.text}</span>
                  ))}
                </div>
              )}

              {readiness.reasons.length > 0 && readiness.level !== 'go' && (
                <p className="today-hint">Ta forme du jour : {readiness.reasons.join(', ')}.</p>
              )}

              {changes.length > 0 && (
                <div className="today-changes">
                  {changes.map(c => <span key={c} className="today-change">{c}</span>)}
                </div>
              )}

              {base.family && adapted.trainingType === base.trainingType && (
                <div className="today-progress">
                  <span className="today-progress-label">{base.familyLabel}</span>
                  <span className="today-progress-steps">
                    {Array.from({ length: base.levelCount }, (_, i) => (
                      <span key={i} className={i < base.level ? 'on' : ''} />
                    ))}
                  </span>
                  <span>Niveau {base.level}/{base.levelCount}</span>
                  {nextLevelOf(base) && <span className="today-muted">· ensuite : {nextLevelOf(base).title}</span>}
                </div>
              )}
              <p className="today-hint">~{estimateTss(adapted.blocks)} TSS prévus.</p>
              {base.ref && <p className="today-ref">Réf. : {base.ref}</p>}
            </details>
          </>
        )}
      </section>


      {/* ── 2. Check-in → readiness ── */}
      <section className="today-card">
        <div className="today-card-head">
          <h2>Comment tu te sens ce matin ?</h2>
        </div>
        <div className="today-checkin">
          {CHECKIN_QUESTIONS.map(q => (
            <div key={q.key} className="today-q">
              <div className="today-q-label">{q.label}</div>
              <div className="today-seg">
                {q.options.map(o => (
                  <button key={o.v} type="button"
                    className={checkin[q.key] === o.v ? 'on' : ''}
                    onClick={() => updateCheckin({ [q.key]: o.v })}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="today-q">
            <div className="today-q-label">Temps dispo</div>
            <div className="today-seg">
              <button type="button" className={!checkin.minutes ? 'on' : ''} onClick={() => updateCheckin({ minutes: null })}>
                Comme prévu
              </button>
              {minuteOptions.map(m => (
                <button key={m} type="button" className={checkin.minutes === m ? 'on' : ''} onClick={() => updateCheckin({ minutes: m })}>
                  {m < 60 ? `${m}′` : `${Math.floor(m / 60)}h${m % 60 ? '30' : ''}`}
                </button>
              ))}
            </div>
          </div>
          <label className="today-sick">
            <input type="checkbox" checked={!!checkin.sick} onChange={e => updateCheckin({ sick: e.target.checked })} />
            Malade ou douleur
          </label>
        </div>

        <div className={`today-readiness tone-${lvl.tone}`}>
          <div className="today-readiness-bar">
            <div style={{ width: `${readiness.score}%` }} />
            <span style={{ left: '25%' }} /><span style={{ left: '45%' }} /><span style={{ left: '65%' }} />
          </div>
          <div className="today-readiness-text">
            <strong>{readiness.score}/100 · {lvl.title}</strong>
            {!noSession && <> → {lvl.effect}{checkin.minutes ? `, limité à ${checkin.minutes} min` : ''}</>}
          </div>
        </div>
      </section>


      {strength && (
        <section className="today-card">
          <div className="today-card-head">
            <h2>Renfo du jour</h2>
            {doneToday.strength.length > 0
              ? <span className="today-pill tone-green">✓ fait</span>
              : strength.adjusted && <span className="today-pill tone-yellow">{strength.adjusted}</span>}
          </div>
          <div className="today-session-title" style={{ fontSize: 17 }}>{strength.title}</div>
          <StrengthDetail session={strength} />
          <p className="today-hint today-muted">
            {adapted ? 'Après la sortie ou au moins 6 h plus tard. ' : ''}Sans matériel : une chaise, un mur.
          </p>
          <p className="today-ref">Réf. : {strength.ref}</p>
        </section>
      )}


      <PlanAhead weeks={outlook} today={today} ftp={ftp} activities={activities} overrides={season.dayOverrides || {}} onEdit={editDays}
        availability={availability} onAvailability={(date, v) => setAvailability(date, v).then(setAvail)} />

      <details className="today-more">
        <summary>
          <span className="today-more-title">Comprendre ma forme et mon plan</span>
          <span className="today-more-sub">Forme, charge, saison, cycle, profil</span>
        </summary>
        <div className="today-more-body">
        {/* ── 1. Form ── */}
        <section className="today-card">
          <div className="today-card-head">
            <h2>Ta forme</h2>
            <span className={`today-pill tone-${form.tone}`}>{form.label}</span>
          </div>
          <p className="today-hint">{loading && physio.ctl == null ? 'Chargement…' : form.hint}</p>
          <div className="today-metrics">
            <Metric label="Forme (TSB)" value={physio.tsb != null ? Math.round(physio.tsb) : null} tone={form.tone} />
            <Metric label="Condition (CTL)" value={physio.ctl != null ? Math.round(physio.ctl) : null} />
            <Metric label="Fatigue (ATL)" value={physio.atl != null ? Math.round(physio.atl) : null} />
            {physio.hrv != null && (
              <Metric label="VFC" value={Math.round(physio.hrv)}
                sub={physio.hrvRatio ? `${physio.hrvRatio >= 1 ? '+' : ''}${Math.round((physio.hrvRatio - 1) * 100)}% vs 7 j` : null}
                tone={physio.hrvRatio && physio.hrvRatio < 0.9 ? 'red' : 'default'} />
            )}
            {physio.rhr != null && (
              <Metric label="FC repos" value={Math.round(physio.rhr)}
                sub={physio.rhrDelta != null ? `${physio.rhrDelta >= 0 ? '+' : ''}${Math.round(physio.rhrDelta)} vs 7 j` : null}
                tone={physio.rhrDelta != null && physio.rhrDelta >= 5 ? 'red' : 'default'} />
            )}
          </div>
        </section>


        <DataCard analysis={analysis} />

        <ResponderCard state={responderState} enabled={useResponder} onToggle={v => updateSeason({ useResponder: v })} />

        {/* ── 0. Season ── */}
        <section className="today-card">
          <div className="today-card-head">
            <h2>Phase : {phaseInfo.label}</h2>
            <span className={`today-pill tone-${seasonState.isRecoveryWeek ? 'blue' : 'muted'}`}>
              {seasonState.isRecoveryWeek
                ? 'Semaine de récup'
                : `Semaine ${seasonState.weekInCycle}/${seasonState.cycleLen} · charge`}
            </span>
          </div>
          <p className="today-hint">{phaseInfo.desc} <span className="today-muted">({seasonState.reason})</span></p>
          <div className="today-inline">
            <button type="button" className="today-link" onClick={() => { setShowNewCycle(v => !v); setShowSeasonSettings(false); }}>
              + Nouveau cycle
            </button>
            <button type="button" className="today-link" onClick={() => { setShowSeasonSettings(v => !v); setShowNewCycle(false); }}>
              {showSeasonSettings ? 'Fermer' : 'Régler la saison'}
            </button>
            {season.cycleStart && (
              <span className="today-muted">
                Cycle depuis le {new Date(`${season.cycleStart}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                {season.cycleFocus && season.cycleFocus !== 'auto' ? ` · priorité ${CYCLE_FOCUS[season.cycleFocus].toLowerCase()}` : ''}
              </span>
            )}
          </div>
          {showNewCycle && <NewCycleForm config={season} onChange={updateSeason} onDone={() => setShowNewCycle(false)} />}
          {showSeasonSettings && <SeasonSettings config={season} onChange={updateSeason} />}
        </section>

        <CycleCard
          cycle={cycle}
          pending={season.pendingCycle}
          onApply={(c) => updateSeason(c.start <= today ? { ...c.config, pendingCycle: null } : { pendingCycle: { ...c.config, phase: c.phase } })}
          onCancelPending={() => updateSeason({ pendingCycle: null })}
        />

        </div>
      </details>

      <div className="today-footer">
        {onOpenCalendar && <button className="btn" onClick={onOpenCalendar}>Voir le calendrier</button>}
      </div>
    </div>
  );
}
