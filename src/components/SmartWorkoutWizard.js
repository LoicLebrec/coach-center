import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { exportWorkoutFitFromBlocks } from '../services/workout-exporter';
import { buildRuleBasedWorkout as _buildRuleBasedWorkout } from '../services/workout-rules';

const ZONE_COLORS = {
    Z1: '#475569', Z2: '#22c55e', Z3: '#eab308',
    Z4: '#f97316', Z5: '#ef4444', Z6: '#a855f7', Z7: '#ec4899',
};
const ZONE_LABELS = {
    Z1: 'Recovery', Z2: 'Endurance', Z3: 'Tempo',
    Z4: 'Threshold', Z5: 'VO2 Max', Z6: 'Anaerobic', Z7: 'Sprint',
};
const ZONE_PCT = {
    Z1: [45, 55], Z2: [56, 75], Z3: [76, 90],
    Z4: [91, 105], Z5: [106, 120], Z6: [121, 150], Z7: [151, 200],
};

const TRAINING_TYPES = [
    { id: 'vo2', label: 'VO2 Max', icon: '⚡', desc: 'High intensity repeats. Push your ceiling.', zone: 'Z5', color: '#ef4444' },
    { id: 'threshold', label: 'Threshold', icon: '🔥', desc: 'Sustained hard effort. Raise your FTP.', zone: 'Z4', color: '#f97316' },
    { id: 'sweetspot', label: 'Sweet Spot', icon: '🎯', desc: 'Best bang for buck. High aerobic stress.', zone: 'Z3', color: '#eab308' },
    { id: 'endurance', label: 'Z2 Endurance', icon: '🌊', desc: 'Aerobic base. Long and steady fat burning.', zone: 'Z2', color: '#22c55e' },
    { id: 'openers', label: 'Openers', icon: '💥', desc: 'Pre-race activation. Short and sharp.', zone: 'Z4', color: '#06b6d4' },
    { id: 'recovery', label: 'Recovery', icon: '💤', desc: 'Easy flush. Protect your legs.', zone: 'Z1', color: '#475569' },
];

const TIME_OPTIONS = [
    { id: '30', label: '30 min', minutes: 30 },
    { id: '45', label: '45 min', minutes: 45 },
    { id: '60', label: '1 hour', minutes: 60 },
    { id: '75', label: '1h15', minutes: 75 },
    { id: '90', label: '1h30', minutes: 90 },
    { id: '120', label: '2 hours', minutes: 120 },
    { id: '150', label: '2h30', minutes: 150 },
    { id: '180', label: '3 hours', minutes: 180 },
];

const FEEL_OPTIONS = [
    { id: 'fresh', label: 'Fresh', desc: 'Ready to push hard', icon: '🟢' },
    { id: 'normal', label: 'Normal', desc: 'Standard training day', icon: '🟡' },
    { id: 'tired', label: 'Tired', desc: 'Carrying fatigue, stay smart', icon: '🔴' },
];

function buildRuleBasedWorkout(type, minutes, feel, ftp, nextRaceDays) {
    return _buildRuleBasedWorkout(type, minutes, feel, ftp, nextRaceDays);
}

function WorkoutVisual({ blocks, ftp }) {
    if (!blocks?.length) return null;
    const total = Math.max(1, blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0));

    return (
        <div>
            {/* Power profile bar */}
            <div style={{ display: 'flex', height: 48, borderRadius: 8, overflow: 'hidden', marginBottom: 12, gap: 2 }}>
                {blocks.map((b, i) => {
                    const pct = ((Number(b.durationMin) || 0) / total) * 100;
                    const zId = String(b.zone || 'Z2').toUpperCase();
                    const color = ZONE_COLORS[zId] || ZONE_COLORS.Z2;
                    const zonePct = ZONE_PCT[zId] || ZONE_PCT.Z2;
                    const barHeight = Math.round(((zonePct[0] + zonePct[1]) / 2) / 2); // relative height
                    return (
                        <div
                            key={i}
                            style={{
                                width: `${Math.max(2, pct)}%`,
                                display: 'flex',
                                alignItems: 'flex-end',
                                justifyContent: 'center',
                            }}
                            title={`${b.label} — ${b.durationMin}min @ ${zId}`}
                        >
                            <div style={{
                                width: '100%',
                                height: `${Math.max(20, barHeight)}%`,
                                background: color,
                                opacity: 0.85,
                                borderRadius: '3px 3px 0 0',
                            }} />
                        </div>
                    );
                })}
            </div>

            {/* Block list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {blocks.map((b, i) => {
                    const zId = String(b.zone || 'Z2').toUpperCase();
                    const color = ZONE_COLORS[zId] || ZONE_COLORS.Z2;
                    const pct = ZONE_PCT[zId] || ZONE_PCT.Z2;
                    const loW = ftp ? Math.round((pct[0] / 100) * ftp) : null;
                    const hiW = ftp ? Math.round((pct[1] / 100) * ftp) : null;
                    return (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', background: 'var(--bg-2)',
                            borderRadius: 6, borderLeft: `3px solid ${color}`,
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>{b.label}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                                    {zId} · {ZONE_LABELS[zId]} · {pct[0]}–{pct[1]}% FTP
                                    {loW && ` · ${loW}–${hiW}W`}
                                </div>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color }}>
                                {b.durationMin}min
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Total */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 10, padding: '8px 12px',
                background: 'var(--bg-3)', borderRadius: 6,
                fontFamily: 'var(--font-mono)', fontSize: 12,
            }}>
                <span style={{ color: 'var(--text-3)' }}>TOTAL DURATION</span>
                <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{total} min</span>
            </div>
        </div>
    );
}

export default function SmartWorkoutWizard({ athlete, events, plannedEvents, onAddToCalendar, onGenerateWithAi, initialDate }) {
    const [step, setStep] = useState(0); // 0=type, 1=duration, 2=context, 3=preview
    const [trainingType, setTrainingType] = useState(null);
    const [duration, setDuration] = useState(60);
    const [feel, setFeel] = useState('normal');
    const [indoor, setIndoor] = useState(true);
    const [customNotes, setCustomNotes] = useState('');
    const [generatedWorkout, setGeneratedWorkout] = useState(null);
    const [isBuilding, setIsBuilding] = useState(false);
    const [savedMsg, setSavedMsg] = useState('');
    const [workoutDate, setWorkoutDate] = useState(initialDate || format(new Date(), 'yyyy-MM-dd'));
    const [aiError, setAiError] = useState('');

    // ── Manual mode state ──────────────────────────────────────────
    const [mode, setMode] = useState('wizard'); // 'wizard' | 'manual'
    const [manualTitle, setManualTitle] = useState('My Workout');
    const [manualSport, setManualSport] = useState('Ride');
    const [manualObjective, setManualObjective] = useState('');
    const [manualDate, setManualDate] = useState(initialDate || format(new Date(), 'yyyy-MM-dd'));
    const [manualBlocks, setManualBlocks] = useState([
        { id: 'm1', label: 'Warmup', durationMin: 15, zone: 'Z2' },
        { id: 'm2', label: 'Main Set', durationMin: 30, zone: 'Z3' },
        { id: 'm3', label: 'Cool-down', durationMin: 10, zone: 'Z1' },
    ]);
    const [manualSavedMsg, setManualSavedMsg] = useState('');

    const addManualBlock = () => setManualBlocks(prev => [...prev, {
        id: `m${Date.now()}`, label: 'Block', durationMin: 10, zone: 'Z2',
    }]);

    const removeManualBlock = (id) => setManualBlocks(prev => prev.filter(b => b.id !== id));

    const updateManualBlock = (id, field, value) =>
        setManualBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));

    const moveManualBlock = (id, dir) => setManualBlocks(prev => {
        const i = prev.findIndex(b => b.id === id);
        if (i < 0) return prev;
        const j = i + dir;
        if (j < 0 || j >= prev.length) return prev;
        const copy = [...prev];
        [copy[i], copy[j]] = [copy[j], copy[i]];
        return copy;
    });

    const applyManualPreset = (type) => {
        const presets = {
            warmupOnly: [{ id: `p${Date.now()}1`, label: 'Warmup', durationMin: 15, zone: 'Z2' }],
            endurance: [
                { id: `p${Date.now()}1`, label: 'Warmup', durationMin: 15, zone: 'Z2' },
                { id: `p${Date.now()}2`, label: 'Aerobic Base', durationMin: 60, zone: 'Z2' },
                { id: `p${Date.now()}3`, label: 'Cool-down', durationMin: 10, zone: 'Z1' },
            ],
            sweetspot: [
                { id: `p${Date.now()}1`, label: 'Warmup', durationMin: 15, zone: 'Z2' },
                { id: `p${Date.now()}2`, label: 'Sweet Spot #1', durationMin: 12, zone: 'Z3' },
                { id: `p${Date.now()}3`, label: 'Recovery', durationMin: 5, zone: 'Z1' },
                { id: `p${Date.now()}4`, label: 'Sweet Spot #2', durationMin: 12, zone: 'Z3' },
                { id: `p${Date.now()}5`, label: 'Recovery', durationMin: 5, zone: 'Z1' },
                { id: `p${Date.now()}6`, label: 'Sweet Spot #3', durationMin: 12, zone: 'Z3' },
                { id: `p${Date.now()}7`, label: 'Cool-down', durationMin: 10, zone: 'Z1' },
            ],
            threshold: [
                { id: `p${Date.now()}1`, label: 'Warmup', durationMin: 15, zone: 'Z2' },
                { id: `p${Date.now()}2`, label: 'Threshold #1', durationMin: 20, zone: 'Z4' },
                { id: `p${Date.now()}3`, label: 'Recovery', durationMin: 5, zone: 'Z1' },
                { id: `p${Date.now()}4`, label: 'Threshold #2', durationMin: 20, zone: 'Z4' },
                { id: `p${Date.now()}5`, label: 'Cool-down', durationMin: 10, zone: 'Z1' },
            ],
            vo2: [
                { id: `p${Date.now()}1`, label: 'Warmup', durationMin: 15, zone: 'Z2' },
                { id: `p${Date.now()}2`, label: 'Openers', durationMin: 3, zone: 'Z4' },
                { id: `p${Date.now()}3`, label: 'VO2 Rep #1', durationMin: 5, zone: 'Z5' },
                { id: `p${Date.now()}4`, label: 'Recovery', durationMin: 5, zone: 'Z1' },
                { id: `p${Date.now()}5`, label: 'VO2 Rep #2', durationMin: 5, zone: 'Z5' },
                { id: `p${Date.now()}6`, label: 'Recovery', durationMin: 5, zone: 'Z1' },
                { id: `p${Date.now()}7`, label: 'VO2 Rep #3', durationMin: 5, zone: 'Z5' },
                { id: `p${Date.now()}8`, label: 'Recovery', durationMin: 5, zone: 'Z1' },
                { id: `p${Date.now()}9`, label: 'VO2 Rep #4', durationMin: 5, zone: 'Z5' },
                { id: `p${Date.now()}10`, label: 'Cool-down', durationMin: 10, zone: 'Z1' },
            ],
        };
        if (presets[type]) setManualBlocks(presets[type]);
    };

    const handleManualDownloadFit = () => {
        if (!manualBlocks.length) return;
        const sport = /run/i.test(manualSport) ? 'running' : 'cycling';
        exportWorkoutFitFromBlocks(manualBlocks, ftp, sport, manualDate);
    };

    const handleManualSaveToCalendar = async () => {
        if (!onAddToCalendar || !manualBlocks.length) return;
        const notes = [
            manualObjective ? `Objective: ${manualObjective}` : '',
            '',
            'Workout Steps:',
            ...manualBlocks.map((b, i) => `${i + 1}. ${b.label} — ${b.durationMin} min @ ${b.zone}`),
        ].filter((l, i) => i !== 1 || manualObjective).join('\n');

        await onAddToCalendar({
            title: manualTitle || 'Custom Workout',
            name: manualTitle || 'Custom Workout',
            type: manualSport,
            event_type: manualSport,
            kind: 'training',
            notes,
            source: 'manual-builder',
            start_date_local: `${manualDate}T07:00:00`,
            workoutBlocks: manualBlocks,
        });
        setManualSavedMsg('Saved to calendar.');
        setTimeout(() => setManualSavedMsg(''), 2500);
    };

    const manualTotalMin = manualBlocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0);

    const ftp = athlete?.icu_ftp || athlete?.ftp || athlete?.ftp_watts || athlete?.critical_power || null;
    const weight = athlete?.icu_weight || athlete?.weight || null;
    const wkg = ftp && weight ? (ftp / weight).toFixed(2) : null;

    const nextRaceDays = useMemo(() => {
        const allEvents = [...(events || []), ...(plannedEvents || [])];
        const now = new Date();
        const raceDays = allEvents
            .filter(e => {
                const txt = `${e?.name || e?.title || ''} ${e?.type || ''} ${e?.kind || ''}`.toLowerCase();
                return /race|competition|crit|event/i.test(txt);
            })
            .map(e => {
                const raw = e?.start_date_local || e?.start_date || e?.date || e?.event_date;
                if (!raw) return null;
                const d = new Date(String(raw).slice(0, 10));
                const diff = Math.ceil((d - now) / 86400000);
                return diff >= 0 ? diff : null;
            })
            .filter(d => d != null)
            .sort((a, b) => a - b);
        return raceDays[0] ?? null;
    }, [events, plannedEvents]);

    const nextRaceEvent = useMemo(() => {
        const allEvents = [...(events || []), ...(plannedEvents || [])];
        const now = new Date();
        const races = allEvents
            .filter(e => {
                const txt = `${e?.name || e?.title || ''} ${e?.type || ''} ${e?.kind || ''}`.toLowerCase();
                return /race|competition|crit|event/i.test(txt);
            })
            .filter(e => {
                const raw = e?.start_date_local || e?.start_date || e?.date || e?.event_date;
                if (!raw) return false;
                const d = new Date(String(raw).slice(0, 10));
                return d >= now;
            })
            .sort((a, b) => {
                const da = new Date(String(a.start_date_local || a.start_date || a.date || a.event_date).slice(0, 10));
                const db = new Date(String(b.start_date_local || b.start_date || b.date || b.event_date).slice(0, 10));
                return da - db;
            });
        return races[0] || null;
    }, [events, plannedEvents]);

    const raceWarning = nextRaceDays != null && nextRaceDays <= 7
        ? `Race in ${nextRaceDays}d — workout intensity has been adjusted.`
        : null;

    const handleBuild = async () => {
        setIsBuilding(true);
        setAiError('');
        setSavedMsg('');

        // Try AI first if available
        if (typeof onGenerateWithAi === 'function') {
            try {
                const typeLabel = TRAINING_TYPES.find(t => t.id === trainingType)?.label || trainingType;
                const raceLine = nextRaceDays != null ? `Next race in ${nextRaceDays} days — taper accordingly.` : '';
                const prompt = [
                    `Build a structured cycling workout for ${typeLabel} training.`,
                    `Total duration: ${duration} minutes.`,
                    `Athlete feel today: ${feel}.`,
                    `Environment: ${indoor ? 'indoor trainer' : 'outdoor road'}.`,
                    raceLine,
                    ftp ? `FTP: ${ftp}W.` : '',
                    customNotes ? `Additional context: ${customNotes}` : '',
                    'Return structured blocks with label, durationMin, and zone (Z1-Z7).',
                ].filter(Boolean).join(' ');

                const result = await onGenerateWithAi({ description: prompt, sport: 'Ride' });
                if (result?.blocks?.length >= 2) {
                    setGeneratedWorkout({ ...result, _aiGenerated: true });
                    setStep(3);
                    setIsBuilding(false);
                    return;
                }
            } catch (err) {
                setAiError('AI unavailable, using rule-based builder.');
            }
        }

        // Rule-based fallback
        const workout = buildRuleBasedWorkout(trainingType, duration, feel, ftp, nextRaceDays);
        setGeneratedWorkout(workout);
        setStep(3);
        setIsBuilding(false);
    };

    const handleDownloadFit = () => {
        if (!generatedWorkout?.blocks?.length) return;
        const sport = /run/i.test(String(generatedWorkout.sport || '')) ? 'running' : 'cycling';
        const dateLabel = workoutDate || format(new Date(), 'yyyy-MM-dd');
        exportWorkoutFitFromBlocks(generatedWorkout.blocks, ftp, sport, dateLabel);
    };

    const handleSaveToCalendar = async () => {
        if (!onAddToCalendar || !generatedWorkout) return;
        const notes = [
            `Objective: ${generatedWorkout.objective}`,
            '',
            'Workout Steps:',
            ...(generatedWorkout.blocks || []).map((b, i) => `${i + 1}. ${b.label} — ${b.durationMin} min @ ${b.zone}`),
        ].join('\n');

        await onAddToCalendar({
            title: generatedWorkout.title,
            name: generatedWorkout.title,
            type: generatedWorkout.sport || 'Ride',
            event_type: generatedWorkout.sport || 'Ride',
            kind: 'training',
            notes,
            source: 'smart-wizard',
            start_date_local: `${workoutDate}T07:00:00`,
            workoutBlocks: generatedWorkout.blocks,
        });
        setSavedMsg('Saved to calendar.');
    };

    const totalMin = generatedWorkout?.blocks?.reduce((s, b) => s + (Number(b.durationMin) || 0), 0) ?? 0;

    const stepLabel = ['Select Training', 'Duration', 'Context', 'Your Workout'][step];

    const cardStyle = {
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        maxWidth: 680,
        margin: '0 auto',
    };

    const selCardStyle = (selected, color) => ({
        padding: '14px 16px',
        borderRadius: 8,
        border: `2px solid ${selected ? (color || 'var(--accent-cyan)') : 'var(--border)'}`,
        background: selected ? `${color || 'var(--accent-cyan)'}18` : 'var(--bg-2)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease',
        outline: 'none',
    });

    return (
        <div>
            <div className="page-header">
                <div className="page-title">Workout Builder</div>
                <div className="page-subtitle">
                    {ftp ? `FTP: ${ftp}W${wkg ? ` · ${wkg} W/kg` : ''}` : 'Set FTP in Athlete Profile for watt targets'}
                    {nextRaceDays != null && (
                        <span style={{ marginLeft: 16, color: nextRaceDays <= 7 ? 'var(--accent-red)' : 'var(--accent-yellow)' }}>
                            · Next race: {nextRaceDays === 0 ? 'today' : `${nextRaceDays}d`}
                            {nextRaceEvent ? ` — ${nextRaceEvent.name || nextRaceEvent.title || ''}` : ''}
                        </span>
                    )}
                </div>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 4, maxWidth: 680, margin: '0 auto 20px', padding: 4, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10 }}>
                {[
                    { id: 'wizard', label: 'Smart Build', desc: 'Step-by-step guided' },
                    { id: 'manual', label: 'Manual Build', desc: 'Build block by block' },
                ].map(m => (
                    <button
                        key={m.id}
                        onClick={() => { setMode(m.id); setSavedMsg(''); setManualSavedMsg(''); }}
                        style={{
                            flex: 1, padding: '10px 14px', borderRadius: 7,
                            border: 'none', cursor: 'pointer',
                            background: mode === m.id ? 'var(--bg-3)' : 'transparent',
                            color: mode === m.id ? 'var(--text-0)' : 'var(--text-3)',
                            transition: 'all 0.15s',
                            textAlign: 'center',
                        }}
                    >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{m.desc}</div>
                    </button>
                ))}
            </div>

            {mode === 'wizard' && (<>
            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
                {['Type', 'Duration', 'Context', 'Preview'].map((s, i) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                            background: i === step ? 'var(--accent-cyan)' : i < step ? 'rgba(6,182,212,0.3)' : 'var(--bg-3)',
                            color: i <= step ? 'var(--text-0)' : 'var(--text-3)',
                            border: `1px solid ${i === step ? 'var(--accent-cyan)' : 'var(--border)'}`,
                            cursor: i < step ? 'pointer' : 'default',
                        }} onClick={() => i < step && setStep(i)}>
                            {i < step ? '✓' : i + 1}
                        </div>
                        <span style={{ fontSize: 12, color: i === step ? 'var(--text-0)' : 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{s}</span>
                        {i < 3 && <div style={{ width: 24, height: 1, background: 'var(--border)' }} />}
                    </div>
                ))}
            </div>

            <div style={cardStyle}>

                {/* STEP 0: Training Type */}
                {step === 0 && (
                    <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 16 }}>
                            WHAT DO YOU WANT TO TRAIN TODAY?
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                            {TRAINING_TYPES.map(t => (
                                <button
                                    key={t.id}
                                    style={selCardStyle(trainingType === t.id, t.color)}
                                    onClick={() => { setTrainingType(t.id); setStep(1); }}
                                >
                                    <div style={{ fontSize: 20, marginBottom: 6 }}>{t.icon}</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: trainingType === t.id ? t.color : 'var(--text-0)', marginBottom: 4 }}>
                                        {t.label}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{t.desc}</div>
                                    <div style={{
                                        marginTop: 10, display: 'inline-block',
                                        padding: '2px 8px', borderRadius: 4,
                                        background: `${t.color}22`,
                                        color: t.color,
                                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                                    }}>
                                        {t.zone}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 1: Duration */}
                {step === 1 && (
                    <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 8 }}>
                            HOW MUCH TIME DO YOU HAVE?
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>
                            Training type: <span style={{ color: TRAINING_TYPES.find(t => t.id === trainingType)?.color || 'var(--accent-cyan)', fontWeight: 600 }}>
                                {TRAINING_TYPES.find(t => t.id === trainingType)?.label}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                            {TIME_OPTIONS.map(opt => (
                                <button
                                    key={opt.id}
                                    style={selCardStyle(duration === opt.minutes)}
                                    onClick={() => setDuration(opt.minutes)}
                                >
                                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: duration === opt.minutes ? 'var(--accent-cyan)' : 'var(--text-0)' }}>
                                        {opt.label}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => setStep(0)}>Back</button>
                            <button className="btn btn-primary" onClick={() => setStep(2)}>Next →</button>
                        </div>
                    </div>
                )}

                {/* STEP 2: Context */}
                {step === 2 && (
                    <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 16 }}>
                            TELL ME MORE ABOUT TODAY
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, fontWeight: 600 }}>How do you feel?</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                {FEEL_OPTIONS.map(opt => (
                                    <button
                                        key={opt.id}
                                        style={selCardStyle(feel === opt.id)}
                                        onClick={() => setFeel(opt.id)}
                                    >
                                        <div style={{ fontSize: 18, marginBottom: 6 }}>{opt.icon}</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: feel === opt.id ? 'var(--accent-cyan)' : 'var(--text-0)', marginBottom: 2 }}>{opt.label}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, fontWeight: 600 }}>Environment</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <button style={selCardStyle(indoor)} onClick={() => setIndoor(true)}>
                                    <div style={{ fontSize: 20, marginBottom: 4 }}>🏠</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: indoor ? 'var(--accent-cyan)' : 'var(--text-0)' }}>Indoor</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Trainer / Zwift</div>
                                </button>
                                <button style={selCardStyle(!indoor)} onClick={() => setIndoor(false)}>
                                    <div style={{ fontSize: 20, marginBottom: 4 }}>🚴</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: !indoor ? 'var(--accent-cyan)' : 'var(--text-0)' }}>Outdoor</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Road / Gravel</div>
                                </button>
                            </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600 }}>Workout date</div>
                            <input
                                type="date"
                                className="form-input"
                                value={workoutDate}
                                onChange={e => setWorkoutDate(e.target.value)}
                                style={{ width: '100%', maxWidth: 220 }}
                            />
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600 }}>Any constraints or notes? (optional)</div>
                            <textarea
                                className="form-input"
                                rows={2}
                                placeholder="e.g. knee issue, avoid sprinting, target specific race prep..."
                                value={customNotes}
                                onChange={e => setCustomNotes(e.target.value)}
                                style={{ width: '100%', resize: 'vertical' }}
                            />
                        </div>

                        {raceWarning && (
                            <div style={{
                                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                                fontSize: 12, color: '#ef4444',
                            }}>
                                ⚠ {raceWarning}
                            </div>
                        )}

                        {aiError && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12, fontStyle: 'italic' }}>
                                {aiError}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={() => setStep(1)}>Back</button>
                            <button
                                className="btn btn-primary"
                                disabled={isBuilding}
                                onClick={handleBuild}
                                style={{ minWidth: 140 }}
                            >
                                {isBuilding ? 'Building workout...' : 'Build My Workout →'}
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: Preview + Download */}
                {step === 3 && generatedWorkout && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-0)', marginBottom: 4 }}>
                                    {generatedWorkout.title}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                                    {generatedWorkout.objective}
                                </div>
                                {generatedWorkout._aiGenerated && (
                                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                                        ✦ AI GENERATED
                                    </div>
                                )}
                            </div>
                            <button className="btn" onClick={() => { setStep(2); setGeneratedWorkout(null); }} style={{ flexShrink: 0 }}>
                                Rebuild
                            </button>
                        </div>

                        {raceWarning && (
                            <div style={{
                                padding: '8px 14px', borderRadius: 8, marginBottom: 16,
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                                fontSize: 12, color: '#ef4444',
                            }}>
                                ⚠ {raceWarning}
                            </div>
                        )}

                        <WorkoutVisual blocks={generatedWorkout.blocks} ftp={ftp} />

                        <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
                            <button
                                className="btn btn-primary"
                                onClick={handleDownloadFit}
                                style={{ flex: '1 1 auto', minWidth: 180, fontSize: 14, padding: '12px 20px' }}
                            >
                                Download .FIT for Garmin
                            </button>
                            {typeof onAddToCalendar === 'function' && (
                                <button
                                    className="btn"
                                    onClick={handleSaveToCalendar}
                                    style={{ flex: '1 1 auto', minWidth: 160, fontSize: 14, padding: '12px 20px' }}
                                >
                                    Save to Calendar
                                </button>
                            )}
                            <button
                                className="btn"
                                onClick={() => { setStep(0); setTrainingType(null); setGeneratedWorkout(null); setSavedMsg(''); setAiError(''); }}
                                style={{ fontSize: 14, padding: '12px 16px' }}
                            >
                                New Workout
                            </button>
                        </div>

                        {savedMsg && (
                            <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 13, color: 'var(--accent-green)' }}>
                                {savedMsg}
                            </div>
                        )}

                        {!ftp && (
                            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                                Set your FTP in Athlete Profile to get watt targets in the .FIT file.
                            </div>
                        )}
                    </div>
                )}
            </div>
            </>)}

            {/* ── MANUAL BUILD MODE ── */}
            {mode === 'manual' && (
                <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, maxWidth: 680, margin: '0 auto' }}>
                    {/* Header row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 10, marginBottom: 14 }}>
                        <input
                            className="form-input"
                            placeholder="Workout title"
                            value={manualTitle}
                            onChange={e => setManualTitle(e.target.value)}
                            style={{ fontWeight: 600, fontSize: 14 }}
                        />
                        <select className="form-input" value={manualSport} onChange={e => setManualSport(e.target.value)}>
                            <option value="Ride">Ride</option>
                            <option value="Run">Run</option>
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <input type="date" className="form-input" value={manualDate} onChange={e => setManualDate(e.target.value)} />
                        <input className="form-input" placeholder="Objective (optional)" value={manualObjective} onChange={e => setManualObjective(e.target.value)} />
                    </div>

                    {/* Presets */}
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 8 }}>QUICK PRESETS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                        {[
                            { id: 'endurance', label: 'Z2 Endurance', color: '#22c55e' },
                            { id: 'sweetspot', label: 'Sweet Spot', color: '#eab308' },
                            { id: 'threshold', label: 'Threshold', color: '#f97316' },
                            { id: 'vo2', label: 'VO2 Max', color: '#ef4444' },
                        ].map(p => (
                            <button
                                key={p.id}
                                onClick={() => applyManualPreset(p.id)}
                                style={{
                                    padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                                    border: `1px solid ${p.color}44`, background: `${p.color}18`,
                                    color: p.color, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {/* Block list */}
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 8 }}>WORKOUT BLOCKS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                        {manualBlocks.map((b, i) => {
                            const zColor = ZONE_COLORS[b.zone] || '#475569';
                            const pct = ZONE_PCT[b.zone] || [56, 75];
                            const loW = ftp ? Math.round((pct[0] / 100) * ftp) : null;
                            const hiW = ftp ? Math.round((pct[1] / 100) * ftp) : null;
                            return (
                                <div key={b.id} style={{
                                    display: 'grid', gridTemplateColumns: '1fr 72px 110px auto',
                                    gap: 6, alignItems: 'center',
                                    padding: '10px 12px',
                                    background: 'var(--bg-2)', borderRadius: 8,
                                    borderLeft: `3px solid ${zColor}`,
                                }}>
                                    <input
                                        className="form-input"
                                        value={b.label}
                                        onChange={e => updateManualBlock(b.id, 'label', e.target.value)}
                                        placeholder="Label"
                                        style={{ fontSize: 13 }}
                                    />
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            className="form-input"
                                            type="number"
                                            min="1"
                                            value={b.durationMin}
                                            onChange={e => updateManualBlock(b.id, 'durationMin', Number(e.target.value))}
                                            style={{ fontFamily: 'var(--font-mono)', fontSize: 13, paddingRight: 28 }}
                                        />
                                        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-3)', pointerEvents: 'none' }}>min</span>
                                    </div>
                                    <select
                                        className="form-input"
                                        value={b.zone}
                                        onChange={e => updateManualBlock(b.id, 'zone', e.target.value)}
                                        style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: zColor }}
                                    >
                                        {Object.entries(ZONE_LABELS).map(([z, name]) => (
                                            <option key={z} value={z}>{z} – {name}</option>
                                        ))}
                                    </select>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => moveManualBlock(b.id, -1)} disabled={i === 0} style={{ padding: '4px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}>↑</button>
                                        <button onClick={() => moveManualBlock(b.id, 1)} disabled={i === manualBlocks.length - 1} style={{ padding: '4px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}>↓</button>
                                        <button onClick={() => removeManualBlock(b.id)} style={{ padding: '4px 7px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>✕</button>
                                    </div>
                                    {loW && (
                                        <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--font-mono)', fontSize: 10, color: zColor, opacity: 0.7, paddingLeft: 4 }}>
                                            {pct[0]}–{pct[1]}% FTP · {loW}–{hiW}W
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <button
                        onClick={addManualBlock}
                        style={{
                            width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed var(--border)',
                            background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13,
                            marginBottom: 20, transition: 'all 0.15s',
                        }}
                    >
                        + Add Block
                    </button>

                    {/* Live preview */}
                    {manualBlocks.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 10 }}>WORKOUT PREVIEW</div>
                            <WorkoutVisual blocks={manualBlocks} ftp={ftp} />
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-primary"
                            onClick={handleManualDownloadFit}
                            disabled={!manualBlocks.length}
                            style={{ flex: '1 1 auto', minWidth: 180, fontSize: 14, padding: '12px 20px' }}
                        >
                            Download .FIT for Garmin
                        </button>
                        {typeof onAddToCalendar === 'function' && (
                            <button
                                className="btn"
                                onClick={handleManualSaveToCalendar}
                                disabled={!manualBlocks.length}
                                style={{ flex: '1 1 auto', minWidth: 160, fontSize: 14, padding: '12px 20px' }}
                            >
                                Save to Calendar
                            </button>
                        )}
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                            Total: <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{manualTotalMin} min</span>
                            {ftp && <span> · FTP: <span style={{ color: 'var(--accent-blue)' }}>{ftp}W</span></span>}
                        </div>
                        {manualSavedMsg && (
                            <div style={{ fontSize: 13, color: 'var(--accent-green)' }}>{manualSavedMsg}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
