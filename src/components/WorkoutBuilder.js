import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';

const ZONES = [
    { id: 'Z1', name: 'Recovery', pct: [45, 55], rpe: '1-2', desc: 'Very easy. Conversation effortless.' },
    { id: 'Z2', name: 'Endurance', pct: [56, 75], rpe: '2-3', desc: 'Steady aerobic base work.' },
    { id: 'Z3', name: 'Tempo', pct: [76, 90], rpe: '4-5', desc: 'Controlled but sustained pressure.' },
    { id: 'Z4', name: 'Threshold', pct: [91, 105], rpe: '6-7', desc: 'Hard sustainable effort near FTP.' },
    { id: 'Z5', name: 'VO2 Max', pct: [106, 120], rpe: '8-9', desc: 'High aerobic strain, short repeats.' },
    { id: 'Z6', name: 'Anaerobic', pct: [121, 150], rpe: '9-10', desc: 'Very hard, neuromuscular/anaerobic.' },
    { id: 'Z7', name: 'Sprint', pct: [151, 200], rpe: '10', desc: 'Maximal short efforts.' },
];

const PRESETS = {
    endurance: [
        { label: 'Warmup', durationMin: 12, zone: 'Z2' },
        { label: 'Endurance Block', durationMin: 50, zone: 'Z2' },
        { label: 'Cool-down', durationMin: 10, zone: 'Z1' },
    ],
    sweetspot: [
        { label: 'Warmup', durationMin: 15, zone: 'Z2' },
        { label: 'Sweet Spot #1', durationMin: 15, zone: 'Z3' },
        { label: 'Recovery', durationMin: 5, zone: 'Z1' },
        { label: 'Sweet Spot #2', durationMin: 15, zone: 'Z3' },
        { label: 'Recovery', durationMin: 5, zone: 'Z1' },
        { label: 'Sweet Spot #3', durationMin: 15, zone: 'Z3' },
        { label: 'Cool-down', durationMin: 10, zone: 'Z1' },
    ],
    vo2: [
        { label: 'Warmup', durationMin: 15, zone: 'Z2' },
        { label: 'VO2 Rep #1', durationMin: 5, zone: 'Z5' },
        { label: 'Recovery', durationMin: 5, zone: 'Z1' },
        { label: 'VO2 Rep #2', durationMin: 5, zone: 'Z5' },
        { label: 'Recovery', durationMin: 5, zone: 'Z1' },
        { label: 'VO2 Rep #3', durationMin: 5, zone: 'Z5' },
        { label: 'Recovery', durationMin: 5, zone: 'Z1' },
        { label: 'VO2 Rep #4', durationMin: 5, zone: 'Z5' },
        { label: 'Cool-down', durationMin: 10, zone: 'Z1' },
    ],
};

const makeBlock = (label = 'Block', durationMin = 10, zone = 'Z2') => ({
    id: `b_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    label,
    durationMin,
    zone,
});

function zoneMeta(zone) {
    return ZONES.find(z => z.id === zone) || ZONES[1];
}

function zoneText(zone, ftp) {
    const z = zoneMeta(zone);
    if (!ftp) return `${z.id} (${z.pct[0]}-${z.pct[1]}% FTP)`;
    const lo = Math.round((z.pct[0] / 100) * ftp);
    const hi = Math.round((z.pct[1] / 100) * ftp);
    return `${z.id} (${z.pct[0]}-${z.pct[1]}% FTP, ${lo}-${hi}W)`;
}

export default function WorkoutBuilder({ onCreate, ftp }) {
    const [title, setTitle] = useState('Structured Workout');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [sport, setSport] = useState('Ride');
    const [objective, setObjective] = useState('Build aerobic power');
    const [blocks, setBlocks] = useState([
        makeBlock('Warmup', 12, 'Z2'),
        makeBlock('Main Set', 30, 'Z3'),
        makeBlock('Cool-down', 10, 'Z1'),
    ]);

    const totalMin = useMemo(() => blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0), [blocks]);

    const updateBlock = (id, field, value) => {
        setBlocks(prev => prev.map(b => (b.id === id ? { ...b, [field]: value } : b)));
    };

    const moveBlock = (id, dir) => {
        setBlocks(prev => {
            const i = prev.findIndex(b => b.id === id);
            if (i < 0) return prev;
            const j = i + dir;
            if (j < 0 || j >= prev.length) return prev;
            const copy = [...prev];
            const [item] = copy.splice(i, 1);
            copy.splice(j, 0, item);
            return copy;
        });
    };

    const removeBlock = (id) => setBlocks(prev => prev.filter(b => b.id !== id));

    const applyPreset = (presetKey) => {
        const preset = PRESETS[presetKey];
        if (!preset) return;
        setBlocks(preset.map(p => makeBlock(p.label, p.durationMin, p.zone)));
    };

    const addBlock = () => setBlocks(prev => [...prev, makeBlock('New Block', 8, 'Z2')]);

    const buildNotes = () => {
        const lines = [];
        lines.push(`Objective: ${objective}`);
        lines.push(`Sport: ${sport}`);
        lines.push(`Total: ${totalMin} min`);
        lines.push('');
        lines.push('Workout Steps:');
        blocks.forEach((b, idx) => {
            lines.push(`${idx + 1}. ${b.label} — ${b.durationMin} min @ ${zoneText(b.zone, ftp)}`);
        });
        return lines.join('\n');
    };

    const saveWorkout = async () => {
        if (!title.trim() || blocks.length === 0) return;
        await onCreate({
            title: title.trim(),
            name: title.trim(),
            type: sport,
            event_type: sport,
            kind: 'training',
            notes: buildNotes(),
            source: 'manual',
            start_date_local: `${date}T07:00:00`,
            workoutBlocks: blocks,
            objective,
        });
    };

    return (
        <div className="calendar-planner-box">
            <div className="card-title" style={{ marginBottom: 8 }}>Workout Builder</div>

            <div className="workout-zone-legend">
                {ZONES.map(z => (
                    <div key={z.id} className="workout-zone-item">
                        <div className="workout-zone-head">{z.id} · {z.name}</div>
                        <div className="workout-zone-sub">{z.pct[0]}-{z.pct[1]}% FTP · RPE {z.rpe}</div>
                        <div className="workout-zone-desc">{z.desc}</div>
                    </div>
                ))}
            </div>

            <div className="calendar-form-row">
                <input className="form-input calendar-form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                <select className="form-input calendar-form-input" value={sport} onChange={e => setSport(e.target.value)}>
                    <option value="Ride">Ride</option>
                    <option value="Run">Run</option>
                </select>
            </div>

            <input className="form-input calendar-form-input" placeholder="Workout title" value={title} onChange={e => setTitle(e.target.value)} />
            <input className="form-input calendar-form-input" placeholder="Objective (e.g. threshold build)" value={objective} onChange={e => setObjective(e.target.value)} />

            <div className="workout-presets">
                <button className="btn" onClick={() => applyPreset('endurance')}>Endurance</button>
                <button className="btn" onClick={() => applyPreset('sweetspot')}>Sweet Spot</button>
                <button className="btn" onClick={() => applyPreset('vo2')}>VO2</button>
                <button className="btn" onClick={addBlock}>+ Block</button>
            </div>

            <div className="workout-block-list">
                {blocks.map((b, idx) => (
                    <div className="workout-block-item" key={b.id}>
                        <input
                            className="form-input calendar-form-input"
                            value={b.label}
                            onChange={e => updateBlock(b.id, 'label', e.target.value)}
                            placeholder={`Block ${idx + 1}`}
                        />
                        <input
                            className="form-input calendar-form-input"
                            type="number"
                            min="1"
                            value={b.durationMin}
                            onChange={e => updateBlock(b.id, 'durationMin', e.target.value)}
                        />
                        <select
                            className="form-input calendar-form-input"
                            value={b.zone}
                            onChange={e => updateBlock(b.id, 'zone', e.target.value)}
                        >
                            {ZONES.map(z => <option key={z.id} value={z.id}>{z.id} - {z.name}</option>)}
                        </select>
                        <div className="workout-block-target">{zoneText(b.zone, ftp)}</div>
                        <div className="workout-block-actions">
                            <button className="btn" onClick={() => moveBlock(b.id, -1)}>Up</button>
                            <button className="btn" onClick={() => moveBlock(b.id, 1)}>Down</button>
                            <button className="btn btn-danger" onClick={() => removeBlock(b.id)}>Remove</button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="workout-summary-row">
                <span>Total duration: {totalMin} min</span>
                <span>{ftp ? `FTP context: ${ftp}W` : 'Set FTP in profile for watt targets'}</span>
            </div>

            <button className="btn btn-primary" onClick={saveWorkout}>Save Workout To Calendar</button>
        </div>
    );
}
