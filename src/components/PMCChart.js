import React, { useMemo, useState } from 'react';
import {
  ComposedChart, LineChart, Line, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';

export default function PMCChart({ wellness, loading }) {
  const [range, setRange] = useState(90);

  const data = useMemo(() => {
    if (!wellness || wellness.length === 0) return [];
    return wellness.slice(-range).map(w => ({
      date: w.id,
      shortDate: w.id ? w.id.slice(5) : '',
      ctl: w.icu_ctl ? Math.round(w.icu_ctl * 10) / 10 : null,
      atl: w.icu_atl ? Math.round(w.icu_atl * 10) / 10 : null,
      tsb: w.icu_ctl && w.icu_atl ? Math.round((w.icu_ctl - w.icu_atl) * 10) / 10 : null,
      rhr: w.restingHR || null,
      load: w.icu_training_load || 0,
    }));
  }, [wellness, range]);

  if (loading && data.length === 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading PMC data...</span>
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
            </ComposedChart>
          </ResponsiveContainer>
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
