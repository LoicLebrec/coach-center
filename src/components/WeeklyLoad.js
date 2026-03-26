import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import analytics from '../services/analytics';

export default function WeeklyLoad({ activities, loading }) {
  const [weeks, setWeeks] = useState(8);

  const data = useMemo(() => {
    return analytics.computeWeeklyLoads(activities, weeks);
  }, [activities, weeks]);

  // Compute average weekly load for reference line
  const avgLoad = useMemo(() => {
    if (data.length === 0) return 0;
    return data.reduce((s, d) => s + d.totalLoad, 0) / data.length;
  }, [data]);

  // Weekly load change (week-over-week)
  const loadChange = useMemo(() => {
    if (data.length < 2) return null;
    const current = data[data.length - 1].totalLoad;
    const previous = data[data.length - 2].totalLoad;
    if (previous === 0) return null;
    return ((current - previous) / previous) * 100;
  }, [data]);

  if (loading && data.length === 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Computing weekly loads...</span>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        minWidth: 160,
      }}>
        <div style={{ color: 'var(--text-2)', marginBottom: 6 }}>
          {d?.weekStart} → {d?.weekEnd}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ctl-color)', marginBottom: 2 }}>
          <span>Cycling</span>
          <span>{d?.cyclingLoad?.toFixed(0)} TSS ({d?.cyclingCount} rides)</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-green)', marginBottom: 2 }}>
          <span>Running</span>
          <span>{d?.runningLoad?.toFixed(0)} TSS ({d?.runningCount} runs)</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-0)', marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4, fontWeight: 600 }}>
          <span>Total</span>
          <span>{d?.totalLoad?.toFixed(0)} TSS</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Weekly Training Load</div>
          <div className="page-subtitle">
            TSS by sport — monitor volume progression and periodization
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[4, 8, 12].map(w => (
            <button
              key={w}
              className={`btn ${weeks === w ? 'btn-primary' : ''}`}
              onClick={() => setWeeks(w)}
              style={{ padding: '6px 12px', fontSize: 11 }}
            >
              {w}wk
            </button>
          ))}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="metrics-row">
        <div className="metric-tile">
          <div className="metric-label">This Week Load</div>
          <div className="metric-value">
            {data.length > 0 ? Math.round(data[data.length - 1].totalLoad) : '—'}
            <span className="metric-unit">TSS</span>
          </div>
          {loadChange !== null && (
            <div className={`metric-delta ${loadChange >= 0 ? 'positive' : 'negative'}`}>
              {loadChange >= 0 ? '↑' : '↓'} {Math.abs(loadChange).toFixed(0)}% vs last week
            </div>
          )}
        </div>
        <div className="metric-tile">
          <div className="metric-label">Avg Weekly Load</div>
          <div className="metric-value">
            {avgLoad > 0 ? Math.round(avgLoad) : '—'}
            <span className="metric-unit">TSS</span>
          </div>
          <div className="metric-delta neutral">over {weeks} weeks</div>
        </div>
        <div className="metric-tile">
          <div className="metric-label">Cycling : Running Ratio</div>
          <div className="metric-value" style={{ fontSize: 20 }}>
            {(() => {
              const totCyc = data.reduce((s, d) => s + d.cyclingLoad, 0);
              const totRun = data.reduce((s, d) => s + d.runningLoad, 0);
              if (totRun === 0) return 'Cycling only';
              return `${(totCyc / (totCyc + totRun) * 100).toFixed(0)}:${(totRun / (totCyc + totRun) * 100).toFixed(0)}`;
            })()}
          </div>
          <div className="metric-delta neutral">TSS split</div>
        </div>
      </div>

      <div className="info-banner">
        <strong>Monitoring:</strong> Week-over-week load increases above 10% raise injury/overtraining risk 
        (based on acute:chronic workload ratio principles). Your coaching system should flag weeks where 
        load jumps exceed this threshold.
      </div>

      {/* Weekly load chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Weekly Load by Sport</span>
          <span className="card-badge">TSS</span>
        </div>
        <div className="chart-container" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="weekStart"
                tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="square"
                iconSize={8}
                wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)' }}
              />
              <ReferenceLine y={avgLoad} stroke="var(--text-3)" strokeDasharray="4 4" label={{ value: 'Avg', fill: 'var(--text-3)', fontSize: 9 }} />
              <Bar dataKey="cyclingLoad" name="Cycling" stackId="load" fill="var(--ctl-color)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="runningLoad" name="Running" stackId="load" fill="var(--accent-green)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity count table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Weekly Activity Count</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Week</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)', fontWeight: 500 }}>Total</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)', fontWeight: 500 }}>Rides</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)', fontWeight: 500 }}>Runs</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)', fontWeight: 500 }}>TSS</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-1)' }}>{d.weekStart}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-0)' }}>{d.activityCount}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--ctl-color)' }}>{d.cyclingCount}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--accent-green)' }}>{d.runningCount}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-0)', fontWeight: 600 }}>{Math.round(d.totalLoad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
