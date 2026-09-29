import React, { useEffect, useMemo, useState } from 'react';
import persistence from '../services/persistence';
import { loadProfile } from '../services/athlete-profile';
import { PHASES, PHASE_ORDER, DEFAULT_SEASON_CONFIG, CYCLE_FOCUS, blocksMinutes, nextLevelOf } from '../services/periodization';
import { estimateTss } from '../services/coachEngine';
import {
  ZONE_PCT, TYPE_LABELS, CHECKIN_QUESTIONS, DEFAULT_CHECKIN, localDayKey, dayOf, num, fmtDur, groupBlocks,
  computeDay, buildSnapshot,
} from '../services/dailyPlan';
import { pushWidgetSnapshot } from '../services/widgetSnapshot';

/* ───────────────────────── helpers ───────────────────────── */

const ZONE_COLORS = {
  Z1: '#94a3b8', Z2: '#22c55e', Z3: '#eab308',
  Z4: '#f97316', Z5: '#ef4444', Z6: '#dc2626', Z7: '#a855f7',
};
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];


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
            {PHASE_ORDER.map(p => <option key={p} value={p}>{PHASES[p].label} — {PHASES[p].season}</option>)}
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
          <div className="today-data-value">{week.hard} <span className="today-muted">/ {week.maxHard} max</span></div>
          <div className="today-metric-sub">
            {lastHard ? `Dernière : ${lastHard.daysAgo === 0 ? 'aujourd’hui' : lastHard.daysAgo === 1 ? 'hier' : `il y a ${lastHard.daysAgo} j`}` : 'Aucune récente'}
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

  const updateSeason = (patch) => {
    setSeason(prev => {
      const next = { ...prev, ...patch };
      persistence.savePref('season-config', next).catch(() => { });
      return next;
    });
  };

  const ftp = num(athlete?.icu_ftp) || num(athlete?.ftp) || null;

  const day = useMemo(() => computeDay({
    wellness, activities, athlete, events, plannedEvents, powerCurve,
    season, profileWeaknesses: profile.weaknesses || [], checkin, today,
  }), [wellness, activities, athlete, events, plannedEvents, powerCurve, season, profile.weaknesses, checkin, today]);
  const {
    physio, cal, seasonState, analysis, week, readiness, base, adapted, cycle, changes, form, phaseInfo,
    level: lvl,
  } = day;

  // Persist a scheduled cycle once its start date is reached.
  useEffect(() => {
    const p = season.pendingCycle;
    if (p?.cycleStart && p.cycleStart <= today) updateSeason({ ...p, pendingCycle: null });
  }, [season.pendingCycle, today]);

  const doneToday = useMemo(() => activities.filter(a => dayOf(a) === today), [activities, today]);
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
        checkin: { date: today, ...checkin },
        plannedEvents: plannedEvents.filter(e => dayOf(e) >= today && dayOf(e) <= horizon),
        athlete: { icu_ftp: ftp, icu_weight: num(athlete?.icu_weight) || num(athlete?.weight) || null },
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [loading, day, ftp, athlete, season, profile.weaknesses, checkin, plannedEvents, today]);

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
      <header className="today-header">
        <div>
          <div className="today-date">{dateLabel}</div>
          <h1 className="today-title">Aujourd’hui</h1>
        </div>
        {cal.nextRaceDays != null && (
          <div className="today-race-chip">
            {cal.nextRaceDays === 0 ? 'Course aujourd’hui' : `Course dans ${cal.nextRaceDays} j`}
          </div>
        )}
      </header>

      {/* ── 0. Season ── */}
      <section className="today-card">
        <div className="today-card-head">
          <h2>Saison : {phaseInfo.label} <span className="today-muted">· {phaseInfo.season}</span></h2>
          <span className={`today-pill tone-${seasonState.isRecoveryWeek ? 'blue' : 'muted'}`}>
            {seasonState.isRecoveryWeek
              ? 'Semaine de récup'
              : `Semaine ${seasonState.weekInCycle}/${seasonState.cycleLen} · charge`}
          </span>
        </div>
        <p className="today-hint">{phaseInfo.desc} <span className="today-muted">({seasonState.reason})</span></p>
        <div className="today-week">
          {week.map((d, i) => (
            <div key={d.date} className={`today-week-day${d.date === today ? ' is-today' : ''} t-${d.type}`}>
              <div className="today-week-letter">{DAY_LETTERS[i]}</div>
              <div className="today-week-type">{d.type === 'rest' ? '—' : TYPE_LABELS[d.type]}</div>
              {d.minutes > 0 && <div className="today-week-min">{d.minutes}′</div>}
            </div>
          ))}
        </div>
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

      {/* ── 2. Check-in → readiness ── */}
      <section className="today-card">
        <div className="today-card-head">
          <h2>Comment tu te sens ?</h2>
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

      {/* ── 3. Today's session ── */}
      <section className={`today-card today-session tone-border-${lvl.tone}`}>
        <div className="today-card-head">
          <h2>Séance du jour</h2>
          {!noSession && <span className={`today-pill tone-${lvl.tone}`}>{lvl.title}</span>}
        </div>

        {doneToday.length > 0 && (
          <div className="today-done">
            ✓ Déjà fait : {doneToday.map(a => `${a.name || a.type}${a.icu_training_load ? ` (${Math.round(a.icu_training_load)} TSS)` : ''}`).join(', ')}
          </div>
        )}

        {cal.race ? (
          <div>
            <div className="today-session-title">🏁 {cal.race.name || cal.race.title || 'Course'}</div>
            <p className="today-hint">
              Jour de course. Échauffement 20–30 min avec 2–3 accélérations, mange 2–3 h avant, bois régulièrement.
              {physio.tsb != null && physio.tsb < -10 && ' Ta forme est basse : pars prudemment et reste abrité.'}
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

            <div className="today-verdict">
              <strong>{lvl.text}</strong>
              {readiness.reasons.length > 0 && readiness.level !== 'go' && (
                <span> Pourquoi : {readiness.reasons.join(' · ')}.</span>
              )}
            </div>

            {changes.length > 0 && (
              <div className="today-changes">
                {changes.map(c => <span key={c} className="today-change">{c}</span>)}
              </div>
            )}

            <div className="today-session-title">{adapted.title}</div>
            <p className="today-hint">{adapted.objective} · {adapted.minutes} min · ~{estimateTss(adapted.blocks)} TSS</p>
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
            {base.notes && adapted.trainingType === base.trainingType && <p className="today-note">{base.notes}</p>}
            {base.ref && <p className="today-ref">Réf. : {base.ref}</p>}
            <ZoneBar blocks={adapted.blocks} />
            <BlockList blocks={adapted.blocks} ftp={ftp} />

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
          </>
        )}
      </section>

      <div className="today-footer">
        {onOpenCalendar && <button className="btn" onClick={onOpenCalendar}>Voir le calendrier</button>}
      </div>
    </div>
  );
}
