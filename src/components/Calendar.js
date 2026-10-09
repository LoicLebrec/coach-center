import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
    addDays,
    addWeeks,
    addYears,
    addMonths,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isToday,
    parseISO,
    startOfDay,
    startOfYear,
    subWeeks,
    subYears,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import WorkoutBuilder from './WorkoutBuilder';
import SmartWorkoutWizard from './SmartWorkoutWizard';
import { exportWorkoutFit, exportWorkoutFitFromBlocks, hasWorkoutContent, exportPlanAsZip } from '../services/workout-exporter';
import { intervalsService, buildIcuEventPayload } from '../services/intervals';
import { buildRuleBasedWorkout, inferTrainingType } from '../services/workout-rules';
import { LIBRARY_WORKOUTS as DEFAULT_LIBRARY_WORKOUTS } from '../data/workoutLibrary';
import { fr as dateFnsFr } from 'date-fns/locale';
import { loadProfile, isProfileComplete, buildWeekPlan, SESSION_DEFINITIONS } from '../services/athlete-profile';
import AthleteProfileSetup from './AthleteProfileSetup';
import Picto from './Pictos';
import { loadAvailability, setAvailability, availabilityValue, availabilityLabel, AVAILABILITY_OPTIONS } from '../services/availability';

// ── Modern glassmorphic design system ───────────────────────────────
const GLASS = {
    background: 'rgba(10, 10, 10, 0.90)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.07)',
    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
};

const ZONE_STYLE = {
    Z1: 'z1',
    Z2: 'z2',
    Z3: 'z3',
    Z4: 'z4',
    Z5: 'z5',
    Z6: 'z6',
    Z7: 'z7',
};

function buildBlocksNotes(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return '';
    const lines = ['Workout Steps:'];
    blocks.forEach((b, idx) => {
        lines.push(`${idx + 1}. ${b.label} — ${b.durationMin} min @ ${b.zone}`);
    });
    return lines.join('\n');
}

function totalDuration(blocks = []) {
    return blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0);
}

function WorkoutBlocksGraph({ blocks }) {
    if (!blocks?.length) return null;
    const total = Math.max(1, totalDuration(blocks));

    return (
        <div className="workout-mini-graph" title="Workout block intensity profile">
            {blocks.map((b, i) => {
                const pct = ((Number(b.durationMin) || 0) / total) * 100;
                const zoneClass = ZONE_STYLE[String(b.zone || '').toUpperCase()] || 'z2';
                return (
                    <div
                        key={`${b.label}_${i}`}
                        className={`workout-mini-seg ${zoneClass}`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                    />
                );
            })}
        </div>
    );
}

const ZONE_COLORS_DETAIL = {
    Z1: '#475569', Z2: '#22c55e', Z3: '#eab308',
    Z4: '#f97316', Z5: '#ef4444', Z6: '#ef4444', Z7: '#f97316',
};

const sportIcon = (type = '') => {
    const t = type.toLowerCase();
    if (t.includes('ride') || t.includes('cycl') || t.includes('velo') || t.includes('bike')) return 'bike';
    if (t.includes('run') || t.includes('cour')) return 'run';
    if (t.includes('swim') || t.includes('nata')) return 'swim';
    if (t.includes('walk') || t.includes('marche')) return 'hike';
    if (t.includes('hike') || t.includes('rando')) return 'hike';
    if (t.includes('ski')) return 'ski';
    if (t.includes('yoga')) return 'yoga';
    if (t.includes('strength') || t.includes('muscu')) return 'strength';
    return 'bolt';
};
const ZONE_LABELS_DETAIL = {
    Z1: 'Recovery', Z2: 'Endurance', Z3: 'Tempo',
    Z4: 'Threshold', Z5: 'VO2 Max', Z6: 'Anaerobic', Z7: 'Sprint',
};
const ZONE_PCT_DETAIL = {
    Z1: [45, 55], Z2: [56, 75], Z3: [76, 90],
    Z4: [91, 105], Z5: [106, 120], Z6: [121, 150], Z7: [151, 200],
};

function zoneFromIF(intensity) {
    if (!intensity || intensity <= 0) return null;
    if (intensity < 0.55) return 'Z1';
    if (intensity < 0.75) return 'Z2';
    if (intensity < 0.90) return 'Z3';
    if (intensity < 1.05) return 'Z4';
    if (intensity < 1.20) return 'Z5';
    if (intensity < 1.50) return 'Z6';
    return 'Z7';
}

function WorkoutDetailVisual({ blocks, ftp }) {
    if (!blocks?.length) return null;
    const total = Math.max(1, blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0));

    return (
        <div>
            {/* Power profile bar */}
            <div style={{ display: 'flex', height: 52, borderRadius: 8, overflow: 'hidden', marginBottom: 12, gap: 2 }}>
                {blocks.map((b, i) => {
                    const pct = ((Number(b.durationMin) || 0) / total) * 100;
                    const zId = String(b.zone || 'Z2').toUpperCase();
                    const color = ZONE_COLORS_DETAIL[zId] || ZONE_COLORS_DETAIL.Z2;
                    const zonePct = ZONE_PCT_DETAIL[zId] || ZONE_PCT_DETAIL.Z2;
                    const barHeight = Math.max(20, Math.round(((zonePct[0] + zonePct[1]) / 2) / 2));
                    return (
                        <div key={i} style={{ width: `${Math.max(2, pct)}%`, display: 'flex', alignItems: 'flex-end' }}
                            title={`${b.label} — ${b.durationMin}min @ ${zId}`}>
                            <div style={{ width: '100%', height: `${barHeight}%`, background: color, opacity: 0.85, borderRadius: '3px 3px 0 0' }} />
                        </div>
                    );
                })}
            </div>
            {/* Block list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {blocks.map((b, i) => {
                    const zId = String(b.zone || 'Z2').toUpperCase();
                    const color = ZONE_COLORS_DETAIL[zId] || ZONE_COLORS_DETAIL.Z2;
                    const pct = ZONE_PCT_DETAIL[zId] || ZONE_PCT_DETAIL.Z2;
                    const loW = ftp ? Math.round((pct[0] / 100) * ftp) : null;
                    const hiW = ftp ? Math.round((pct[1] / 100) * ftp) : null;
                    return (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', background: 'var(--bg-2)',
                            borderRadius: 6, borderLeft: `3px solid ${color}`,
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize:13, fontWeight: 600, color: 'var(--text-0)' }}>{b.label}</div>
                                <div style={{ fontSize:13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                                    {zId} · {ZONE_LABELS_DETAIL[zId]} · {pct[0]}–{pct[1]}% FTP
                                    {loW ? ` · ${loW}–${hiW}W` : ''}
                                </div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, fontWeight: 600, color }}>
                                {b.durationMin}min
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)' }}>
                Total: {total} min
            </div>
        </div>
    );
}

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
        workoutBlocks: raw.workoutBlocks || raw.blocks || [],
    };
}

function kindLabel(kind) {
    if (kind === 'race') return 'Race';
    if (kind === 'objective') return 'Objective';
    return 'Training';
}

function trainingTone(event) {
    if (!event) return 'general';
    if (event.kind === 'race') return 'race';
    if (event.kind === 'objective') return 'objective';

    const text = `${event.title || ''} ${event.notes || ''} ${event.type || ''}`.toLowerCase();
    if (/\brest\b|recovery|easy spin|off day|no riding/.test(text)) return 'recovery';
    if (/vo2|max|threshold|over-?under|sprint|anaerobic|ftp test|all out/.test(text)) return 'intensive';
    if (/z2|endurance|long ride|aerobic|tempo|sweet.?spot/.test(text)) return 'endurance';
    return 'general';
}

function toneLabel(tone) {
    if (tone === 'recovery') return 'Récup';
    if (tone === 'intensive') return 'Intensité';
    if (tone === 'endurance') return 'Endurance';
    if (tone === 'race') return 'Course';
    if (tone === 'objective') return 'Objectif';
    return 'Séance';
}

function sanitizeLabel(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

function splitCsvLine(line) {
    const out = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(cell.trim());
            cell = '';
            continue;
        }
        cell += ch;
    }
    out.push(cell.trim());
    return out;
}

function parseBlocksColumn(value) {
    if (!value) return [];
    // Format: Warmup|12|Z2;Main set|30|Z3;Cooldown|10|Z1
    return String(value)
        .split(';')
        .map(chunk => chunk.trim())
        .filter(Boolean)
        .map((chunk, idx) => {
            const [label, duration, zone] = chunk.split('|').map(s => (s || '').trim());
            return {
                id: `csv_b_${Date.now()}_${idx}`,
                label: label || `Block ${idx + 1}`,
                durationMin: Number(duration) > 0 ? Number(duration) : 10,
                zone: /^Z[1-7]$/i.test(zone) ? zone.toUpperCase() : 'Z2',
            };
        });
}

function parseDurationMinutes(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const numericOnly = raw.replace(',', '.');
    if (/^\d+(?:\.\d+)?$/.test(numericOnly)) {
        return Math.max(0, Math.round(Number(numericOnly)));
    }

    const range = raw.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
    if (range) {
        const a = Number(range[1]);
        const b = Number(range[2]);
        return Math.max(0, Math.round((a + b) / 2));
    }

    const mins = raw.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
    if (mins) return Math.max(0, Math.round(Number(mins[1])));

    const hours = raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
    if (hours) return Math.max(0, Math.round(Number(hours[1]) * 60));

    return 0;
}

function normalizeCsvHeader(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function eventHasWorkoutData(event) {
    const combinedText = `${event?.title || ''}\n${event?.notes || ''}`;
    return (event?.workoutBlocks?.length > 0) || hasWorkoutContent(combinedText);
}

function looksLikeSessionWorkout(title = '', notes = '') {
    const haystack = `${title} ${notes}`.toLowerCase();
    if (/\brest\b|full recovery|no riding|off day/i.test(haystack)) return false;
    return /(vo2|interval|threshold|tempo|sweet.?spot|endurance|race|ride|run|ftp test|openers|sprint|workout|session|z\d)/i.test(haystack);
}

export default function Calendar({
    events,
    plannedEvents,
    activities = [],
    wellness = [],
    athlete,
    loading,
    onAddPlannedEvent,
    onRemovePlannedEvent,
    onGenerateAiWorkouts,
    onSaveWorkoutToLibrary,
    onGenerateAiWorkoutTemplate,
    onSendToWahoo,
    onExportToZwift,
    workoutLibrary,
    onOpenRouteBuilder,
    onOpenWorkoutBuilder,
}) {
    const csvInputRef = useRef(null);
    const [cursor, setCursor] = useState(new Date());
    const [viewMode, setViewMode] = useState('week');
    const [collapsed, setCollapsed] = useState({
        builder: false,
        manual: true,
        library: true,
        csv: true,
        garmin: true,
        upcoming: true,
    });
    const [jumpDate, setJumpDate] = useState('');
    const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [manualTitle, setManualTitle] = useState('');
    const [manualType, setManualType] = useState('Workout');
    const [manualKind, setManualKind] = useState('training');
    const [manualNotes, setManualNotes] = useState('');
    const [aiObjective, setAiObjective] = useState('Build aerobic fitness and prepare for next race block');
    const [aiDays, setAiDays] = useState(7);
    const [isImportingCsv, setIsImportingCsv] = useState(false);
    const [csvImportSummary, setCsvImportSummary] = useState(null);
    const [importedSessions, setImportedSessions] = useState([]);
    const [isExportingZip, setIsExportingZip] = useState(false);
    const [isSyncingIcu, setIsSyncingIcu] = useState(false);
    const [garminMsg, setGarminMsg] = useState(null); // { type: 'ok'|'err', text }
    const [plannerError, setPlannerError] = useState(null);
    const [dragOverDay, setDragOverDay] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [routePromptEvent, setRoutePromptEvent] = useState(null);
    const [selectedActivityDay, setSelectedActivityDay] = useState(null);
    // Days off / limited time; the plan in Today moves or shortens sessions accordingly.
    const [availability, setAvail] = useState({});
    useEffect(() => {
        loadAvailability().then(setAvail);
        const onChange = (e) => setAvail(e.detail || {});
        window.addEventListener('availability-changed', onChange);
        return () => window.removeEventListener('availability-changed', onChange);
    }, []);
    const [dayQuickTitle, setDayQuickTitle] = useState('');
    const [dayQuickType, setDayQuickType] = useState('Workout');
    const [dayQuickKind, setDayQuickKind] = useState('training');
    const [dayQuickNotes, setDayQuickNotes] = useState('');
    const [dayModalTab, setDayModalTab] = useState('quick'); // 'quick' | 'builder'

    // ── Training preferences & suggestions ─────────────────────
    const DEFAULT_PREFS = {
        trainingDays: [1, 2, 4, 6], // Mon Tue Thu Sat (0=Sun)
        intensity: { 1: 'endurance', 2: 'intervals', 4: 'endurance', 6: 'long' },
        hoursAvailable: { 1: 1.5, 2: 1.0, 4: 1.5, 6: 3.0 }, // hours per day
        dismissedSuggestions: {}, // dateKey → true
    };
    const [trainingPrefs, setTrainingPrefs] = useState(() => {
        try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('apex-training-prefs') || '{}') }; }
        catch { return DEFAULT_PREFS; }
    });
    const [showPrefsPanel, setShowPrefsPanel] = useState(false);

    const saveTrainingPrefs = (patch) => {
        const next = { ...trainingPrefs, ...patch };
        setTrainingPrefs(next);
        localStorage.setItem('apex-training-prefs', JSON.stringify(next));
    };

    const dismissSuggestion = (dateKey) => {
        const dismissed = { ...trainingPrefs.dismissedSuggestions, [dateKey]: true };
        saveTrainingPrefs({ dismissedSuggestions: dismissed });
    };

    // Compute TSB for a given date from wellness array
    const getTSB = (dateKey) => {
        if (!wellness || wellness.length === 0) return 0;
        const entry = wellness.find(w => (w.id || w.date || '').slice(0, 10) === dateKey);
        if (!entry) return 0;
        const ctl = entry.icu_ctl || entry.ctl || 0;
        const atl = entry.icu_atl || entry.atl || 0;
        return Math.round(ctl - atl);
    };

    // Pick a library workout matching the intensity type
    const getSuggestedWorkout = (intensityType) => {
        const typeMap = {
            endurance: ['Endurance', 'Base', 'Z2', 'Aerobic'],
            intervals:  ['Interval', 'VO2', 'Threshold', 'FTP', 'Sweetspot'],
            long:       ['Long', 'Endurance', 'Base'],
            recovery:   ['Recovery', 'Easy', 'Active'],
        };
        const keywords = typeMap[intensityType] || typeMap.endurance;
        const match = libraryWorkouts.find(w =>
            keywords.some(k => (w.title + (w.objective || '')).toLowerCase().includes(k.toLowerCase()))
        );
        return match || libraryWorkouts[0];
    };

    // ── Smart weekly suggestion ────────────────────────────────
    const [weekSuggesting, setWeekSuggesting]   = useState(false);
    const [weekProposal, setWeekProposal]         = useState(null);
    const [showProfileSetup, setShowProfileSetup] = useState(false);
    const [athleteProfile, setAthleteProfile]     = useState(() => loadProfile());

    const suggestWeek = () => {
        // Show profile setup if not complete
        if (!isProfileComplete(athleteProfile)) {
            setShowProfileSetup(true);
            return;
        }
        setWeekSuggesting(true);
        try {
            const todayKey = format(new Date(), 'yyyy-MM-dd');
            // Build week Mon-Sun but mark past days null so buildWeekPlan skips them
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
            const weekDates = Array.from({ length: 7 }, (_, i) => {
                const dk = format(addDays(weekStart, i), 'yyyy-MM-dd');
                return dk >= todayKey ? dk : null;
            });

            // Wellness — get latest entry
            const latestW = (wellness || [])
                .filter(w => (w.id || w.date || '').slice(0, 10) <= todayKey)
                .sort((a, b) => (b.id || b.date || '').localeCompare(a.id || a.date || ''))[0] || {};
            const ctl = Math.round(latestW.icu_ctl || latestW.ctl || 0);
            const atl = Math.round(latestW.icu_atl || latestW.atl || 0);
            const tsb = ctl - atl;

            const fourWeeksAgo = format(addDays(new Date(), -28), 'yyyy-MM-dd');
            const avgWeeklyTss = Math.round(
                (activities || []).filter(a => (a.start_date_local || a.date || '').slice(0, 10) >= fourWeeksAgo)
                    .reduce((s, a) => s + (a.icu_training_load || 0), 0) / 4
            );

            // Use profile data (already loaded — no re-ask)
            const result = buildWeekPlan({
                profile: athleteProfile,
                ctl, atl, tsb, avgWeeklyTss,
                activities, plannedEvents, wellness, weekDates,
                hoursAvailable: trainingPrefs.hoursAvailable,
            });

            // Map each session to a library workout
            const sessions = (result.sessions || []).map(s => {
                const def = SESSION_DEFINITIONS[s.sessionType] || {};
                const libraryType =
                    s.sessionType === 'intervals_short' ? 'intervals' :
                    s.sessionType === 'activation'      ? 'endurance' :
                    s.sessionType === 'endurance_easy'  ? 'recovery'  :
                    s.sessionType === 'race'            ? null : s.sessionType;
                const workout = libraryType ? getSuggestedWorkout(libraryType) || libraryWorkouts[0] : null;
                return {
                    ...s,
                    dateLabel: format(new Date(s.dateKey + 'T12:00:00'), 'EEEE d MMM', { locale: dateFnsFr }),
                    workout,
                    sessionLabel: def.label || s.sessionType,
                    sessionColor: def.color || '#f97316',
                    sessionDuration: def.duration || '',
                    accepted: true,
                };
            });

            setWeekProposal({ ...result, sessions, ctl, atl, tsb, avgWeeklyTss });
        } catch (err) {
            setPlannerError('Erreur : ' + err.message);
        } finally {
            setWeekSuggesting(false);
        }
    };

    const confirmWeekProposal = async () => {
        if (!weekProposal) return;
        const toAdd = weekProposal.sessions.filter(s => s.accepted);
        for (const s of toAdd) await addLibraryWorkout(s.workout, s.dateKey);
        setWeekProposal(null);
    };

    // Daily suggestion for a given date
    const getDailySuggestion = (dateKey, dayOfWeek) => {
        if (trainingPrefs.dismissedSuggestions?.[dateKey]) return null;
        if (!trainingPrefs.trainingDays.includes(dayOfWeek)) return null;
        // Don't suggest if already has a planned workout
        const existing = byDayAll.get(dateKey) || [];
        if (existing.some(e => e.planned)) return null;
        const tsb = getTSB(dateKey);
        let intensityType = trainingPrefs.intensity?.[dayOfWeek] || 'endurance';
        // Override intensity based on fatigue
        if (tsb < -20) intensityType = 'recovery';
        else if (tsb < -10 && intensityType === 'intervals') intensityType = 'endurance';
        const workout = getSuggestedWorkout(intensityType);
        return workout ? { workout, intensityType, tsb } : null;
    };

    // ── Persist preferences to localStorage ───────────────────
    useEffect(() => {
        const saved = localStorage.getItem('apex-calendar-prefs');
        if (!saved) return;
        try {
            const p = JSON.parse(saved);
            if (p.aiObjective) setAiObjective(p.aiObjective);
            if (p.aiDays) setAiDays(p.aiDays);
        } catch (_) { }
    }, []);

    useEffect(() => {
        localStorage.setItem('apex-calendar-prefs', JSON.stringify({
            aiObjective, aiDays,
        }));
    }, [aiObjective, aiDays]);

    const allEvents = useMemo(() => {
        return [...(events || []), ...(plannedEvents || [])];
    }, [events, plannedEvents]);

    const libraryWorkouts = useMemo(() => {
        if (Array.isArray(workoutLibrary) && workoutLibrary.length > 0) return workoutLibrary;
        return DEFAULT_LIBRARY_WORKOUTS;
    }, [workoutLibrary]);

    const normalizedAllEvents = useMemo(() => {
        return allEvents
            .map(normalizeEvent)
            .filter(Boolean)
            .sort((a, b) => a.date - b.date);
    }, [allEvents]);

    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
    const yearStart = startOfYear(cursor);

    const byDay = useMemo(() => {
        const map = new Map();
        normalizedAllEvents.forEach(event => {
            if (!isSameMonth(event.date, cursor)) return;
            if (!map.has(event.dateKey)) map.set(event.dateKey, []);
            map.get(event.dateKey).push(event);
        });
        return map;
    }, [normalizedAllEvents, cursor]);

    const byDayAll = useMemo(() => {
        const map = new Map();
        normalizedAllEvents.forEach(event => {
            if (!map.has(event.dateKey)) map.set(event.dateKey, []);
            map.get(event.dateKey).push(event);
        });
        return map;
    }, [normalizedAllEvents]);

    // ── Past activities heatmap (strava/intervals activities) ────────────────────
    const pastActivityColor = useMemo(() => {
        const colorMap = new Map();
        if (!activities || activities.length === 0) return colorMap;

        let maxTss = 0;
        const tssMap = new Map();

        // Use actual activities data directly
        activities.forEach(activity => {
            const dateStr = activity.start_date_local || activity.start_date || activity.date;
            if (!dateStr) return;

            let dateObj;
            if (typeof dateStr === 'string') {
                dateObj = dateStr.includes('T') ? parseISO(dateStr) : parseISO(`${dateStr}T00:00:00`);
            } else {
                dateObj = new Date(dateStr);
            }

            if (Number.isNaN(dateObj.getTime())) return;

            const key = format(dateObj, 'yyyy-MM-dd');
            const tss = activity.icu_training_load || activity.training_load || activity.tss || activity.load || 0;
            if (tss > 0) {
                const current = tssMap.get(key) || 0;
                tssMap.set(key, current + tss);
                maxTss = Math.max(maxTss, current + tss);
            }
        });

        if (maxTss === 0) return colorMap; // No activities with TSS

        // Convert TSS to colors
        const getColor = (tss) => {
            if (!tss || tss === 0) return null; // No color for no activity
            const ratio = Math.min(tss / (maxTss * 0.7), 1);

            if (ratio < 0.2) return 'rgba(198, 228, 139, 0.15)'; // Very light green
            if (ratio < 0.4) return 'rgba(123, 201, 111, 0.2)'; // Light green
            if (ratio < 0.6) return 'rgba(35, 154, 59, 0.25)'; // Medium green
            if (ratio < 0.8) return 'rgba(25, 97, 39, 0.3)'; // Dark green
            return 'rgba(13, 56, 23, 0.35)'; // Very dark green
        };

        tssMap.forEach((tss, dateKey) => {
            colorMap.set(dateKey, { tss, color: getColor(tss) });
        });

        return colorMap;
    }, [activities]);

    // ── Activities mapped by day (for calendar pills) ───────────────
    const activitiesByDay = useMemo(() => {
        const map = new Map();
        if (!activities || activities.length === 0) return map;
        activities.forEach(activity => {
            const dateStr = activity.start_date_local || activity.start_date || activity.date;
            if (!dateStr) return;
            let dateObj;
            if (typeof dateStr === 'string') {
                dateObj = dateStr.includes('T') ? parseISO(dateStr) : parseISO(`${dateStr}T00:00:00`);
            } else {
                dateObj = new Date(dateStr);
            }
            if (Number.isNaN(dateObj.getTime())) return;
            const key = format(dateObj, 'yyyy-MM-dd');
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(activity);
        });
        return map;
    }, [activities]);

    // ── Get activities for selected day ─────────────────────────────
    const currentDayActivities = useMemo(() => {
        if (!selectedActivityDay || !activities) return [];
        return activities.filter(a => {
            const dateStr = a.start_date_local || a.start_date || a.date;
            if (!dateStr) return false;
            let dateObj;
            if (typeof dateStr === 'string') {
                dateObj = dateStr.includes('T') ? parseISO(dateStr) : parseISO(`${dateStr}T00:00:00`);
            } else {
                dateObj = new Date(dateStr);
            }
            return format(dateObj, 'yyyy-MM-dd') === selectedActivityDay;
        });
    }, [selectedActivityDay, activities]);

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

    const weekDays = useMemo(() => {
        const result = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            result.push(d);
        }
        return result;
    }, [weekStart]);

    const yearMonths = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 12; i++) {
            const monthDate = new Date(yearStart.getFullYear(), i, 1);
            const monthEvents = normalizedAllEvents.filter(e => isSameMonth(e.date, monthDate));
            arr.push({
                monthDate,
                total: monthEvents.length,
                races: monthEvents.filter(e => e.kind === 'race').length,
                objectives: monthEvents.filter(e => e.kind === 'objective').length,
                trainings: monthEvents.filter(e => e.kind === 'training').length,
            });
        }
        return arr;
    }, [normalizedAllEvents, yearStart]);

    const timelineEvents = useMemo(() => {
        return [...normalizedAllEvents]
            .sort((a, b) => b.date - a.date)
            .slice(0, 60);
    }, [normalizedAllEvents]);

    // Weekly kilometers and average watts
    const weeklyMetrics = useMemo(() => {
        if (!activities?.length) return [];
        const result = [];
        const now = new Date();
        for (let i = 7; i >= 0; i--) {
            const end = new Date(now);
            end.setDate(now.getDate() - i * 7);
            end.setHours(23, 59, 59, 999);
            const start = new Date(end);
            start.setDate(end.getDate() - 6);
            start.setHours(0, 0, 0, 0);
            const label = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

            const weekActivities = activities.filter(a => {
                if (!a.start_date_local) return false;
                const d = new Date(a.start_date_local);
                return d >= start && d <= end;
            });

            const distance = weekActivities.reduce((s, a) => {
                const raw = Number(a.distance || 0);
                if (!Number.isFinite(raw) || raw <= 0) return s;
                return s + (raw > 1000 ? raw / 1000 : raw);
            }, 0);
            const wattsSamples = weekActivities
                .map(a => Number(a.icu_average_watts || a.average_watts || 0))
                .filter(w => Number.isFinite(w) && w > 0);
            const avgWatts = wattsSamples.length > 0
                ? Math.round(wattsSamples.reduce((s, w) => s + w, 0) / wattsSamples.length)
                : 0;

            result.push({ label, distance: Number(distance.toFixed(1)), avgWatts, current: i === 0 });
        }
        return result;
    }, [activities]);

    const periodLabel = useMemo(() => {
        if (viewMode === 'week') {
            const wkEnd = endOfWeek(cursor, { weekStartsOn: 1 });
            return `${format(weekStart, 'dd MMM', { locale: dateFnsFr })} - ${format(wkEnd, 'dd MMM yyyy', { locale: dateFnsFr })}`;
        }
        if (viewMode === 'year') return format(cursor, 'yyyy');
        return format(cursor, 'MMMM yyyy', { locale: dateFnsFr });
    }, [viewMode, cursor, weekStart]);

    const movePrev = () => {
        if (viewMode === 'week') setCursor(subWeeks(cursor, 1));
        else if (viewMode === 'year') setCursor(subYears(cursor, 1));
        else setCursor(subMonths(cursor, 1));
    };

    const moveNext = () => {
        if (viewMode === 'week') setCursor(addWeeks(cursor, 1));
        else if (viewMode === 'year') setCursor(addYears(cursor, 1));
        else setCursor(addMonths(cursor, 1));
    };

    const moveToday = () => {
        setCursor(new Date());
    };

    const toggleSection = (key) => {
        setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
    };
    // One tool panel open at a time.
    const openTool = (key) => {
        setCollapsed(prev => ({ ...prev, manual: true, library: true, csv: true, garmin: true, upcoming: true, [key]: !prev[key] }));
    };

    const toIsoDate = (value) => {
        if (!value) return null;
        const raw = String(value).trim();
        if (!raw) return null;
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slash) {
            const day = String(Number(slash[1])).padStart(2, '0');
            const month = String(Number(slash[2])).padStart(2, '0');
            return `${slash[3]}-${month}-${day}`;
        }
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return format(parsed, 'yyyy-MM-dd');
    };

    const inferKind = ({ title = '', type = '', kind = '', notes = '' }) => {
        if (kind) return String(kind).toLowerCase();
        const haystack = `${title} ${type} ${notes}`.toLowerCase();
        if (/(race|competition|triathlon|marathon|event)/i.test(haystack)) return 'race';
        if (/(goal|objective|target|priority|a-race|b-race|c-race)/i.test(haystack)) return 'objective';
        return 'training';
    };

    const inferType = ({ type = '', title = '', notes = '' }) => {
        if (type) return type;
        const haystack = `${title} ${notes}`.toLowerCase();
        if (/(run|jog|interval run|marathon|trail)/i.test(haystack)) return 'Run';
        if (/(swim|pool|open water)/i.test(haystack)) return 'Swim';
        if (/(race|competition|event)/i.test(haystack)) return 'Race';
        if (/(ride|bike|cycling|endurance|vo2|threshold|sweet spot)/i.test(haystack)) return 'Ride';
        return 'Workout';
    };

    const inferZone = ({ title = '', notes = '' }) => {
        const haystack = `${title} ${notes}`.toLowerCase();
        if (/(vo2|max|anaerobic|sprint)/i.test(haystack)) return 'Z5';
        if (/(threshold|ftp test|over-under)/i.test(haystack)) return 'Z4';
        if (/(tempo|sweet.?spot)/i.test(haystack)) return 'Z3';
        if (/(z2|endurance|long ride)/i.test(haystack)) return 'Z2';
        if (/(rest|recovery|easy)/i.test(haystack)) return 'Z1';
        return 'Z2';
    };

    const findColumnIndex = (headers, aliases) => {
        const aliasSet = new Set(aliases.map(normalizeCsvHeader));
        return headers.findIndex(h => aliasSet.has(normalizeCsvHeader(h)));
    };

    const addEvent = async ({ id, title, type, kind, notes, date, workoutBlocks = [] }) => {
        setPlannerError(null);
        await onAddPlannedEvent({
            id,
            title,
            name: title,
            type,
            event_type: type,
            kind,
            notes,
            source: 'manual',
            start_date_local: `${date}T07:00:00`,
            workoutBlocks,
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

    const openDayDetails = (dayKey) => {
        setSelectedActivityDay(dayKey);
        setDayQuickTitle('');
        setDayQuickType('Workout');
        setDayQuickKind('training');
        setDayQuickNotes('');
        setDayModalTab('quick');
    };

    const handleDayQuickAdd = async () => {
        if (!selectedActivityDay) return;
        const title = dayQuickTitle.trim() || (dayQuickType === 'Note' ? 'Note' : 'Workout');
        await addEvent({
            title,
            type: dayQuickType,
            kind: dayQuickKind,
            notes: dayQuickNotes.trim(),
            date: selectedActivityDay,
        });
        setSelectedActivityDay(null);
    };

    const addLibraryWorkout = async (workout, targetDateKey = null) => {
        const date = targetDateKey || format(new Date(), 'yyyy-MM-dd');
        const notes = [
            `Objectif : ${workout.objective}`,
            workout.notes,
            '',
            buildBlocksNotes(workout.blocks),
        ].join('\n');
        await addEvent({
            title: workout.title,
            type: workout.type,
            kind: workout.kind,
            notes,
            date,
            workoutBlocks: workout.blocks,
        });
    };

    const handleDragStart = (workout) => (e) => {
        e.dataTransfer.setData('application/x-coach-workout', JSON.stringify(workout));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDropOnDay = (dayKey) => async (e) => {
        e.preventDefault();
        setDragOverDay(null);
        const raw = e.dataTransfer.getData('application/x-coach-workout');
        if (!raw) return;

        try {
            const workout = JSON.parse(raw);
            const notes = [
                `Objective: ${workout.objective || 'Structured session'}`,
                workout.notes || '',
                '',
                buildBlocksNotes(workout.blocks || []),
            ].join('\n');

            await addEvent({
                title: workout.title,
                type: workout.type || 'Workout',
                kind: workout.kind || 'training',
                notes,
                date: dayKey,
                workoutBlocks: workout.blocks || [],
            });
        } catch (_) {
            setPlannerError('Dropped workout payload is invalid.');
        }
    };

    const buildFitText = (event) => {
        const noteText = String(event?.notes || '').trim();
        if (noteText && hasWorkoutContent(noteText)) return noteText;
        if (event?.workoutBlocks?.length) {
            return ['PRESCRIPTION:', buildBlocksNotes(event.workoutBlocks)].join('\n');
        }
        if (noteText) return noteText;
        return '';
    };

    const downloadEventFit = (event) => {
        const ftp = athlete?.ftp || athlete?.icu_ftp || athlete?.ftp_watts || athlete?.critical_power || 200;
        const sportType = /run/i.test(String(event?.type || '')) ? 'running' : 'cycling';
        const label = `${format(event.date, 'yyyy-MM-dd')}-${sanitizeLabel(event.title || 'session')}`;

        // Prefer block-based export (structured, accurate); fall back to text parsing
        if (event.workoutBlocks?.length > 0) {
            exportWorkoutFitFromBlocks(event.workoutBlocks, ftp, sportType, label);
            return;
        }
        const fitText = buildFitText(event);
        if (!fitText) return;
        exportWorkoutFit(fitText, ftp, sportType, label);
    };

    const handleImportCsv = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setPlannerError(null);
        setCsvImportSummary(null);
        setImportedSessions([]);
        setIsImportingCsv(true);

        try {
            const text = await file.text();
            const rows = text
                .split(/\r?\n/)
                .map(r => r.trim())
                .filter(Boolean);

            if (rows.length < 2) {
                throw new Error('CSV must contain a header and at least one data row.');
            }

            const headers = splitCsvLine(rows[0]).map(h => String(h || '').toLowerCase().trim());
            const dateIdx = findColumnIndex(headers, ['date', 'day', 'start_date', 'start_date_local', 'start', 'session_date', 'workout_date']);
            const titleIdx = findColumnIndex(headers, ['title', 'name', 'session', 'workout', 'event', 'workout_name']);
            const sessionTypeIdx = findColumnIndex(headers, ['session_type', 'session type', 'workout_type']);
            const typeIdx = findColumnIndex(headers, ['type', 'sport', 'event_type']);
            const kindIdx = findColumnIndex(headers, ['kind', 'category']);
            const notesIdx = findColumnIndex(headers, ['notes', 'details', 'comment', 'objective']);
            const descriptionIdx = findColumnIndex(headers, ['description', 'session_description']);
            const nutritionIdx = findColumnIndex(headers, ['nutrition_notes', 'nutrition', 'fueling', 'fuel', 'carb_notes']);
            const blocksIdx = findColumnIndex(headers, ['blocks', 'workout_blocks', 'steps', 'intervals']);
            const durationIdx = findColumnIndex(headers, ['duration', 'duration_min', 'duration (min)', 'minutes']);
            const zoneIdx = findColumnIndex(headers, ['zone', 'intensity_zone']);
            const powerIdx = findColumnIndex(headers, ['target_power', 'target power (w)', 'power', 'power_w']);
            const cadenceIdx = findColumnIndex(headers, ['target_cadence', 'target cadence (rpm)', 'cadence']);
            const hrIdx = findColumnIndex(headers, ['target_hr', 'target hr (bpm)', 'hr', 'heart_rate']);

            const getDateFromRow = (cells) => {
                if (dateIdx >= 0) {
                    const parsed = toIsoDate(cells[dateIdx]);
                    if (parsed) return parsed;
                }
                for (const cell of cells) {
                    const parsed = toIsoDate(cell);
                    if (parsed) return parsed;
                }
                return null;
            };

            let imported = 0;
            let detectedWorkouts = 0;
            const importedIds = [];
            const importedPreview = [];

            for (let i = 1; i < rows.length; i++) {
                const cells = splitCsvLine(rows[i]);
                const isoDate = getDateFromRow(cells);
                if (!isoDate) continue;

                const titleRaw = titleIdx >= 0 ? cells[titleIdx] : '';
                const sessionTypeRaw = sessionTypeIdx >= 0 ? cells[sessionTypeIdx] : '';
                const typeRaw = typeIdx >= 0 ? cells[typeIdx] : '';
                const kindRaw = kindIdx >= 0 ? cells[kindIdx] : '';
                const notesRaw = notesIdx >= 0 ? cells[notesIdx] : '';
                const descriptionRaw = descriptionIdx >= 0 ? cells[descriptionIdx] : '';
                const nutritionRaw = nutritionIdx >= 0 ? cells[nutritionIdx] : '';
                const durationRaw = durationIdx >= 0 ? parseDurationMinutes(cells[durationIdx]) : 0;
                const zoneRaw = zoneIdx >= 0 ? String(cells[zoneIdx] || '').toUpperCase() : '';
                const powerRaw = powerIdx >= 0 ? String(cells[powerIdx] || '').trim() : '';
                const cadenceRaw = cadenceIdx >= 0 ? String(cells[cadenceIdx] || '').trim() : '';
                const hrRaw = hrIdx >= 0 ? String(cells[hrIdx] || '').trim() : '';

                const title = String(sessionTypeRaw || titleRaw || '').trim() || 'Planned Session';
                const mergedDescription = [notesRaw, descriptionRaw].filter(Boolean).join(' | ');
                const type = inferType({ type: typeRaw, title, notes: mergedDescription });
                const kind = inferKind({ title, type, kind: kindRaw, notes: mergedDescription });

                let workoutBlocks = blocksIdx >= 0 ? parseBlocksColumn(cells[blocksIdx]) : [];

                // If no explicit blocks column, build a full structured workout from the session info
                if (!workoutBlocks.length && durationRaw >= 20 && kind !== 'race') {
                    const trainingType = inferTrainingType(title, mergedDescription);
                    if (trainingType !== 'rest') {
                        try {
                            const ftp = athlete?.ftp || athlete?.icu_ftp || 200;
                            const built = buildRuleBasedWorkout(trainingType, durationRaw, 'good', ftp);
                            workoutBlocks = built.blocks || [];
                        } catch (_) { }
                    }
                }

                // Last resort: single block for very short sessions or when blocks still empty
                if (!workoutBlocks.length && durationRaw > 0) {
                    workoutBlocks = [{
                        label: String(descriptionRaw || sessionTypeRaw || 'Main Block').slice(0, 60),
                        durationMin: durationRaw,
                        zone: inferZone({ title, notes: mergedDescription }),
                    }];
                }

                let notes = [
                    String(descriptionRaw || '').trim(),
                    powerRaw ? `Target Power: ${powerRaw}` : '',
                    cadenceRaw ? `Target Cadence: ${cadenceRaw}` : '',
                    hrRaw ? `Target HR: ${hrRaw}` : '',
                    nutritionRaw ? `Nutrition: ${nutritionRaw}` : '',
                    String(notesRaw || '').trim(),
                ].filter(Boolean).join('\n');

                if (workoutBlocks.length && !hasWorkoutContent(`${title}\n${notes}`)) {
                    notes = [notes, buildBlocksNotes(workoutBlocks)].filter(Boolean).join('\n\n');
                }

                const localId = `local_csv_${Date.now()}_${i}`;
                await addEvent({
                    id: localId,
                    title,
                    type,
                    kind,
                    notes,
                    date: isoDate,
                    workoutBlocks,
                });

                imported += 1;
                const hasWorkout = eventHasWorkoutData({ title, notes, workoutBlocks }) || looksLikeSessionWorkout(title, notes);
                if (hasWorkout) {
                    detectedWorkouts += 1;
                }
                importedIds.push(localId);
                importedPreview.push({
                    id: localId,
                    date: parseISO(`${isoDate}T00:00:00`),
                    title,
                    type,
                    notes,
                    workoutBlocks,
                    hasWorkout,
                });
            }

            if (imported === 0) {
                throw new Error('No valid rows found. Check date format and required columns.');
            }

            setCsvImportSummary({
                fileName: file.name,
                imported,
                detectedWorkouts,
            });
            setImportedSessions(importedPreview);
        } catch (err) {
            setPlannerError(err.message || 'CSV import failed.');
        } finally {
            setIsImportingCsv(false);
            if (csvInputRef.current) csvInputRef.current.value = '';
        }
    };

    // ── Garmin export helpers ──────────────────────────────────────────────

    const upcomingStructured = useMemo(() => {
        const today = startOfDay(new Date());
        return plannedEvents.filter(e => {
            const d = new Date(String(e.start_date_local || e.date || '').slice(0, 10));
            return !isNaN(d) && d >= today && e.workoutBlocks?.length > 0;
        });
    }, [plannedEvents]);

    const handleExportPlanZip = async () => {
        setIsExportingZip(true);
        setGarminMsg(null);
        try {
            const ftp = athlete?.ftp || athlete?.icu_ftp || 200;
            const count = await exportPlanAsZip(upcomingStructured, ftp, 'apex-plan');
            setGarminMsg({ type: 'ok', text: `Downloaded ZIP with ${count} workout${count !== 1 ? 's' : ''}. Import each .fit into Garmin Connect.` });
        } catch (err) {
            setGarminMsg({ type: 'err', text: err.message });
        } finally {
            setIsExportingZip(false);
        }
    };

    const handleSyncAllToIcu = async () => {
        setIsSyncingIcu(true);
        setGarminMsg(null);
        try {
            if (!intervalsService.isConfigured()) {
                throw new Error('Intervals.icu not connected. Add your Athlete ID and API key in Settings.');
            }
            const payloads = upcomingStructured.map(e => buildIcuEventPayload(e));
            if (!payloads.length) throw new Error('No upcoming structured workouts to sync.');
            await intervalsService.createEvent(payloads);
            setGarminMsg({ type: 'ok', text: `Synced ${payloads.length} workout${payloads.length !== 1 ? 's' : ''} to Intervals.icu. Enable Garmin sync in Intervals.icu settings to push to your device.` });
        } catch (err) {
            setGarminMsg({ type: 'err', text: err.message });
        } finally {
            setIsSyncingIcu(false);
        }
    };

    const isRouteCandidate = (event) => {
        if (!event) return false;
        const hasPlannedId = String(event.id || '').startsWith('local_') || String(event.id || '').startsWith('event_');
        return event.kind === 'training' && hasPlannedId && event.date >= startOfDay(new Date());
    };

    const openEventCard = (event) => setSelectedEvent(event);

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <div className="page-title">Calendrier</div>
                    <div className="page-subtitle">Tes séances, tes courses et ce que tu as roulé</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="calendar-view-switch">
                        <button className={`btn ${viewMode === 'week' ? 'btn-primary' : ''}`} onClick={() => { setViewMode('week'); setCursor(new Date()); }}>Semaine</button>
                        <button className={`btn ${viewMode === 'month' ? 'btn-primary' : ''}`} onClick={() => { setViewMode('month'); setCursor(new Date()); }}>Mois</button>
                        <button className={`btn ${viewMode === 'year' ? 'btn-primary' : ''}`} onClick={() => { setViewMode('year'); setCursor(new Date()); }}>Année</button>
                    </div>
                    <button className="btn btn-sm" onClick={movePrev}>‹</button>
                    <button className="btn btn-sm" onClick={moveToday}>Aujourd’hui</button>
                    <button className="btn btn-sm" onClick={moveNext}>›</button>
                    <input
                        type="month"
                        className="form-input"
                        style={{ width: 140, fontSize:13, padding: '3px 8px' }}
                        value={format(cursor, 'yyyy-MM')}
                        onChange={e => { if (e.target.value) setCursor(parseISO(e.target.value + '-01')); }}
                    />
                </div>
            </div>

            <div className="calendar-layout">
                <div>
                    <div className="card" style={{ marginBottom: 0 }}>
                        <div className="card-header">
                            <span className="card-title">{periodLabel}</span>
                            
                        </div>

                        {viewMode === 'month' && (
                            <div className="calendar-weekdays">
                                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                                    <div key={day} className="calendar-weekday">{day}</div>
                                ))}
                            </div>
                        )}

                        {viewMode === 'month' && (
                            <div className="calendar-grid">
                                {days.map(day => {
                                    const dayKey = format(day, 'yyyy-MM-dd');
                                    const entries = byDay.get(dayKey) || [];
                                    const activityData = pastActivityColor.get(dayKey);
                                    const dayActivities = currentDayActivities.length > 0 && selectedActivityDay === dayKey ? currentDayActivities : [];
                                    const dayActPills = activitiesByDay.get(dayKey) || [];
                                    const ftp = athlete?.icu_ftp || athlete?.ftp || athlete?.ftp_watts || null;
                                    const totalPills = entries.length + dayActPills.length;

                                    return (
                                        <div
                                            key={dayKey}
                                            className={`calendar-day ${!isSameMonth(day, cursor) ? 'calendar-day-muted' : ''} ${isToday(day) ? 'calendar-day-today' : ''} ${dragOverDay === dayKey ? 'calendar-day-drop' : ''}`}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragOverDay(dayKey);
                                            }}
                                            onDragLeave={() => setDragOverDay(null)}
                                            onDrop={handleDropOnDay(dayKey)}
                                            onClick={() => openDayDetails(dayKey)}
                                            style={{ cursor: 'pointer' }}
                                            title={activityData ? `${Math.round(activityData.tss)} TSS` : 'Ajouter une séance ou une note'}
                                        >
                                            <div className="calendar-day-num" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{format(day, 'd')}</span>
                                                {activityData && <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--accent-green)', opacity: 0.8 }}>{Math.round(activityData.tss)}tss</span>}
                                                {availability[dayKey] && <span className={`cal-avail${availability[dayKey].off ? ' is-off' : ''}`}>{availability[dayKey].off ? 'pas dispo' : `≤ ${availability[dayKey].minutes}′`}</span>}
                                            </div>
                                            <div className="calendar-day-events">
                                                {entries.slice(0, 3).map(entry => {
                                                    const tone = trainingTone(entry);
                                                    const toneColor = { recovery: '#94a3b8', endurance: '#22c55e', intensive: '#f97316', race: '#f06060' }[tone] || '#f97316';
                                                    const bgColor = { training: 'var(--bg-2)', objective: 'var(--bg-2)', race: 'var(--bg-2)' }[entry.kind] || 'var(--bg-2)';
                                                    return (
                                                        <div
                                                            key={entry.id}
                                                            title={entry.title}
                                                            onClick={(e) => { e.stopPropagation(); openEventCard(entry); }}
                                                            style={{
                                                                cursor: 'pointer',
                                                                fontSize:13,
                                                                fontWeight: 500,
                                                                padding: '6px 8px',
                                                                borderRadius: '6px',
                                                                background: bgColor,
                                                                border: '1px solid var(--border)',
                                                                borderLeft: `3px solid ${toneColor}`,
                                                                color: 'var(--text-0)',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                transition: 'all 0.15s',
                                                                display: 'block',
                                                                marginBottom: 2,
                                                            }}
                                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.background = bgColor; }}
                                                        >
                                                            <div style={{ fontSize:13, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: 600 }}>{entry.title}</div>
                                                            {(entry.type || entry.kind) && (
                                                                <div style={{ fontSize:13, color: toneColor, fontFamily: 'var(--font-mono)', marginTop: 1, opacity: 0.8 }}>
                                                                    {entry.type || entry.kind}
                                                                    {entry.workoutBlocks?.length > 0 && ` · ${entry.workoutBlocks.reduce((s, b) => s + (b.duration || 0), 0)} min`}
                                                                </div>
                                                            )}
                                                            {entry.workoutBlocks?.length > 0 && <WorkoutBlocksGraph blocks={entry.workoutBlocks} />}
                                                        </div>
                                                    );
                                                })}
                                                {dayActPills.slice(0, Math.max(0, 3 - entries.length)).map((act, i) => {
                                                    const name = act.name || act.type || 'Activité';
                                                    return (
                                                        <div
                                                            key={`act_${act.id || i}`}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 5,
                                                                padding: '3px 6px', borderRadius: 5,
                                                                background: 'var(--bg-2)', border: '1px solid var(--border)',
                                                                overflow: 'hidden', cursor: 'pointer', marginBottom: 2,
                                                            }}
                                                            title={name}
                                                            onClick={(e) => { e.stopPropagation(); openDayDetails(dayKey); }}
                                                        >
                                                            <span style={{ fontSize:13, flexShrink: 0 }}><Picto name={sportIcon(act.type || act.sport_type || '')} size={16} /></span>
                                                            <span style={{ fontSize:13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</span>
                                                        </div>
                                                    );
                                                })}
                                                {totalPills > 3 && <div className="calendar-more">+{totalPills - 3}</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {viewMode === 'week' && (
                            <div className="calendar-grid calendar-grid-week">
                                {weekDays.map(day => {
                                    const dayKey = format(day, 'yyyy-MM-dd');
                                    const entries = byDayAll.get(dayKey) || [];
                                    const activityData = pastActivityColor.get(dayKey);
                                    return (
                                        <div
                                            key={dayKey}
                                            className={`calendar-day ${isToday(day) ? 'calendar-day-today' : ''} ${dragOverDay === dayKey ? 'calendar-day-drop' : ''}`}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragOverDay(dayKey);
                                            }}
                                            onDragLeave={() => setDragOverDay(null)}
                                            onDrop={handleDropOnDay(dayKey)}
                                            onClick={() => openDayDetails(dayKey)}
                                            title={activityData ? `${Math.round(activityData.tss)} TSS` : 'Ajouter une séance ou une note'}
                                        >
                                            <div className="calendar-day-num">
                                                {format(day, 'EEE d', { locale: dateFnsFr })}
                                                {availability[dayKey] && <span className={`cal-avail${availability[dayKey].off ? ' is-off' : ''}`}>{availabilityLabel(availability[dayKey])}</span>}
                                            </div>
                                            <div className="calendar-week-events">
                                                {entries.map(entry => {
                                                    const tone = trainingTone(entry);
                                                    const toneColor = { recovery: '#94a3b8', endurance: '#22c55e', intensive: '#f97316', race: '#f06060' }[tone] || '#f97316';
                                                    const notesPreview = String(entry.notes || '').replace(/\s+/g, ' ').slice(0, 170);
                                                    const blocksDuration = totalDuration(entry.workoutBlocks || []);
                                                    return (
                                                        <div
                                                            key={entry.id}
                                                            onClick={(e) => { e.stopPropagation(); openEventCard(entry); }}
                                                            style={{
                                                                cursor: 'pointer',
                                                                border: '1px solid var(--border)',
                                                                borderLeft: `3px solid ${toneColor}`,
                                                                borderRadius: '8px',
                                                                background: 'var(--bg-2)',
                                                                padding: '10px',
                                                                transition: 'all 0.15s',
                                                                position: 'relative',
                                                            }}
                                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-2)'; }}
                                                        >
                                                            {/* Delete button */}
                                                            {entry.planned && (
                                                                <button
                                                                    className="week-delete-btn"
                                                                    onClick={(e) => { e.stopPropagation(); onRemovePlannedEvent && onRemovePlannedEvent(entry.id); }}
                                                                    style={{
                                                                        position: 'absolute', top: 6, right: 6,
                                                                        width: 20, height: 20, borderRadius: 4,
                                                                        border: '1px solid rgba(239,68,68,0.4)',
                                                                        background: 'rgba(239,68,68,0.1)',
                                                                        color: '#ef4444', fontSize:13, fontWeight: 700,
                                                                        cursor: 'pointer', display: 'flex',
                                                                        alignItems: 'center', justifyContent: 'center',
                                                                        opacity: 1,
                                                                        lineHeight: 1,
                                                                    }}
                                                                    title="Supprimer cette séance"
                                                                >×</button>
                                                            )}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4, paddingRight: entry.planned ? 20 : 0 }}>
                                                                <div style={{ fontSize:14, fontWeight: 700, color: 'var(--text-0)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{entry.title}</div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 8, fontSize:13, color: 'var(--text-3)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                                                                <span style={{ color: toneColor, fontWeight: 600 }}>{toneLabel(tone)}</span>
                                                                {blocksDuration > 0 && <span>{blocksDuration} min</span>}
                                                            </div>
                                                            <WorkoutBlocksGraph blocks={entry.workoutBlocks} />
                                                            {!!notesPreview && (
                                                                <div style={{ fontSize:13, color: 'var(--text-3)', marginTop: 6, fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>{notesPreview}</div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {(activitiesByDay.get(dayKey) || []).map((act, i) => {
                                                    const name = act.name || act.type || 'Activité';
                                                    const duration = act.moving_time || act.elapsed_time || 0;
                                                    const durationStr = duration > 0 ? (Math.floor(duration/3600) > 0 ? `${Math.floor(duration/3600)}h${String(Math.floor((duration%3600)/60)).padStart(2,'0')}` : `${Math.floor(duration/60)}min`) : null;
                                                    const tss = act.icu_training_load || act.training_load || null;
                                                    const watts = act.icu_average_watts || act.average_watts || null;
                                                    return (
                                                        <div
                                                            key={`act_${act.id || i}`}
                                                            style={{
                                                                borderRadius: 7, padding: '7px 9px',
                                                                background: 'var(--bg-2)', border: '1px solid var(--border)',
                                                                cursor: 'pointer', marginBottom: 4,
                                                                display: 'flex', alignItems: 'center', gap: 8,
                                                            }}
                                                            onClick={(e) => { e.stopPropagation(); openDayDetails(dayKey); }}
                                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-2)'}
                                                        >
                                                            <span style={{ fontSize:15, flexShrink: 0 }}><Picto name={sportIcon(act.type || act.sport_type || '')} size={16} /></span>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize:13, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name}</div>
                                                                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                                                    {durationStr && <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-4)' }}>{durationStr}</span>}
                                                                    {watts && <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-4)' }}>{Math.round(watts)}W</span>}
                                                                    {tss != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--accent-orange)' }}>{Math.round(tss)} TSS</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {entries.length >= 6 && (
                                                    <div className="calendar-more">{entries.length} sessions</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {viewMode === 'year' && (
                            <div className="calendar-year-grid">
                                {yearMonths.map(m => (
                                    <div key={format(m.monthDate, 'yyyy-MM')} className="calendar-year-card">
                                        <div className="calendar-year-title">{format(m.monthDate, 'MMM', { locale: dateFnsFr })}</div>
                                        <div className="calendar-year-metric">{m.total} events</div>
                                        <div className="calendar-year-split">
                                            <span className="calendar-kind-training">{m.trainings} T</span>
                                            <span className="calendar-kind-objective">{m.objectives} O</span>
                                            <span className="calendar-kind-race">{m.races} R</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>

                <div className="card cal-tools-card" style={{ marginBottom: 0 }}>
                    <div className="cal-tools">
                        <button type="button" onClick={() => onOpenWorkoutBuilder?.()}>
                            <Picto name="blocks" size={20} /> Créer une séance
                        </button>
                        {[
                            ['manual', 'calendar', 'Ajouter au calendrier'],
                            ['library', 'book', 'Bibliothèque'],
                            ['upcoming', 'clipboard', 'Séances à venir'],
                            ['csv', 'send', 'Importer un plan'],
                            ['garmin', 'signal', 'Envoyer vers Garmin'],
                        ].map(([key, icon, label]) => (
                            <button key={key} type="button" className={!collapsed[key] ? 'is-on' : ''} aria-expanded={!collapsed[key]} onClick={() => openTool(key)}>
                                <Picto name={icon} size={20} /> {label}
                            </button>
                        ))}
                    </div>

                    <div className="planner-section">
                        <button
                            onClick={() => toggleSection('manual')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                width: '100%', padding: '14px 16px', borderRadius: 0, cursor: 'pointer',
                                background: collapsed.manual
                                    ? 'linear-gradient(135deg, rgba(77,127,232,0.08) 0%, rgba(249,115,22,0.08) 100%)'
                                    : 'linear-gradient(135deg, rgba(77,127,232,0.14) 0%, rgba(249,115,22,0.14) 100%)',
                                border: 'none',
                                transition: 'all 0.2s',
                                fontFamily: 'var(--font-sans)',
                                fontSize:15,
                                fontWeight: 700,
                                color: 'var(--text-0)',
                            }}
                        >
                            <Picto name="bolt" size={22} />
                            <div style={{ flex: 1 }}>
                                <div>Ajouter au calendrier</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--accent-orange)', marginTop: 2 }}>Une séance, une course ou un objectif</div>
                            </div>
                            <span style={{ fontSize:15, color: 'var(--text-3)' }}>{collapsed.manual ? '▼' : '▲'}</span>
                        </button>
                        {!collapsed.manual && <div style={{ padding: '16px', background: 'rgba(77,127,232,0.04)', border: '1px solid rgba(77,127,232,0.2)', borderTop: 'none' }}>
                            <div className="card-title" style={{ marginBottom: 8 }}>Ajouter au calendrier</div>
                            <input className="form-input calendar-form-input" type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} />
                            <input className="form-input calendar-form-input" placeholder="Titre de la séance" value={manualTitle} onChange={e => setManualTitle(e.target.value)} />
                            <div className="calendar-form-row">
                                <select className="form-input calendar-form-input" value={manualType} onChange={e => setManualType(e.target.value)}>
                                    <option value="Workout">Workout</option>
                                    <option value="Ride">Ride</option>
                                    <option value="Run">Run</option>
                                    <option value="Race">Course</option>
                                </select>
                                <select className="form-input calendar-form-input" value={manualKind} onChange={e => setManualKind(e.target.value)}>
                                    <option value="training">Entraînement</option>
                                    <option value="objective">Objectif</option>
                                    <option value="race">Course</option>
                                </select>
                            </div>
                            <input className="form-input calendar-form-input" placeholder="Notes, objectifs" value={manualNotes} onChange={e => setManualNotes(e.target.value)} />
                            <button className="btn btn-primary" onClick={handleManualAdd}>Ajouter</button>
                        </div>}
                    </div>

                    <div className="planner-section">
                        <button
                            onClick={() => toggleSection('library')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                width: '100%', padding: '14px 16px', borderRadius: 0, cursor: 'pointer',
                                background: collapsed.library
                                    ? 'linear-gradient(135deg, rgba(62,207,110,0.08) 0%, rgba(240,180,41,0.08) 100%)'
                                    : 'linear-gradient(135deg, rgba(62,207,110,0.14) 0%, rgba(240,180,41,0.14) 100%)',
                                border: 'none',
                                transition: 'all 0.2s',
                                fontFamily: 'var(--font-sans)',
                                fontSize:15,
                                fontWeight: 700,
                                color: 'var(--text-0)',
                            }}
                        >
                            <Picto name="book" size={22} />
                            <div style={{ flex: 1 }}>
                                <div>Bibliothèque</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--accent-green)', marginTop: 2 }}>Glisse une séance sur le calendrier</div>
                            </div>
                            <span style={{ fontSize:15, color: 'var(--text-3)' }}>{collapsed.library ? '▼' : '▲'}</span>
                        </button>
                        {!collapsed.library && <div style={{ padding: '16px', background: 'rgba(62,207,110,0.04)', border: '1px solid rgba(62,207,110,0.2)', borderTop: 'none' }}>
                            <div className="card-title" style={{ marginBottom: 8 }}>Bibliothèque</div>
                            <div className="calendar-library-list">
                                {libraryWorkouts.map((workout, idx) => (
                                    <div
                                        key={workout.title}
                                        className="library-workout-card"
                                        draggable
                                        onDragStart={handleDragStart(workout)}
                                        title="Drag this workout to a calendar day"
                                    >
                                        <div className="library-workout-head">
                                            <div className="library-workout-title">{workout.title}</div>
                                            <button className="btn" onClick={() => addLibraryWorkout(workout, format(new Date(), 'yyyy-MM-dd'))}>+ Ajouter aujourd'hui</button>
                                        </div>
                                        <div className="library-workout-meta">
                                            <span>{workout.type}</span>
                                            <span>{totalDuration(workout.blocks)} min</span>
                                            <span>{workout.objective}</span>
                                        </div>
                                        <WorkoutBlocksGraph blocks={workout.blocks} />
                                        <div className="library-workout-notes">{workout.notes}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="calendar-helper">Glisse une séance sur un jour du calendrier, ou utilise « Ajouter aujourd’hui ».</div>
                        </div>}
                    </div>


                    <div className="planner-section">
                        <button
                            onClick={() => toggleSection('csv')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                width: '100%', padding: '14px 16px', borderRadius: 0, cursor: 'pointer',
                                background: collapsed.csv
                                    ? 'linear-gradient(135deg, rgba(240,180,41,0.08) 0%, rgba(240,97,58,0.08) 100%)'
                                    : 'linear-gradient(135deg, rgba(240,180,41,0.14) 0%, rgba(240,97,58,0.14) 100%)',
                                border: 'none',
                                transition: 'all 0.2s',
                                fontFamily: 'var(--font-sans)',
                                fontSize:15,
                                fontWeight: 700,
                                color: 'var(--text-0)',
                            }}
                        >
                            <Picto name="send" size={22} />
                            <div style={{ flex: 1 }}>
                                <div>Importer un plan (CSV)</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--accent-orange)', marginTop: 2 }}>Depuis un tableur</div>
                            </div>
                            <span style={{ fontSize:15, color: 'var(--text-3)' }}>{collapsed.csv ? '▼' : '▲'}</span>
                        </button>
                        {!collapsed.csv && <div style={{ padding: '16px', background: 'rgba(240,180,41,0.04)', border: '1px solid rgba(240,180,41,0.2)', borderTop: 'none' }}>
                            <div className="card-title" style={{ marginBottom: 8 }}>Importer un plan (CSV)</div>
                            <input
                                ref={csvInputRef}
                                className="form-input calendar-form-input"
                                type="file"
                                accept=".csv,text/csv"
                                onChange={handleImportCsv}
                                disabled={isImportingCsv}
                            />
                            <div className="calendar-helper">
                                Supported columns: date, title/name, type/sport, kind, notes, and optional blocks.
                                Blocks format: Warmup|12|Z2;Main set|30|Z3;Cooldown|10|Z1
                            </div>
                            {csvImportSummary && (
                                <div className="calendar-csv-summary">
                                    <div>File: {csvImportSummary.fileName}</div>
                                    <div>Imported events: {csvImportSummary.imported}</div>
                                    <div>Detected workouts: {csvImportSummary.detectedWorkouts}</div>
                                    <div>Use "Download FIT" on each session card.</div>
                                </div>
                            )}
                            {!!importedSessions.length && (
                                <div className="calendar-upcoming-list" style={{ marginTop: 10 }}>
                                    {importedSessions.slice(0, 40).map(session => (
                                        <div key={session.id} className="calendar-upcoming-item">
                                            <div>
                                                <div className="calendar-upcoming-date">{format(session.date, 'EEE dd MMM yyyy', { locale: dateFnsFr })}</div>
                                                <div className="calendar-upcoming-title">{session.title}</div>
                                                <WorkoutBlocksGraph blocks={session.workoutBlocks} />
                                            </div>
                                            <div className="calendar-upcoming-actions">
                                                <span className={`calendar-kind-badge ${session.hasWorkout ? 'calendar-kind-training' : 'calendar-kind-objective'}`}>
                                                    {session.hasWorkout ? 'Workout' : 'No workout'}
                                                </span>
                                                {session.hasWorkout && (
                                                    <button className="calendar-fit-btn" onClick={() => downloadEventFit(session)}>
                                                        Download FIT
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button className="btn" disabled={isImportingCsv} onClick={() => csvInputRef.current?.click()}>
                                {isImportingCsv ? 'Importing...' : 'Choisir un fichier CSV'}
                            </button>
                        </div>}
                    </div>

                    {/* ── Send to Garmin ───────────────────────────────── */}
                    <div className="planner-section">
                        <button
                            onClick={() => toggleSection('garmin')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                width: '100%', padding: '14px 16px', borderRadius: 0, cursor: 'pointer',
                                background: collapsed.garmin
                                    ? 'linear-gradient(135deg, rgba(159,122,234,0.08) 0%, rgba(240,97,58,0.08) 100%)'
                                    : 'linear-gradient(135deg, rgba(159,122,234,0.14) 0%, rgba(240,97,58,0.14) 100%)',
                                border: 'none',
                                transition: 'all 0.2s',
                                fontFamily: 'var(--font-sans)',
                                fontSize:15,
                                fontWeight: 700,
                                color: 'var(--text-0)',
                            }}
                        >
                            <div style={{ fontSize:20, lineHeight: 1 }}>⌚</div>
                            <div style={{ flex: 1 }}>
                                <div>Envoyer vers Garmin</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--accent-orange)', marginTop: 2 }}>Via Intervals.icu ou en fichiers</div>
                            </div>
                            <span style={{ fontSize:15, color: 'var(--text-3)' }}>{collapsed.garmin ? '▼' : '▲'}</span>
                        </button>
                        {!collapsed.garmin && (
                            <div style={{ padding: '16px', background: 'rgba(159,122,234,0.04)', border: '1px solid rgba(159,122,234,0.2)', borderTop: 'none' }}>
                                <div className="card-title" style={{ marginBottom: 4 }}>Envoyer vers Garmin</div>
                                <div style={{ fontSize:13, color: 'var(--text-3)', marginBottom: 12 }}>
                                    {upcomingStructured.length} structured workout{upcomingStructured.length !== 1 ? 's' : ''} ready to export
                                </div>

                                {/* Option A — Intervals.icu sync */}
                                <div style={{
                                    background: 'var(--bg-3)', borderRadius: 8, padding: '10px 12px', marginBottom: 10,
                                    borderLeft: '3px solid var(--accent-cyan)',
                                }}>
                                    <div style={{ fontSize:15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
                                        Via Intervals.icu (recommended)
                                    </div>
                                    <div style={{ fontSize:13, color: 'var(--text-3)', marginBottom: 8 }}>
                                        Pushes workouts to Intervals.icu calendar. If you have Garmin Connect sync enabled in Intervals.icu, they appear on your device automatically.
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%', fontSize:13 }}
                                        disabled={isSyncingIcu || !upcomingStructured.length}
                                        onClick={handleSyncAllToIcu}
                                    >
                                        {isSyncingIcu ? 'Syncing...' : `Sync ${upcomingStructured.length} Workout${upcomingStructured.length !== 1 ? 's' : ''} to Intervals.icu`}
                                    </button>
                                </div>

                                {/* Option B — ZIP download */}
                                <div style={{
                                    background: 'var(--bg-3)', borderRadius: 8, padding: '10px 12px',
                                    borderLeft: '3px solid var(--accent-orange)',
                                }}>
                                    <div style={{ fontSize:15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
                                        Download as ZIP (.fit files)
                                    </div>
                                    <div style={{ fontSize:13, color: 'var(--text-3)', marginBottom: 8 }}>
                                        One .fit file per workout. Import manually into Garmin Connect website or Garmin Express.
                                    </div>
                                    <button
                                        className="btn"
                                        style={{ width: '100%', fontSize:13 }}
                                        disabled={isExportingZip || !upcomingStructured.length}
                                        onClick={handleExportPlanZip}
                                    >
                                        {isExportingZip ? 'Building ZIP...' : `Download ZIP (${upcomingStructured.length} file${upcomingStructured.length !== 1 ? 's' : ''})`}
                                    </button>
                                </div>

                                {garminMsg && (
                                    <div style={{
                                        marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize:13,
                                        background: garminMsg.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                        color: garminMsg.type === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)',
                                        border: `1px solid ${garminMsg.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                    }}>
                                        {garminMsg.text}
                                    </div>
                                )}

                                {upcomingStructured.length === 0 && (
                                    <div className="calendar-helper">
                                        Build workouts using the Smart Workout Wizard — only workouts with structured blocks can be exported as FIT files.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {plannerError && (
                        <div className="error-banner" style={{ marginBottom: 12 }}>
                            <span className="error-tag">[ERR]</span>
                            {plannerError}
                        </div>
                    )}

                    {!collapsed.upcoming && (loading && timelineEvents.length === 0 ? (
                        <div className="loading-state" style={{ padding: '24px 8px' }}>
                            <div className="loading-spinner" />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize:15 }}>Chargement des séances…</span>
                        </div>
                    ) : timelineEvents.length === 0 ? (
                        <div className="info-banner" style={{ marginBottom: 0 }}>
                            No events found. Add planned workouts or race objectives in Intervals.icu events.
                            {csvImportSummary?.imported > 0 && (
                                <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize:13 }}>
                                    CSV import succeeded, but imported dates may be in the past relative to today.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="calendar-upcoming-list">
                            {timelineEvents.map(event => (
                                <div key={event.id} className="calendar-upcoming-item" onClick={() => openEventCard(event)} style={{ cursor: 'pointer' }}>
                                    <div>
                                        <div className="calendar-upcoming-date">{format(event.date, 'EEE dd MMM yyyy', { locale: dateFnsFr })}</div>
                                        <div className="calendar-upcoming-title">{event.title}</div>
                                        <WorkoutBlocksGraph blocks={event.workoutBlocks} />
                                    </div>
                                    <div className="calendar-upcoming-actions" onClick={e => e.stopPropagation()}>
                                        <span className={`calendar-kind-badge ${event.date < startOfDay(new Date()) ? 'calendar-kind-objective' : 'calendar-kind-training'}`}>
                                            {event.date < startOfDay(new Date()) ? 'Past' : 'Upcoming'}
                                        </span>
                                        <span className={`calendar-kind-badge calendar-kind-${event.kind}`}>{kindLabel(event.kind)}</span>
                                        {eventHasWorkoutData(event) && (
                                            <button className="calendar-fit-btn" onClick={() => downloadEventFit(event)}>
                                                Download FIT
                                            </button>
                                        )}
                                        {String(event.id).startsWith('local_') && (
                                            <button className="calendar-remove-btn" onClick={() => onRemovePlannedEvent(event.id)}>
                                                Supprimer
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Activity details modal ───────────────────────────── */}
            {selectedActivityDay && (
                <div className="cal-modal-backdrop"
                    onClick={() => setSelectedActivityDay(null)}
                >
                    <div className="cal-modal" style={{ maxWidth: 860 }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize:15, color: 'var(--text-3)', marginBottom: 4 }}>Détail du jour</div>
                                <div style={{ fontFamily: 'var(--font-sans)', fontSize:20, fontWeight: 600, color: 'var(--text-0)' }}>
                                    {format(parseISO(`${selectedActivityDay}T00:00:00`), 'EEEE, dd MMMM yyyy', { locale: dateFnsFr })}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedActivityDay(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize:20, lineHeight: 1, padding: '0 4px' }}
                            >×</button>
                        </div>

                        {selectedActivityDay >= format(new Date(), 'yyyy-MM-dd') && (
                            <div className="cal-avail-picker">
                                <div className="cal-avail-title">Ta dispo ce jour-là</div>
                                <div className="cal-avail-options" role="radiogroup" aria-label="Disponibilité">
                                    {AVAILABILITY_OPTIONS.map(o => (
                                        <button key={o.value} type="button" role="radio"
                                            aria-checked={availabilityValue(availability[selectedActivityDay]) === o.value}
                                            className={availabilityValue(availability[selectedActivityDay]) === o.value ? 'is-on' : ''}
                                            onClick={() => setAvailability(selectedActivityDay, o.value).then(setAvail)}>
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="cal-avail-help">Pas dispo : la séance passe sur un autre jour de la semaine. Temps limité : elle est raccourcie.</p>
                            </div>
                        )}

                        {/* Tab selector */}
                        <div style={{ display: 'flex', gap: 4, marginBottom: 16, padding: 4, background: 'var(--bg-2)', borderRadius: 8 }}>
                            {[{ id: 'quick', label: 'Ajout rapide' }, { id: 'builder', label: 'Construire la séance' }].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setDayModalTab(tab.id)}
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: 6,
                                        border: 'none', cursor: 'pointer', fontSize:13, fontWeight: 600,
                                        background: dayModalTab === tab.id ? 'var(--bg-3)' : 'transparent',
                                        color: dayModalTab === tab.id ? 'var(--text-0)' : 'var(--text-3)',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {dayModalTab === 'quick' && (
                            <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 8 }}>Ajouter une séance ou une note</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                                    <input className="form-input calendar-form-input" placeholder="Titre (facultatif)" value={dayQuickTitle} onChange={e => setDayQuickTitle(e.target.value)} />
                                    <select className="form-input calendar-form-input" value={dayQuickType} onChange={e => setDayQuickType(e.target.value)}>
                                        <option value="Workout">Workout</option>
                                        <option value="Ride">Ride</option>
                                        <option value="Run">Run</option>
                                        <option value="Note">Note</option>
                                    </select>
                                    <select className="form-input calendar-form-input" value={dayQuickKind} onChange={e => setDayQuickKind(e.target.value)}>
                                        <option value="training">Entraînement</option>
                                        <option value="objective">Objectif</option>
                                        <option value="race">Course</option>
                                    </select>
                                </div>
                                <input className="form-input calendar-form-input" placeholder="Notes, objectifs" value={dayQuickNotes} onChange={e => setDayQuickNotes(e.target.value)} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <button className="btn btn-primary" onClick={handleDayQuickAdd}>Ajouter</button>
                                    <button className="btn" onClick={() => {
                                        setDayQuickType('Note');
                                        setDayQuickKind('objective');
                                        if (!dayQuickTitle.trim()) setDayQuickTitle('Note');
                                    }}>Note type</button>
                                </div>
                            </div>
                        )}

                        {dayModalTab === 'builder' && (
                            <div style={{ marginBottom: 16 }}>
                                <SmartWorkoutWizard
                                    athlete={athlete}
                                    events={events}
                                    plannedEvents={plannedEvents}
                                    onAddToCalendar={async (eventData) => {
                                        await onAddPlannedEvent(eventData);
                                        setSelectedActivityDay(null);
                                    }}
                                    onGenerateWithAi={onGenerateAiWorkoutTemplate}
                                    initialDate={selectedActivityDay}
                                />
                            </div>
                        )}

                        {/* Activities list */}
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 8 }}>
                            Sorties ({currentDayActivities.length})
                        </div>
                        {currentDayActivities.length === 0 && (
                            <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, background: 'var(--bg-2)', color: 'var(--text-2)', fontSize:15 }}>
                                Aucune sortie ce jour-là. Tu peux ajouter une séance ou une note au-dessus.
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {currentDayActivities.map((activity, idx) => {
                                const duration = activity.moving_time ? Math.round(activity.moving_time / 60) : 0;
                                const avgWatts = activity.icu_average_watts || activity.average_watts || null;
                                const avgHr = activity.average_heartrate || null;
                                const tss = activity.icu_training_load || activity.training_load || activity.tss || activity.load || 0;
                                const distance = activity.distance ? (activity.distance / 1000).toFixed(1) : null;
                                const elevGain = activity.total_elevation_gain;
                                const ef = (avgWatts && avgHr) ? (avgWatts / avgHr).toFixed(3) : null;
                                const type = activity.type || activity.sport_type || activity.sport || 'Activité';

                                return (
                                    <div key={idx} style={{
                                        background: 'var(--bg-2)', borderRadius: 10, padding: 16,
                                        border: '1px solid var(--border)',
                                    }}>
                                        {/* Activity title and type */}
                                        <div style={{ marginBottom: 12 }}>
                                            <div style={{ fontFamily: 'var(--font-sans)', fontSize:15, fontWeight: 600, color: 'var(--text-0)', marginBottom: 4 }}>
                                                {activity.name || 'Sortie sans titre'}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, padding: '4px 10px', borderRadius: 20, background: 'var(--bg-3)', color: 'var(--text-2)' }}>
                                                    {type.toUpperCase()}
                                                </span>
                                                {tss > 0 && (
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, padding: '4px 10px', borderRadius: 20, background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e' }}>
                                                        {Math.round(tss)} TSS
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Metrics grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
                                            {duration > 0 && (
                                                <div style={{ padding: 10, background: 'var(--bg-1)', borderRadius: 8 }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 4 }}>Durée</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:15, fontWeight: 600, color: 'var(--text-0)' }}>
                                                        {duration}m
                                                    </div>
                                                </div>
                                            )}
                                            {distance && (
                                                <div style={{ padding: 10, background: 'var(--bg-1)', borderRadius: 8 }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 4 }}>Distance</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:15, fontWeight: 600, color: 'var(--text-0)' }}>
                                                        {distance} km
                                                    </div>
                                                </div>
                                            )}
                                            {avgWatts && (
                                                <div style={{ padding: 10, background: 'var(--bg-1)', borderRadius: 8 }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 4 }}>Puissance moy.</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:15, fontWeight: 600, color: 'var(--accent-orange)' }}>
                                                        {Math.round(avgWatts)} W
                                                    </div>
                                                </div>
                                            )}
                                            {avgHr && (
                                                <div style={{ padding: 10, background: 'var(--bg-1)', borderRadius: 8 }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 4 }}>FC moy.</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:15, fontWeight: 600, color: 'var(--accent-red)' }}>
                                                        {Math.round(avgHr)} bpm
                                                    </div>
                                                </div>
                                            )}
                                            {ef && (
                                                <div style={{ padding: 10, background: 'var(--bg-1)', borderRadius: 8 }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 4 }}>Efficacité</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:15, fontWeight: 600, color: 'var(--accent-green)' }}>
                                                        {ef}
                                                    </div>
                                                </div>
                                            )}
                                            {elevGain && (
                                                <div style={{ padding: 10, background: 'var(--bg-1)', borderRadius: 8 }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 4 }}>Dénivelé</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize:15, fontWeight: 600, color: 'var(--text-0)' }}>
                                                        {Math.round(elevGain)} m
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Notes if present */}
                                        {activity.notes && (
                                            <div style={{ padding: 10, background: 'var(--bg-1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize:15, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                                                {activity.notes}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Close button */}
                        <button className="btn" style={{ marginTop: 20, width: '100%' }} onClick={() => setSelectedActivityDay(null)}>Fermer</button>
                    </div>
                </div>
            )}

            {/* ── Event detail modal ───────────────────────────── */}
            {selectedEvent && (
                <div className="cal-modal-backdrop"
                    onClick={() => setSelectedEvent(null)}
                >
                    <div className="cal-modal" style={{ maxWidth: 640 }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-sans)', fontSize:20, fontWeight: 600, color: 'var(--text-0)', marginBottom: 4 }}>
                                    {selectedEvent.title}
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize:15, color: 'var(--text-2)' }}>
                                    {format(selectedEvent.date, 'EEEE, dd MMMM yyyy', { locale: dateFnsFr })}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedEvent(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize:20, lineHeight: 1, padding: '0 4px' }}
                            >×</button>
                        </div>

                        {/* Badges */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                            {selectedEvent.type && (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, padding: '3px 10px', borderRadius: 20, background: 'var(--bg-3)', color: 'var(--text-2)' }}>
                                    {selectedEvent.type.toUpperCase()}
                                </span>
                            )}
                            <span className={`calendar-kind-badge calendar-kind-${selectedEvent.kind}`}>
                                {kindLabel(selectedEvent.kind)}
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, padding: '3px 10px', borderRadius: 20, background: 'var(--bg-3)', color: 'var(--text-2)' }}>
                                {toneLabel(trainingTone(selectedEvent))}
                            </span>
                            {totalDuration(selectedEvent.workoutBlocks || []) > 0 && (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize:13, padding: '3px 10px', borderRadius: 20, background: 'rgba(249,115,22,0.12)', color: 'var(--accent-orange)' }}>
                                    {totalDuration(selectedEvent.workoutBlocks)} min
                                </span>
                            )}
                        </div>

                        {/* Workout block visual */}
                        {selectedEvent.workoutBlocks?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 8 }}>Structure de la séance</div>
                                <WorkoutDetailVisual
                                    blocks={selectedEvent.workoutBlocks}
                                    ftp={athlete?.ftp || athlete?.icu_ftp || null}
                                />
                            </div>
                        )}

                        {/* Notes */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize:13, color: 'var(--text-3)', marginBottom: 6 }}>Notes</div>
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize:13, color: selectedEvent.notes ? 'var(--text-1)' : 'var(--text-3)', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'var(--bg-2)', borderRadius: 8, padding: '12px 14px' }}>
                                {selectedEvent.notes || 'Pas de note pour cette séance.'}
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                            {eventHasWorkoutData(selectedEvent) && (
                                <button className="btn btn-primary" onClick={() => { downloadEventFit(selectedEvent); }}>
                                    Garmin FIT
                                </button>
                            )}
                            {eventHasWorkoutData(selectedEvent) && onExportToZwift && (
                                <button className="btn" onClick={() => onExportToZwift(selectedEvent)}>
                                    Zwift .zwo
                                </button>
                            )}
                            {eventHasWorkoutData(selectedEvent) && onSendToWahoo && (
                                <button className="btn" onClick={async () => {
                                    try {
                                        await onSendToWahoo(selectedEvent);
                                        alert('Séance envoyée sur Wahoo');
                                    } catch (err) {
                                        alert('Wahoo : ' + err.message);
                                    }
                                }}>
                                    Envoyer sur Wahoo
                                </button>
                            )}
                            {isRouteCandidate(selectedEvent) && (
                                <button className="btn" onClick={() => setRoutePromptEvent(selectedEvent)}>
                                    Préparer un parcours
                                </button>
                            )}
                            {String(selectedEvent.id).startsWith('local_') && (
                                <button className="btn btn-danger" onClick={() => { onRemovePlannedEvent(selectedEvent.id); setSelectedEvent(null); }}>
                                    Supprimer
                                </button>
                            )}
                            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setSelectedEvent(null)}>Fermer</button>
                        </div>
                    </div>
                </div>
            )}

            {routePromptEvent && (
                <div className="cal-modal-backdrop"
                    onClick={() => setRoutePromptEvent(null)}
                >
                    <div className="cal-modal" style={{ maxWidth: 520 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ fontSize:20, fontWeight: 650, color: 'var(--text-0)', marginBottom: 8 }}>
                            Préparer un parcours pour cette séance
                        </div>
                        <div style={{ fontSize:15, color: 'var(--text-1)', lineHeight: 1.6, marginBottom: 14 }}>
                            Un parcours adapté à <strong>{routePromptEvent.title}</strong>, le {format(routePromptEvent.date, 'EEE dd MMM', { locale: dateFnsFr })}.
                        </div>
                        <div style={{
                            border: '1px solid var(--border)',
                            background: 'var(--bg-2)',
                            borderRadius: 10,
                            padding: '10px 12px',
                            fontSize:15,
                            color: 'var(--text-2)',
                            marginBottom: 16,
                        }}>
                            Tu pourras régler distance, revêtement et style de parcours sur la carte.
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => setRoutePromptEvent(null)}>
                                Annuler
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    onOpenRouteBuilder?.(routePromptEvent);
                                    setRoutePromptEvent(null);
                                    setSelectedEvent(null);
                                }}
                            >
                                Ouvrir la carte
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Athlete profile setup ── */}
            {showProfileSetup && (
                <AthleteProfileSetup
                    initialProfile={athleteProfile}
                    onComplete={(profile) => {
                        setAthleteProfile(profile);
                        setShowProfileSetup(false);
                        setTimeout(() => suggestWeek(), 50);
                    }}
                />
            )}


        </div>
    );
}
