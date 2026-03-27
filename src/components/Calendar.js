import React, { useMemo, useState } from 'react';
import {
    addMonths,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isToday,
    parseISO,
    startOfDay,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import WorkoutBuilder from './WorkoutBuilder';

function normalizeEvent(raw, idx) {
    const dateCandidate =
        raw.start_date_local ||
        raw.start_date ||
        raw.date ||
        raw.event_date ||
        raw.start ||
        null;

    if (!dateCandidate) return null;

    let dateObj;
    if (typeof dateCandidate === 'string') {
        dateObj = dateCandidate.includes('T')
            ? parseISO(dateCandidate)
            : parseISO(`${dateCandidate}T00:00:00`);
    } else {
        dateObj = new Date(dateCandidate);
    }

    if (Number.isNaN(dateObj.getTime())) return null;

    const title =
        raw.name ||
        raw.title ||
        raw.description ||
        raw.workout_name ||
        raw.event_name ||
        'Planned session';

    const type = String(raw.type || raw.event_type || raw.category || raw.sport || '').toLowerCase();
    const haystack = `${title} ${type}`.toLowerCase();

    let kind = String(raw.kind || '').toLowerCase();
    if (!kind) {
        kind = 'training';
        if (/(race|competition|triathlon|marathon|gran fondo|event)/i.test(haystack)) {
            kind = 'race';
        } else if (/(goal|objective|target|priority|a-race|b-race|c-race)/i.test(haystack)) {
            kind = 'objective';
        }
    }

    return {
        id: raw.id || raw.event_id || `event_${idx}_${dateObj.toISOString()}`,
        date: dateObj,
        dateKey: format(dateObj, 'yyyy-MM-dd'),
        title,
        type,
        kind,
        notes: raw.notes || raw.description || null,
    };
}

function kindLabel(kind) {
    if (kind === 'race') return 'Race';
    if (kind === 'objective') return 'Objective';
    return 'Training';
}

const LIBRARY_WORKOUTS = [
    {
        title: 'Z2 Endurance Ride',
        type: 'Ride',
        kind: 'training',
        notes: '90-150 min in Z2. Keep HR controlled and cadence steady.',
    },
    {
        title: 'VO2 Max 5x5',
        type: 'Ride',
        kind: 'training',
        notes: '5 x 5 min at VO2 with 5 min easy recovery. Include warm-up/cool-down.',
    },
    {
        title: 'Threshold 2x20',
        type: 'Ride',
        kind: 'training',
        notes: '2 x 20 min around FTP with 10 min easy between blocks.',
    },
    {
        title: 'Long Run Aerobic',
        type: 'Run',
        kind: 'training',
        notes: '75-105 min aerobic run. Stable pace and low drift.',
    },
    {
        title: 'A-Race Objective',
        type: 'Race',
        kind: 'race',
        notes: 'Primary event objective. Keep taper week protected.',
    },
];

export default function Calendar({
    events,
    plannedEvents,
    athlete,
    loading,
    onAddPlannedEvent,
    onRemovePlannedEvent,
    onGenerateAiWorkouts,
}) {
    const [cursor, setCursor] = useState(startOfMonth(new Date()));
    const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [manualTitle, setManualTitle] = useState('');
    const [manualType, setManualType] = useState('Workout');
    const [manualKind, setManualKind] = useState('training');
    const [manualNotes, setManualNotes] = useState('');
    const [aiObjective, setAiObjective] = useState('Build aerobic fitness and prepare for next race block');
    const [aiDays, setAiDays] = useState(7);
    const [isGenerating, setIsGenerating] = useState(false);
    const [plannerError, setPlannerError] = useState(null);

    const allEvents = useMemo(() => {
        return [...(events || []), ...(plannedEvents || [])];
    }, [events, plannedEvents]);

    const futureEvents = useMemo(() => {
        const today = startOfDay(new Date());
        return allEvents
            .map(normalizeEvent)
            .filter(Boolean)
            .filter(e => e.date >= today)
            .sort((a, b) => a.date - b.date);
    }, [allEvents]);

    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);

    const byDay = useMemo(() => {
        const map = new Map();
        futureEvents.forEach(event => {
            if (!isSameMonth(event.date, cursor)) return;
            if (!map.has(event.dateKey)) map.set(event.dateKey, []);
            map.get(event.dateKey).push(event);
        });
        return map;
    }, [futureEvents, cursor]);

    const days = useMemo(() => {
        const start = startOfWeek(monthStart, { weekStartsOn: 1 });
        const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
        const result = [];
        let current = start;
        while (current <= end) {
            result.push(current);
            current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
        }
        return result;
    }, [monthStart, monthEnd]);

    const upcoming = futureEvents.slice(0, 20);

    const addEvent = async ({ title, type, kind, notes, date }) => {
        setPlannerError(null);
        await onAddPlannedEvent({
            title,
            name: title,
            type,
            event_type: type,
            kind,
            notes,
            source: 'manual',
            start_date_local: `${date}T07:00:00`,
        });
    };

    const handleManualAdd = async () => {
        if (!manualTitle.trim()) {
            setPlannerError('Please enter a title for your planned training.');
            return;
        }
        await addEvent({
            title: manualTitle.trim(),
            type: manualType,
            kind: manualKind,
            notes: manualNotes.trim(),
            date: manualDate,
        });
        setManualTitle('');
        setManualNotes('');
    };

    const addLibraryWorkout = async (workout, offset) => {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        await addEvent({
            title: workout.title,
            type: workout.type,
            kind: workout.kind,
            notes: workout.notes,
            date: format(date, 'yyyy-MM-dd'),
        });
    };

    const handleGenerateAi = async () => {
        if (!onGenerateAiWorkouts) return;
        setPlannerError(null);
        setIsGenerating(true);
        try {
            await onGenerateAiWorkouts({ objective: aiObjective, days: Math.max(3, Math.min(21, Number(aiDays) || 7)) });
        } catch (err) {
            setPlannerError(err.message || 'AI workout generation failed.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <div className="page-title">Calendar</div>
                    <div className="page-subtitle">Future training, race objectives, and planned events from Intervals.icu</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => setCursor(subMonths(cursor, 1))}>Prev</button>
                    <button className="btn" onClick={() => setCursor(startOfMonth(new Date()))}>Today</button>
                    <button className="btn" onClick={() => setCursor(addMonths(cursor, 1))}>Next</button>
                </div>
            </div>

            <div className="calendar-layout">
                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">{format(cursor, 'MMMM yyyy')}</span>
                        <span className="card-badge">{futureEvents.length} future events</span>
                    </div>

                    <div className="calendar-weekdays">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                            <div key={day} className="calendar-weekday">{day}</div>
                        ))}
                    </div>

                    <div className="calendar-grid">
                        {days.map(day => {
                            const dayKey = format(day, 'yyyy-MM-dd');
                            const entries = byDay.get(dayKey) || [];
                            return (
                                <div
                                    key={dayKey}
                                    className={`calendar-day ${!isSameMonth(day, cursor) ? 'calendar-day-muted' : ''} ${isToday(day) ? 'calendar-day-today' : ''}`}
                                >
                                    <div className="calendar-day-num">{format(day, 'd')}</div>
                                    <div className="calendar-day-events">
                                        {entries.slice(0, 2).map(entry => (
                                            <div key={entry.id} className={`calendar-pill calendar-pill-${entry.kind}`} title={entry.title}>
                                                {entry.title}
                                            </div>
                                        ))}
                                        {entries.length > 2 && <div className="calendar-more">+{entries.length - 2} more</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Upcoming</span>
                        <span className="card-badge">Next {upcoming.length}</span>
                    </div>

                    <WorkoutBuilder onCreate={onAddPlannedEvent} ftp={athlete?.icu_ftp || null} />

                    <div className="calendar-planner-box">
                        <div className="card-title" style={{ marginBottom: 8 }}>Quick Manual Entry</div>
                        <input className="form-input calendar-form-input" type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} />
                        <input className="form-input calendar-form-input" placeholder="Session title" value={manualTitle} onChange={e => setManualTitle(e.target.value)} />
                        <div className="calendar-form-row">
                            <select className="form-input calendar-form-input" value={manualType} onChange={e => setManualType(e.target.value)}>
                                <option value="Workout">Workout</option>
                                <option value="Ride">Ride</option>
                                <option value="Run">Run</option>
                                <option value="Race">Race</option>
                            </select>
                            <select className="form-input calendar-form-input" value={manualKind} onChange={e => setManualKind(e.target.value)}>
                                <option value="training">Training</option>
                                <option value="objective">Objective</option>
                                <option value="race">Race</option>
                            </select>
                        </div>
                        <input className="form-input calendar-form-input" placeholder="Notes / targets" value={manualNotes} onChange={e => setManualNotes(e.target.value)} />
                        <button className="btn btn-primary" onClick={handleManualAdd}>Add To Calendar</button>
                    </div>

                    <div className="calendar-planner-box">
                        <div className="card-title" style={{ marginBottom: 8 }}>Training Library</div>
                        <div className="calendar-library-list">
                            {LIBRARY_WORKOUTS.map((workout, idx) => (
                                <button key={workout.title} className="btn" onClick={() => addLibraryWorkout(workout, idx + 1)}>
                                    + {workout.title}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="calendar-planner-box">
                        <div className="card-title" style={{ marginBottom: 8 }}>Generate From AI</div>
                        <input className="form-input calendar-form-input" placeholder="Objective (race prep, FTP build, etc.)" value={aiObjective} onChange={e => setAiObjective(e.target.value)} />
                        <div className="calendar-form-row">
                            <input className="form-input calendar-form-input" type="number" min="3" max="21" value={aiDays} onChange={e => setAiDays(e.target.value)} />
                            <button className="btn btn-primary" disabled={isGenerating} onClick={handleGenerateAi}>
                                {isGenerating ? 'Generating...' : 'Generate Plan'}
                            </button>
                        </div>
                        <div className="calendar-helper">AI creates a JSON micro-cycle and inserts sessions directly into your calendar.</div>
                    </div>

                    {plannerError && (
                        <div className="error-banner" style={{ marginBottom: 12 }}>
                            <span className="error-tag">[ERR]</span>
                            {plannerError}
                        </div>
                    )}

                    {loading && upcoming.length === 0 ? (
                        <div className="loading-state" style={{ padding: '24px 8px' }}>
                            <div className="loading-spinner" />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading planned events...</span>
                        </div>
                    ) : upcoming.length === 0 ? (
                        <div className="info-banner" style={{ marginBottom: 0 }}>
                            No future events found. Add planned workouts or race objectives in Intervals.icu events.
                        </div>
                    ) : (
                        <div className="calendar-upcoming-list">
                            {upcoming.map(event => (
                                <div key={event.id} className="calendar-upcoming-item">
                                    <div>
                                        <div className="calendar-upcoming-date">{format(event.date, 'EEE dd MMM yyyy')}</div>
                                        <div className="calendar-upcoming-title">{event.title}</div>
                                    </div>
                                    <div className="calendar-upcoming-actions">
                                        <span className={`calendar-kind-badge calendar-kind-${event.kind}`}>{kindLabel(event.kind)}</span>
                                        {String(event.id).startsWith('local_') && (
                                            <button className="calendar-remove-btn" onClick={() => onRemovePlannedEvent(event.id)}>
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
