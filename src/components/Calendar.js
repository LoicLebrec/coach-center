import React, { useMemo, useRef, useState } from 'react';
import {
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
import { exportWorkoutFit, hasWorkoutContent } from '../services/workout-exporter';

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

const LIBRARY_WORKOUTS = [
    {
        title: 'Z2 Endurance Ride',
        type: 'Ride',
        kind: 'training',
        objective: 'Aerobic base and fat oxidation',
        notes: 'Long steady aerobic work with minimal drift.',
        blocks: [
            { label: 'Warmup', durationMin: 12, zone: 'Z2' },
            { label: 'Endurance', durationMin: 70, zone: 'Z2' },
            { label: 'Cadence Skills', durationMin: 8, zone: 'Z3' },
            { label: 'Cooldown', durationMin: 10, zone: 'Z1' },
        ],
    },
    {
        title: 'VO2 Max 5x5',
        type: 'Ride',
        kind: 'training',
        objective: 'Increase aerobic ceiling (VO2)',
        notes: 'High-intensity repeats with equal recovery.',
        blocks: [
            { label: 'Warmup', durationMin: 15, zone: 'Z2' },
            { label: 'VO2 #1', durationMin: 5, zone: 'Z5' },
            { label: 'Recover', durationMin: 5, zone: 'Z1' },
            { label: 'VO2 #2', durationMin: 5, zone: 'Z5' },
            { label: 'Recover', durationMin: 5, zone: 'Z1' },
            { label: 'VO2 #3', durationMin: 5, zone: 'Z5' },
            { label: 'Recover', durationMin: 5, zone: 'Z1' },
            { label: 'VO2 #4', durationMin: 5, zone: 'Z5' },
            { label: 'Recover', durationMin: 5, zone: 'Z1' },
            { label: 'VO2 #5', durationMin: 5, zone: 'Z5' },
            { label: 'Cooldown', durationMin: 10, zone: 'Z1' },
        ],
    },
    {
        title: 'Threshold 2x20',
        type: 'Ride',
        kind: 'training',
        objective: 'Raise FTP durability',
        notes: 'Classic threshold workout with controlled execution.',
        blocks: [
            { label: 'Warmup', durationMin: 15, zone: 'Z2' },
            { label: 'Threshold #1', durationMin: 20, zone: 'Z4' },
            { label: 'Recover', durationMin: 10, zone: 'Z1' },
            { label: 'Threshold #2', durationMin: 20, zone: 'Z4' },
            { label: 'Cooldown', durationMin: 10, zone: 'Z1' },
        ],
    },
    {
        title: 'Sweet Spot 3x12',
        type: 'Ride',
        kind: 'training',
        objective: 'Build sub-threshold aerobic power',
        notes: 'Efficient quality session with moderate strain.',
        blocks: [
            { label: 'Warmup', durationMin: 12, zone: 'Z2' },
            { label: 'SS #1', durationMin: 12, zone: 'Z3' },
            { label: 'Recover', durationMin: 5, zone: 'Z1' },
            { label: 'SS #2', durationMin: 12, zone: 'Z3' },
            { label: 'Recover', durationMin: 5, zone: 'Z1' },
            { label: 'SS #3', durationMin: 12, zone: 'Z3' },
            { label: 'Cooldown', durationMin: 8, zone: 'Z1' },
        ],
    },
    {
        title: 'Long Run Aerobic',
        type: 'Run',
        kind: 'training',
        objective: 'Running aerobic durability',
        notes: 'Steady easy pace with cadence consistency.',
        blocks: [
            { label: 'Warmup Jog', durationMin: 10, zone: 'Z1' },
            { label: 'Aerobic Run', durationMin: 70, zone: 'Z2' },
            { label: 'Strides', durationMin: 6, zone: 'Z5' },
            { label: 'Easy Jog', durationMin: 8, zone: 'Z1' },
        ],
    },
    {
        title: 'A-Race Objective',
        type: 'Race',
        kind: 'race',
        objective: 'Season peak race',
        notes: 'Primary event objective. Protect taper and freshness.',
        blocks: [
            { label: 'Pre-race Prep', durationMin: 20, zone: 'Z2' },
            { label: 'Openers', durationMin: 10, zone: 'Z4' },
            { label: 'Race', durationMin: 90, zone: 'Z4' },
        ],
    },
    {
        title: 'Recovery Spin + Mobility',
        type: 'Ride',
        kind: 'training',
        objective: 'Absorb load and improve freshness',
        notes: 'Low-intensity neural reset and mobility block.',
        blocks: [
            { label: 'Easy Spin', durationMin: 35, zone: 'Z1' },
            { label: 'Mobility', durationMin: 20, zone: 'Z1' },
        ],
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
    const csvInputRef = useRef(null);
    const [cursor, setCursor] = useState(startOfMonth(new Date()));
    const [viewMode, setViewMode] = useState('month');
    const [collapsed, setCollapsed] = useState({
        builder: false,
        manual: true,
        library: false,
        ai: true,
        csv: true,
        upcoming: false,
    });
    const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [manualTitle, setManualTitle] = useState('');
    const [manualType, setManualType] = useState('Workout');
    const [manualKind, setManualKind] = useState('training');
    const [manualNotes, setManualNotes] = useState('');
    const [aiObjective, setAiObjective] = useState('Build aerobic fitness and prepare for next race block');
    const [aiDays, setAiDays] = useState(7);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isImportingCsv, setIsImportingCsv] = useState(false);
    const [csvImportSummary, setCsvImportSummary] = useState(null);
    const [importedSessions, setImportedSessions] = useState([]);
    const [plannerError, setPlannerError] = useState(null);
    const [dragOverDay, setDragOverDay] = useState(null);

    const allEvents = useMemo(() => {
        return [...(events || []), ...(plannedEvents || [])];
    }, [events, plannedEvents]);

    const normalizedAllEvents = useMemo(() => {
        return allEvents
            .map(normalizeEvent)
            .filter(Boolean)
            .sort((a, b) => a.date - b.date);
    }, [allEvents]);

    const futureEvents = useMemo(() => {
        const today = startOfDay(new Date());
        return normalizedAllEvents
            .filter(e => e.date >= today)
            .sort((a, b) => a.date - b.date);
    }, [normalizedAllEvents]);

    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
    const yearStart = startOfYear(cursor);

    const byDay = useMemo(() => {
        const map = new Map();
        futureEvents.forEach(event => {
            if (!isSameMonth(event.date, cursor)) return;
            if (!map.has(event.dateKey)) map.set(event.dateKey, []);
            map.get(event.dateKey).push(event);
        });
        return map;
    }, [futureEvents, cursor]);

    const byDayAll = useMemo(() => {
        const map = new Map();
        futureEvents.forEach(event => {
            if (!map.has(event.dateKey)) map.set(event.dateKey, []);
            map.get(event.dateKey).push(event);
        });
        return map;
    }, [futureEvents]);

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
            const monthEvents = futureEvents.filter(e => isSameMonth(e.date, monthDate));
            arr.push({
                monthDate,
                total: monthEvents.length,
                races: monthEvents.filter(e => e.kind === 'race').length,
                objectives: monthEvents.filter(e => e.kind === 'objective').length,
                trainings: monthEvents.filter(e => e.kind === 'training').length,
            });
        }
        return arr;
    }, [futureEvents, yearStart]);

    const upcoming = futureEvents.slice(0, 20);

    const periodLabel = useMemo(() => {
        if (viewMode === 'week') {
            const wkEnd = endOfWeek(cursor, { weekStartsOn: 1 });
            return `${format(weekStart, 'dd MMM')} - ${format(wkEnd, 'dd MMM yyyy')}`;
        }
        if (viewMode === 'year') return format(cursor, 'yyyy');
        return format(cursor, 'MMMM yyyy');
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

    const addLibraryWorkout = async (workout, offset) => {
        const date = new Date();
        date.setDate(date.getDate() + offset);

        const notes = [
            `Objective: ${workout.objective}`,
            workout.notes,
            '',
            buildBlocksNotes(workout.blocks),
        ].join('\n');

        await addEvent({
            title: workout.title,
            type: workout.type,
            kind: workout.kind,
            notes,
            date: format(date, 'yyyy-MM-dd'),
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
        const fitText = buildFitText(event);
        if (!fitText) return;
        const sportType = /run/i.test(String(event?.type || '')) ? 'running' : 'cycling';
        const label = `${format(event.date, 'yyyy-MM-dd')}-${sanitizeLabel(event.title || 'session')}`;
        exportWorkoutFit(fitText, athlete?.icu_ftp || null, sportType, label);
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
                if (!workoutBlocks.length && durationRaw > 0 && /^Z[1-7]$/i.test(zoneRaw)) {
                    workoutBlocks = [{ label: 'Main Block', durationMin: durationRaw, zone: zoneRaw }];
                }
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="calendar-view-switch">
                        <button className={`btn ${viewMode === 'week' ? 'btn-primary' : ''}`} onClick={() => setViewMode('week')}>Week</button>
                        <button className={`btn ${viewMode === 'month' ? 'btn-primary' : ''}`} onClick={() => setViewMode('month')}>Month</button>
                        <button className={`btn ${viewMode === 'year' ? 'btn-primary' : ''}`} onClick={() => setViewMode('year')}>Year</button>
                    </div>
                    <button className="btn" onClick={movePrev}>Prev</button>
                    <button className="btn" onClick={moveToday}>Today</button>
                    <button className="btn" onClick={moveNext}>Next</button>
                </div>
            </div>

            <div className="calendar-layout">
                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">{periodLabel}</span>
                        <span className="card-badge">{futureEvents.length} future events</span>
                    </div>

                    {viewMode !== 'year' && (
                        <div className="calendar-weekdays">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                <div key={day} className="calendar-weekday">{day}</div>
                            ))}
                        </div>
                    )}

                    {viewMode === 'month' && (
                        <div className="calendar-grid">
                            {days.map(day => {
                                const dayKey = format(day, 'yyyy-MM-dd');
                                const entries = byDay.get(dayKey) || [];
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
                                    >
                                        <div className="calendar-day-num">{format(day, 'd')}</div>
                                        <div className="calendar-day-events">
                                            {entries.slice(0, 2).map(entry => (
                                                <div key={entry.id} className={`calendar-pill calendar-pill-${entry.kind}`} title={entry.title}>
                                                    {entry.title}
                                                </div>
                                            ))}
                                            {entries.length > 2 && <div className="calendar-more">+{entries.length - 2} more</div>}
                                            {entries.length === 0 && <div className="calendar-drop-hint">Drop workout</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {viewMode === 'week' && (
                        <div className="calendar-grid">
                            {weekDays.map(day => {
                                const dayKey = format(day, 'yyyy-MM-dd');
                                const entries = byDayAll.get(dayKey) || [];
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
                                    >
                                        <div className="calendar-day-num">{format(day, 'EEE d')}</div>
                                        <div className="calendar-day-events">
                                            {entries.slice(0, 5).map(entry => (
                                                <div key={entry.id} className={`calendar-pill calendar-pill-${entry.kind}`} title={entry.title}>
                                                    {entry.title}
                                                </div>
                                            ))}
                                            {entries.length > 5 && <div className="calendar-more">+{entries.length - 5} more</div>}
                                            {entries.length === 0 && <div className="calendar-drop-hint">Drop workout</div>}
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
                                    <div className="calendar-year-title">{format(m.monthDate, 'MMM')}</div>
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

                <div className="card" style={{ marginBottom: 0 }}>
                    <div className="card-header">
                        <span className="card-title">Upcoming</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span className="card-badge">Next {upcoming.length}</span>
                            <button className="planner-toggle" onClick={() => toggleSection('upcoming')}>
                                <span>{collapsed.upcoming ? 'Show' : 'Hide'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="planner-section">
                        <button className="planner-toggle" onClick={() => toggleSection('builder')}>
                            <span>Workout Builder</span>
                            <span>{collapsed.builder ? '+' : '-'}</span>
                        </button>
                        {!collapsed.builder && <WorkoutBuilder onCreate={onAddPlannedEvent} ftp={athlete?.icu_ftp || null} />}
                    </div>

                    <div className="planner-section">
                        <button className="planner-toggle" onClick={() => toggleSection('manual')}>
                            <span>Quick Manual Entry</span>
                            <span>{collapsed.manual ? '+' : '-'}</span>
                        </button>
                        {!collapsed.manual && <div className="calendar-planner-box">
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
                        </div>}
                    </div>

                    <div className="planner-section">
                        <button className="planner-toggle" onClick={() => toggleSection('library')}>
                            <span>Training Library (Drag & Drop)</span>
                            <span>{collapsed.library ? '+' : '-'}</span>
                        </button>
                        {!collapsed.library && <div className="calendar-planner-box">
                            <div className="card-title" style={{ marginBottom: 8 }}>Training Library</div>
                            <div className="calendar-library-list">
                                {LIBRARY_WORKOUTS.map((workout, idx) => (
                                    <div
                                        key={workout.title}
                                        className="library-workout-card"
                                        draggable
                                        onDragStart={handleDragStart(workout)}
                                        title="Drag this workout to a calendar day"
                                    >
                                        <div className="library-workout-head">
                                            <div className="library-workout-title">{workout.title}</div>
                                            <button className="btn" onClick={() => addLibraryWorkout(workout, idx + 1)}>+ Quick Add</button>
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
                            <div className="calendar-helper">Drag any library card onto a day in the calendar to schedule it.</div>
                        </div>}
                    </div>

                    <div className="planner-section">
                        <button className="planner-toggle" onClick={() => toggleSection('ai')}>
                            <span>Generate From AI</span>
                            <span>{collapsed.ai ? '+' : '-'}</span>
                        </button>
                        {!collapsed.ai && <div className="calendar-planner-box">
                            <div className="card-title" style={{ marginBottom: 8 }}>Generate From AI</div>
                            <input className="form-input calendar-form-input" placeholder="Objective (race prep, FTP build, etc.)" value={aiObjective} onChange={e => setAiObjective(e.target.value)} />
                            <div className="calendar-form-row">
                                <input className="form-input calendar-form-input" type="number" min="3" max="21" value={aiDays} onChange={e => setAiDays(e.target.value)} />
                                <button className="btn btn-primary" disabled={isGenerating} onClick={handleGenerateAi}>
                                    {isGenerating ? 'Generating...' : 'Generate Plan'}
                                </button>
                            </div>
                            <div className="calendar-helper">AI creates a JSON micro-cycle and inserts sessions directly into your calendar.</div>
                        </div>}
                    </div>

                    <div className="planner-section">
                        <button className="planner-toggle" onClick={() => toggleSection('csv')}>
                            <span>Import CSV Plan</span>
                            <span>{collapsed.csv ? '+' : '-'}</span>
                        </button>
                        {!collapsed.csv && <div className="calendar-planner-box">
                            <div className="card-title" style={{ marginBottom: 8 }}>Import CSV Plan</div>
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
                                                <div className="calendar-upcoming-date">{format(session.date, 'EEE dd MMM yyyy')}</div>
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
                                {isImportingCsv ? 'Importing...' : 'Choose CSV'}
                            </button>
                        </div>}
                    </div>

                    {plannerError && (
                        <div className="error-banner" style={{ marginBottom: 12 }}>
                            <span className="error-tag">[ERR]</span>
                            {plannerError}
                        </div>
                    )}

                    {!collapsed.upcoming && (loading && upcoming.length === 0 ? (
                        <div className="loading-state" style={{ padding: '24px 8px' }}>
                            <div className="loading-spinner" />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading planned events...</span>
                        </div>
                    ) : upcoming.length === 0 ? (
                        <div className="info-banner" style={{ marginBottom: 0 }}>
                            No future events found. Add planned workouts or race objectives in Intervals.icu events.
                            {csvImportSummary?.imported > 0 && (
                                <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                    CSV import succeeded, but imported dates may be in the past relative to today.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="calendar-upcoming-list">
                            {upcoming.map(event => (
                                <div key={event.id} className="calendar-upcoming-item">
                                    <div>
                                        <div className="calendar-upcoming-date">{format(event.date, 'EEE dd MMM yyyy')}</div>
                                        <div className="calendar-upcoming-title">{event.title}</div>
                                        <WorkoutBlocksGraph blocks={event.workoutBlocks} />
                                    </div>
                                    <div className="calendar-upcoming-actions">
                                        <span className={`calendar-kind-badge calendar-kind-${event.kind}`}>{kindLabel(event.kind)}</span>
                                        {eventHasWorkoutData(event) && (
                                            <button className="calendar-fit-btn" onClick={() => downloadEventFit(event)}>
                                                Download FIT
                                            </button>
                                        )}
                                        {String(event.id).startsWith('local_') && (
                                            <button className="calendar-remove-btn" onClick={() => onRemovePlannedEvent(event.id)}>
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
