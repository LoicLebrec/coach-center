import React, { useMemo, useState, useEffect } from 'react';
import trainingPlanner from '../services/training-planner.js';
import persistence from '../services/persistence';
import HelpPopup from './HelpPopup';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

const SESSION_TYPE_COLOR = {
  rest: '#475569',
  recovery: '#475569',
  endurance: '#22c55e',
  sweetspot: '#3b82f6',
  threshold: '#f97316',
  vo2: '#ef4444',
  openers: '#a855f7',
  race: '#f0b429',
};

const SESSION_TYPE_ICON = {
  rest: '—',
  recovery: 'Z1',
  endurance: 'Z2',
  sweetspot: 'SS',
  threshold: 'FTP',
  vo2: 'VO2',
  openers: '↑',
  race: '⚑',
};

const PHASE_BADGE_COLOR = {
  RECOVERY: '#475569',
  BASE: '#22c55e',
  BUILD: '#4d7fe8',
  PEAK: '#f77f3a',
  TAPER: '#f0b429',
};

const PHASE_LABEL = {
  RECOVERY: 'RÉCUPÉRATION',
  BASE: 'BASE',
  BUILD: 'DÉVELOPPEMENT',
  PEAK: 'POINTE',
  TAPER: 'AFFÛTAGE',
};

const SEVERITY_COLOR = {
  info: 'var(--accent-cyan)',
  warning: 'var(--accent-orange)',
  critical: 'var(--accent-red)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function sessionToEvent(session) {
  return {
    title: session.title,
    type: 'Ride',
    kind: session.isRaceDay ? 'race' : 'training',
    start_date_local: `${session.date}T09:00:00`,
    durationMin: session.durationMin,
    notes: session.reasoning,
    workoutBlocks: session.workoutBlocks,
    trainingType: session.type,
  };
}

function isDatePlanned(date, plannedEvents) {
  return (plannedEvents || []).some(ev => {
    const evDate = (ev.date || ev.start_date_local || '').split('T')[0];
    return evDate === date;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhaseBadge({ phase }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        background: PHASE_BADGE_COLOR[phase] + '33',
        color: PHASE_BADGE_COLOR[phase],
        border: `1px solid ${PHASE_BADGE_COLOR[phase]}55`,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {PHASE_LABEL[phase] || phase}
    </span>
  );
}

function SignalChip({ signal }) {
  const color = SEVERITY_COLOR[signal.severity] || 'var(--text-2)';
  return (
    <span
      title={signal.message}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 9px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: color + '22',
        color,
        border: `1px solid ${color}44`,
        cursor: 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {signal.severity === 'critical' ? '⚠ ' : signal.severity === 'warning' ? '! ' : 'i '}
      {signal.label}
    </span>
  );
}

function DayCard({ session, isPlanned, onAdd }) {
  const typeColor = SESSION_TYPE_COLOR[session.type] || '#475569';
  const icon = SESSION_TYPE_ICON[session.type] || '?';
  const isRest = session.type === 'rest';

  return (
    <div
      style={{
        background: 'var(--bg-2)',
        borderRadius: 10,
        padding: '20px 10px 12px',
        minWidth: 120,
        flex: '1 1 120px',
        cursor: isRest ? 'default' : 'pointer',
        position: 'relative',
        border: '1px solid var(--border)',
        boxSizing: 'border-box',
        opacity: isRest ? 0.6 : 1,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => {
        if (!isRest) e.currentTarget.style.borderColor = typeColor;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {/* Top color bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: '10px 10px 0 0',
          background: typeColor,
        }}
      />

      {/* Day label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          marginBottom: 2,
        }}
      >
        {DAY_LABELS[session.dayIndex]}
      </div>

      {/* Date */}
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-3)',
          fontFamily: 'var(--font-mono)',
          marginBottom: 8,
        }}
      >
        {formatDate(session.date)}
      </div>

      {/* Icon */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: typeColor,
          fontFamily: 'var(--font-mono)',
          marginBottom: 4,
        }}
      >
        {icon}
      </div>

      {/* Session title */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-0)',
          marginBottom: 6,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={session.title}
      >
        {session.title}
      </div>

      {/* Duration + TSS badges */}
      {!isRest && !session.isRaceDay && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            marginBottom: 6,
          }}
        >
          {session.durationMin > 0 && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                padding: '1px 6px',
                borderRadius: 4,
                background: 'var(--bg-3)',
                color: 'var(--text-2)',
              }}
            >
              {session.durationMin}min
            </span>
          )}
          {session.estimatedTSS > 0 && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                padding: '1px 6px',
                borderRadius: 4,
                background: typeColor + '22',
                color: typeColor,
              }}
            >
              ~{session.estimatedTSS} TSS
            </span>
          )}
        </div>
      )}

      {/* Reasoning */}
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-3)',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          marginBottom: isRest ? 0 : 20,
        }}
        title={session.reasoning}
      >
        {session.reasoning}
      </div>

      {/* Add button or planned indicator */}
      {!isRest && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
          }}
        >
          {isPlanned ? (
            <span
              title="Déjà planifié"
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent-green)',
              }}
            />
          ) : (
            <button
              onClick={e => {
                e.stopPropagation();
                onAdd(session);
              }}
              title="Ajouter au calendrier"
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `1px solid ${typeColor}`,
                background: typeColor + '22',
                color: typeColor,
                fontSize: 14,
                lineHeight: '20px',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = typeColor + '55';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = typeColor + '22';
              }}
            >
              +
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SuggestedWeek({
  wellness,
  activities,
  plannedEvents,
  athlete,
  onAddSession,
  onAddAll,
}) {
  const [athleteProfile, setAthleteProfile] = useState(null);

  useEffect(() => {
    persistence.getAthleteProfile().then(p => {
      if (p && typeof p === 'object') setAthleteProfile(p);
    }).catch(() => {});
  }, []);

  const prescription = useMemo(() => {
    try {
      return trainingPlanner.buildWeekPrescription(
        wellness || [],
        activities || [],
        plannedEvents || [],
        athlete || {},
        athleteProfile
      );
    } catch (err) {
      console.error('[SuggestedWeek] buildWeekPrescription failed:', err);
      return null;
    }
  }, [wellness, activities, plannedEvents, athlete, athleteProfile]);

  if (!prescription) {
    return (
      <div className="card">
        <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 8 }}>
          Impossible de générer la prescription. Vérifiez les données disponibles.
        </div>
      </div>
    );
  }

  const { phase, phaseReason, signals, sessions, weekTSS, nextRace } = prescription;

  // Most critical signal for the detail bar
  const topSignal = signals.length > 0 ? signals[0] : null;
  const displaySignals = signals.slice(0, 2);

  function handleAddSession(session) {
    if (!onAddSession) return;
    onAddSession(sessionToEvent(session));
  }

  function handleAddAll() {
    if (!onAddAll) return;
    const toAdd = sessions
      .filter(s => s.type !== 'rest' && !isDatePlanned(s.date, plannedEvents))
      .map(sessionToEvent);
    onAddAll(toAdd);
  }

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: topSignal ? 10 : 16,
        }}
      >
        {/* Title */}
        <span
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--text-0)',
            marginRight: 4,
          }}
        >
          Semaine suggérée
          <HelpPopup title="Semaine suggérée"
            content={[
              { heading: 'Comment ça fonctionne', text: 'Le plan est généré à partir de votre CTL, ATL, TSB actuels, de la prochaine course, et des signaux détectés dans vos entraînements récents.' },
              { heading: 'Phases d\'entraînement', text: 'BASE : construction aérobie. BUILD : développement avec séances intenses. PEAK : maintien avant course. TAPER : affûtage. RECOVERY : récupération après surcharge.' },
              { heading: 'Signaux', text: 'Les chips colorées indiquent les déséquilibres détectés : base aérobie faible, manque de seuil, travail anaérobie insuffisant, ou monotonie d\'entraînement.' },
            ]}
            tips={['Ajustez les jours disponibles et les heures hebdomadaires dans votre profil', 'Cliquez sur "+" pour ajouter une séance au calendrier', 'Le TSS estimé s\'adapte à votre volume cible']}
          />
        </span>

        {/* Phase badge */}
        <PhaseBadge phase={phase} />

        {/* Signal chips */}
        {displaySignals.map(sig => (
          <SignalChip key={sig.code} signal={sig} />
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Week TSS estimate */}
        <span
          style={{
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-2)',
          }}
        >
          ~{weekTSS} TSS
        </span>

        {/* Add all button */}
        <button
          className="btn btn-primary"
          onClick={handleAddAll}
          style={{ fontSize: 12, padding: '5px 12px' }}
        >
          Ajouter tout
        </button>
      </div>

      {/* ── Phase reason subtitle ── */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-2)',
          marginBottom: topSignal ? 8 : 14,
          lineHeight: 1.5,
        }}
      >
        {phaseReason}
      </div>

      {/* ── Top signal bar ── */}
      {topSignal && (
        <div
          style={{
            fontSize: 12,
            padding: '7px 12px',
            borderRadius: 6,
            marginBottom: 14,
            background: SEVERITY_COLOR[topSignal.severity] + '18',
            border: `1px solid ${SEVERITY_COLOR[topSignal.severity]}40`,
            color: SEVERITY_COLOR[topSignal.severity],
            lineHeight: 1.4,
          }}
        >
          {topSignal.message}
        </div>
      )}

      {/* ── Next race info ── */}
      {nextRace && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--accent-yellow)',
            fontFamily: 'var(--font-mono)',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>⚑</span>
          <span>
            {nextRace.name} — {nextRace.daysAway === 0 ? "aujourd'hui" : `dans ${nextRace.daysAway} jour${nextRace.daysAway > 1 ? 's' : ''}`}
          </span>
        </div>
      )}

      {/* ── Day cards ── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 8,
        }}
      >
        {sessions.map(session => (
          <DayCard
            key={session.dayIndex}
            session={session}
            isPlanned={isDatePlanned(session.date, plannedEvents)}
            onAdd={handleAddSession}
          />
        ))}
      </div>
    </div>
  );
}
