import React, { useMemo } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, addDays, startOfDay } from 'date-fns';

// IF score by training zone for TSS estimation
const IF_BY_ZONE = {
  Z1: 0.50, Z2: 0.65, Z3: 0.80, Z4: 0.90,
  Z5: 1.05, Z6: 1.20, Z7: 1.40,
};

function estimateTSS(workoutBlocks = [], notes = '') {
  if (workoutBlocks?.length > 0) {
    return workoutBlocks.reduce((total, b) => {
      const ifScore = IF_BY_ZONE[String(b.zone || '').toUpperCase()] || 0.65;
      const hours = (Number(b.durationMin) || 0) / 60;
      return total + ifScore * ifScore * hours * 100;
    }, 0);
  }
  // Fallback: estimate from notes text
  const text = String(notes || '').toLowerCase();
  if (/vo2|z5|anaerobic|sprint|max/.test(text)) return 75;
  if (/threshold|z4|ftp/.test(text)) return 65;
  if (/tempo|sweet.?spot|z3/.test(text)) return 55;
  if (/z2|endurance|aerobic|long/.test(text)) return 50;
  if (/rest|recovery|z1|easy/.test(text)) return 15;
  return 40; // default
}

export default function FormPredictor({ wellness, plannedEvents }) {
  const projection = useMemo(() => {
    if (!wellness?.length) return [];

    // Get last known CTL/ATL
    const last = wellness[wellness.length - 1];
    let ctl = last?.icu_ctl || 0;
    let atl = last?.icu_atl || 0;
    if (!ctl && !atl) return [];

    // Build a map of planned TSS by date key
    const plannedTSSByDay = {};
    (plannedEvents || []).forEach(ev => {
      const dateRaw = ev.start_date_local || ev.date || ev.start_date;
      if (!dateRaw) return;
      const dateKey = String(dateRaw).slice(0, 10);
      const tss = estimateTSS(ev.workoutBlocks || [], ev.notes || '');
      plannedTSSByDay[dateKey] = (plannedTSSByDay[dateKey] || 0) + tss;
    });

    const CTL_TC = 42;
    const ATL_TC = 7;
    const ctlDecay = Math.exp(-1 / CTL_TC);
    const atlDecay = Math.exp(-1 / ATL_TC);
    const ctlFactor = 1 - ctlDecay;
    const atlFactor = 1 - atlDecay;

    const today = startOfDay(new Date());
    const data = [];

    for (let i = 0; i <= 56; i++) { // 8 weeks
      const day = addDays(today, i);
      const dateKey = format(day, 'yyyy-MM-dd');
      const tss = plannedTSSByDay[dateKey] || 0;

      ctl = ctl * ctlDecay + tss * ctlFactor;
      atl = atl * atlDecay + tss * atlFactor;
      const tsb = ctl - atl;

      data.push({
        date: format(day, 'dd MMM'),
        dateKey,
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round(tsb * 10) / 10,
        tss: Math.round(tss),
        hasPlan: tss > 0,
      });
    }

    return data;
  }, [wellness, plannedEvents]);

  if (!projection.length) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>
        {d?.tss > 0 && <div style={{ color: 'var(--accent-blue)' }}>Planned TSS: {d.tss}</div>}
        <div style={{ color: '#3b82f6' }}>CTL: {d?.ctl}</div>
        <div style={{ color: '#f97316' }}>ATL: {d?.atl}</div>
        <div style={{ color: d?.tsb >= 0 ? '#22c55e' : '#ef4444' }}>TSB: {d?.tsb >= 0 ? '+' : ''}{d?.tsb}</div>
      </div>
    );
  };

  const hasPlan = projection.some(d => d.hasPlan);
  const peakTSB = Math.max(...projection.map(d => d.tsb));
  const minTSB = Math.min(...projection.map(d => d.tsb));

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <span className="card-title">Form Predictor</span>
        <span className="card-badge" style={{ color: 'var(--accent-blue)' }}>8-week projection</span>
      </div>
      {!hasPlan && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
          No planned workouts found — showing CTL/ATL decay only. Add workouts to the calendar to see projection.
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginBottom: 12, display: 'flex', gap: 16 }}>
        <span>Peak TSB: <strong style={{ color: '#22c55e' }}>+{peakTSB.toFixed(1)}</strong></span>
        <span>Low TSB: <strong style={{ color: minTSB < -20 ? '#ef4444' : '#f97316' }}>{minTSB.toFixed(1)}</strong></span>
      </div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={projection} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              interval={6}
            />
            <YAxis
              tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
            <ReferenceLine y={-25} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'Overreach', fill: '#ef4444', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
            <ReferenceLine y={15} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'Race ready', fill: '#22c55e', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
            <Line type="monotone" dataKey="ctl" stroke="#3b82f6" strokeWidth={2} dot={false} name="CTL" />
            <Line type="monotone" dataKey="atl" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="ATL" />
            <Line type="monotone" dataKey="tsb" stroke="#22c55e" strokeWidth={2} dot={d => d.payload.hasPlan ? <circle key={d.cx} cx={d.cx} cy={d.cy} r={3} fill="#22c55e" /> : false} name="TSB" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
        <span style={{ color: '#3b82f6' }}>— CTL (Fitness)</span>
        <span style={{ color: '#f97316' }}>-- ATL (Fatigue)</span>
        <span style={{ color: '#22c55e' }}>— TSB (Form)</span>
        <span>&#x25CF; = planned workout</span>
      </div>
    </div>
  );
}
