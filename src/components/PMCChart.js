import React, { useMemo, useState, useEffect } from 'react';
import {
  ComposedChart, LineChart, Line, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import persistence from '../services/persistence';

const IMPRESSION_OPTIONS = [
  { value: 'great', label: '✨ Great', color: '#22c55e' },
  { value: 'good', label: '✓ Good', color: '#4ade80' },
  { value: 'neutral', label: '◦ Neutral', color: '#facc15' },
  { value: 'tired', label: '⬇ Tired', color: '#fb923c' },
  { value: 'very-tired', label: '⬇⬇ Very Tired', color: '#ef4444' },
];

// Helper to extract numeric value from various field names
function asNumber(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Helper to get resting HR from wellness record (handles different field names)
function getWellnessRestingHr(w) {
  return asNumber(w?.restingHR, w?.resting_hr, w?.rhr, w?.hrRest);
}

export default function PMCChart({ wellness, loading }) {
  const [range, setRange] = useState(90);
  const [formImpressions, setFormImpressions] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedImpression, setSelectedImpression] = useState('');
  const [selectedNotes, setSelectedNotes] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    (async () => {
      const impressions = await persistence.getFormImpressions();
      setFormImpressions(impressions || {});
      const todayImpression = impressions?.[selectedDate];
      if (todayImpression) {
        setSelectedImpression(todayImpression.impression);
        setSelectedNotes(todayImpression.notes || '');
      }
    })();
  }, [selectedDate]);

  const data = useMemo(() => {
    if (!wellness || wellness.length === 0) return [];
    return wellness.slice(-range).map(w => {
      const impression = formImpressions[w.id];
      return {
        date: w.id,
        shortDate: w.id ? w.id.slice(5) : '',
        ctl: w.icu_ctl ? Math.round(w.icu_ctl * 10) / 10 : null,
        atl: w.icu_atl ? Math.round(w.icu_atl * 10) / 10 : null,
        tsb: w.icu_ctl && w.icu_atl ? Math.round((w.icu_ctl - w.icu_atl) * 10) / 10 : null,
        rhr: getWellnessRestingHr(w),
        load: w.icu_training_load || 0,
        impressionValue: impression ? { great: 25, good: 15, neutral: 5, tired: -10, 'very-tired': -25 }[impression.impression] : null,
        impression: impression ? impression.impression : null,
      };
    });
  }, [wellness, range, formImpressions]);

  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const ctlValues = data.map(d => d.ctl).filter(v => v != null);
    const atlValues = data.map(d => d.atl).filter(v => v != null);
    const tsbValues = data.map(d => d.tsb).filter(v => v != null);
    const rhValues = data.map(d => d.rhr).filter(v => v != null);

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const min = arr => Math.min(...arr);
    const max = arr => Math.max(...arr);

    return {
      ctl: ctlValues.length ? {
        avg: avg(ctlValues),
        min: min(ctlValues),
        max: max(ctlValues),
        latest: ctlValues[ctlValues.length - 1],
      } : null,
      atl: atlValues.length ? {
        avg: avg(atlValues),
        min: min(atlValues),
        max: max(atlValues),
        latest: atlValues[atlValues.length - 1],
      } : null,
      tsb: tsbValues.length ? {
        avg: avg(tsbValues),
        min: min(tsbValues),
        max: max(tsbValues),
        latest: tsbValues[tsbValues.length - 1],
      } : null,
      rhr: rhValues.length ? {
        avg: avg(rhValues),
        min: min(rhValues),
        max: max(rhValues),
        latest: rhValues[rhValues.length - 1],
      } : null,
    };
  }, [data]);

  const handleSaveFormImpression = async () => {
    if (!selectedImpression) {
      setSaveMsg('Select an impression first.');
      return;
    }
    await persistence.saveFormImpression(selectedDate, selectedImpression, selectedNotes);
    setFormImpressions(await persistence.getFormImpressions());
    setSaveMsg('Form impression saved.');
    setTimeout(() => setSaveMsg(''), 2500);
  };

  if (loading && data.length === 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading PMC data...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="page-header">
        <div className="info-banner" style={{ marginTop: 16, backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }}>
          <strong>⚠ No PMC data available</strong>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            PMC requires Intervals.icu data sync. Visit Settings to connect Intervals.icu, then return to Dashboard to trigger a sync. CTL, ATL, and TSB will appear once training data is loaded.
          </div>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        minWidth: 140,
      }}>
        <div style={{ color: 'var(--text-2)', marginBottom: 6, fontWeight: 500 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
            <span>{p.name}</span>
            <span style={{ fontWeight: 600 }}>{p.value?.toFixed(1)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Performance Management Chart</div>
          <div className="page-subtitle">
            Banister impulse-response model — CTL (42d), ATL (7d), TSB = CTL − ATL
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[30, 60, 90].map(d => (
            <button
              key={d}
              className={`btn ${range === d ? 'btn-primary' : ''}`}
              onClick={() => setRange(d)}
              style={{ padding: '6px 12px', fontSize: 11 }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="info-banner">
        <strong>Reading the PMC:</strong> CTL (blue) = chronic training load / fitness. ATL (orange) = acute fatigue.
        TSB (green area) = form. Positive TSB = fresh for competition. Negative TSB = productive overload.
        TSB below −25 = risk of overtraining.
      </div>

      {/* Main PMC chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">CTL / ATL / TSB</span>
          <span className="card-badge">{data.length} days</span>
        </div>
        <div className="chart-container" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="shortDate"
                tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                interval={Math.floor(data.length / 10)}
              />
              <YAxis
                yAxisId="pmc"
                tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <YAxis
                yAxisId="load"
                orientation="right"
                tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine yAxisId="pmc" y={0} stroke="var(--text-3)" strokeDasharray="2 4" />
              <ReferenceLine yAxisId="pmc" y={-25} stroke="var(--accent-red)" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: 'Overreaching', fill: 'var(--accent-red)', fontSize: 9, position: 'left' }} />

              {/* Daily load as bars */}
              <Bar yAxisId="load" dataKey="load" name="Load" fill="var(--bg-3)" barSize={3} />

              {/* TSB as area */}
              <Area
                yAxisId="pmc"
                type="monotone"
                dataKey="tsb"
                name="TSB"
                stroke="var(--tsb-color)"
                fill="var(--tsb-color)"
                fillOpacity={0.08}
                strokeWidth={1.5}
              />

              {/* CTL */}
              <Line
                yAxisId="pmc"
                type="monotone"
                dataKey="ctl"
                name="CTL (Fitness)"
                stroke="var(--ctl-color)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 3, fill: 'var(--ctl-color)' }}
              />

              {/* ATL */}
              <Line
                yAxisId="pmc"
                type="monotone"
                dataKey="atl"
                name="ATL (Fatigue)"
                stroke="var(--atl-color)"
                strokeWidth={2}
                dot={false}
                strokeDasharray="6 3"
                activeDot={{ r: 3, fill: 'var(--atl-color)' }}
              />

              {/* Form Impressions as overlay dots */}
              <Line
                yAxisId="pmc"
                type="monotone"
                dataKey="impressionValue"
                name="Form Impression"
                stroke="transparent"
                dot={(props) => {
                  if (props.payload.impression) {
                    const colors = {
                      'great': '#22c55e',
                      'good': '#4ade80',
                      'neutral': '#facc15',
                      'tired': '#fb923c',
                      'very-tired': '#ef4444',
                    };
                    const color = colors[props.payload.impression] || '#888';
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={5}
                        fill={color}
                        stroke="white"
                        strokeWidth={2}
                      />
                    );
                  }
                  return null;
                }}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 12 }}>
        {stats?.ctl && (
          <div className="card" style={{ marginBottom: 0, padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>CTL (Fitness)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--ctl-color)', marginBottom: 4 }}>
              {stats.ctl.latest.toFixed(1)} <span style={{ fontSize: 10, color: 'var(--text-2)' }}>current</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              Avg {stats.ctl.avg.toFixed(1)} · Min {stats.ctl.min.toFixed(1)} · Max {stats.ctl.max.toFixed(1)}
            </div>
          </div>
        )}
        {stats?.atl && (
          <div className="card" style={{ marginBottom: 0, padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>ATL (Fatigue)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--atl-color)', marginBottom: 4 }}>
              {stats.atl.latest.toFixed(1)} <span style={{ fontSize: 10, color: 'var(--text-2)' }}>current</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              Avg {stats.atl.avg.toFixed(1)} · Min {stats.atl.min.toFixed(1)} · Max {stats.atl.max.toFixed(1)}
            </div>
          </div>
        )}
        {stats?.tsb && (
          <div className="card" style={{ marginBottom: 0, padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>TSB (Form)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--tsb-color)', marginBottom: 4 }}>
              {stats.tsb.latest.toFixed(1)} <span style={{ fontSize: 10, color: 'var(--text-2)' }}>current</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              Avg {stats.tsb.avg.toFixed(1)} · Min {stats.tsb.min.toFixed(1)} · Max {stats.tsb.max.toFixed(1)}
            </div>
          </div>
        )}
        {stats?.rhr && (
          <div className="card" style={{ marginBottom: 0, padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>RHR (Recovery)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--accent-purple)', marginBottom: 4 }}>
              {stats.rhr.latest.toFixed(0)} <span style={{ fontSize: 10, color: 'var(--text-2)' }}>bpm</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              Avg {stats.rhr.avg.toFixed(0)} · Min {stats.rhr.min.toFixed(0)} · Max {stats.rhr.max.toFixed(0)}
            </div>
          </div>
        )}
      </div>

      {/* Form Impression Logger */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <span className="card-title">How Do You Feel?</span>
          <span className="card-badge">Subjective Form Log</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            type="date"
            className="form-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {IMPRESSION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedImpression(opt.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: `1px solid ${selectedImpression === opt.value ? opt.color : 'var(--border)'}`,
                  background: selectedImpression === opt.value ? `${opt.color}15` : 'var(--bg-2)',
                  color: selectedImpression === opt.value ? opt.color : 'var(--text-1)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          className="form-input"
          placeholder="Optional notes: legs felt heavy, slept well, recovered well, etc."
          value={selectedNotes}
          onChange={(e) => setSelectedNotes(e.target.value)}
          style={{ minHeight: 60, marginBottom: 8, width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleSaveFormImpression}>
            Log Form Impression
          </button>
          {saveMsg && <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>{saveMsg}</div>}
        </div>
      </div>

      {/* Form Impression Legend */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header" style={{ fontSize: 12, fontWeight: 600 }}>Form Impression Scale on Chart</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
          {IMPRESSION_OPTIONS.map(opt => (
            <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: opt.color, border: '2px solid white' }} />
              <span style={{ fontSize: 11 }}>{opt.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Resting HR overlay */}
      {data.some(d => d.rhr) && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Resting Heart Rate Trend</span>
            <span className="card-badge">Recovery indicator</span>
          </div>
          <div className="chart-container" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.filter(d => d.rhr)} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <XAxis
                  dataKey="shortDate"
                  tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={['dataMin - 3', 'dataMax + 3']}
                  tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="rhr" name="RHR" stroke="var(--accent-purple)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
            Rising RHR with stable or increasing load can indicate incomplete recovery or illness onset.
          </p>
        </div>
      )}
    </div>
  );
}
