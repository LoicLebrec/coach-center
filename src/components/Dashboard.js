import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import IntervalsService from '../services/intervals';
import analytics from '../services/analytics';

export default function Dashboard({ wellness, activities, athlete, loading, error }) {
  const latest = wellness?.[wellness.length - 1];
  const ctl = latest?.icu_ctl || 0;
  const atl = latest?.icu_atl || 0;
  const tsb = ctl - atl;
  const formState = IntervalsService.assessFormState(tsb);

  const pmcTrend = useMemo(() => analytics.computePMCTrend(wellness, 14), [wellness]);
  const efTrend = useMemo(() => analytics.computeEFTrend(activities, 14), [activities]);

  // Recent 30 days for mini PMC sparkline
  const miniPMC = useMemo(() => {
    if (!wellness || wellness.length === 0) return [];
    return wellness.slice(-30).map(w => ({
      date: w.id,
      ctl: w.icu_ctl ? Math.round(w.icu_ctl * 10) / 10 : null,
      atl: w.icu_atl ? Math.round(w.icu_atl * 10) / 10 : null,
      tsb: w.icu_ctl && w.icu_atl ? Math.round((w.icu_ctl - w.icu_atl) * 10) / 10 : null,
    }));
  }, [wellness]);

  // Recent activities (last 7)
  const recentActivities = useMemo(() => {
    if (!activities) return [];
    return [...activities]
      .sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local))
      .slice(0, 7);
  }, [activities]);

  if (loading && wellness.length === 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading athlete data...</span>
      </div>
    );
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}m`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}>
        <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>
            {p.name}: {p.value?.toFixed(1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">
          {athlete?.name || 'Athlete'} — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* ─── PMC Metrics Row ─── */}
      <div className="metrics-row">
        <div className="metric-tile">
          <div className="metric-label">Fitness (CTL)</div>
          <div className="metric-value" style={{ color: 'var(--ctl-color)' }}>
            {ctl ? ctl.toFixed(1) : '—'}
          </div>
          {pmcTrend && (
            <div className={`metric-delta ${pmcTrend.ctlTrend >= 0 ? 'positive' : 'negative'}`}>
              {pmcTrend.ctlTrend >= 0 ? '↑' : '↓'} {Math.abs(pmcTrend.ctlTrendPct).toFixed(1)}% / 14d
            </div>
          )}
        </div>

        <div className="metric-tile">
          <div className="metric-label">Fatigue (ATL)</div>
          <div className="metric-value" style={{ color: 'var(--atl-color)' }}>
            {atl ? atl.toFixed(1) : '—'}
          </div>
          {pmcTrend && (
            <div className={`metric-delta ${pmcTrend.atlTrend >= 0 ? 'negative' : 'positive'}`}>
              {pmcTrend.atlTrend >= 0 ? '↑' : '↓'} {Math.abs(pmcTrend.atlTrendPct).toFixed(1)}% / 14d
            </div>
          )}
        </div>

        <div className="metric-tile">
          <div className="metric-label">Form (TSB)</div>
          <div className="metric-value" style={{ color: tsb >= 0 ? 'var(--tsb-color)' : 'var(--tsb-negative)' }}>
            {tsb ? (tsb >= 0 ? '+' : '') + tsb.toFixed(1) : '—'}
          </div>
          <div className="form-indicator" style={{ marginTop: 6, background: `${formState.color}15`, color: formState.color }}>
            <span className="form-dot" style={{ background: formState.color }}></span>
            {formState.label}
          </div>
        </div>

        <div className="metric-tile">
          <div className="metric-label">FTP</div>
          <div className="metric-value">
            {athlete?.icu_ftp || '—'}<span className="metric-unit">W</span>
          </div>
          {athlete?.icu_weight && (
            <div className="metric-delta neutral">
              {(athlete.icu_ftp / athlete.icu_weight).toFixed(2)} W/kg
            </div>
          )}
        </div>

        <div className="metric-tile">
          <div className="metric-label">Efficiency Factor</div>
          <div className="metric-value">
            {efTrend?.latest ? efTrend.latest.toFixed(3) : '—'}
          </div>
          {efTrend && (
            <div className={`metric-delta ${efTrend.trendPct >= 0 ? 'positive' : 'negative'}`}>
              {efTrend.trendPct >= 0 ? '↑' : '↓'} {Math.abs(efTrend.trendPct).toFixed(1)}% / 14d
            </div>
          )}
        </div>

        <div className="metric-tile">
          <div className="metric-label">Resting HR</div>
          <div className="metric-value">
            {latest?.restingHR || '—'}<span className="metric-unit">bpm</span>
          </div>
          {latest?.weight && (
            <div className="metric-delta neutral">
              {latest.weight.toFixed(1)} kg
            </div>
          )}
        </div>
      </div>

      {/* ─── Mini PMC Chart ─── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Form & Fatigue — 30 days</span>
          <span className="card-badge">PMC</span>
        </div>
        <div className="chart-container" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={miniPMC} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="ctl" name="CTL" stroke="var(--ctl-color)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="atl" name="ATL" stroke="var(--atl-color)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="tsb" name="TSB" stroke="var(--tsb-color)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── EF Assessment ─── */}
      {efTrend && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Efficiency Factor Assessment</span>
            <span className="card-badge" style={{
              background: efTrend.assessment.startsWith('DECLINING') ? 'rgba(239,68,68,0.1)' :
                efTrend.assessment.startsWith('IMPROVING') ? 'rgba(34,197,94,0.1)' : 'var(--bg-3)',
              color: efTrend.assessment.startsWith('DECLINING') ? 'var(--accent-red)' :
                efTrend.assessment.startsWith('IMPROVING') ? 'var(--accent-green)' : 'var(--text-1)',
            }}>
              {efTrend.assessment.split(':')[0]}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.6 }}>
            {efTrend.assessment}
          </p>
        </div>
      )}

      {/* ─── Recent Activities ─── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Activities</span>
          <span className="card-badge">{recentActivities.length} shown</span>
        </div>
        <div className="activity-row activity-row-header">
          <span>Activity</span>
          <span style={{ textAlign: 'right' }}>TSS</span>
          <span style={{ textAlign: 'right' }}>Duration</span>
          <span style={{ textAlign: 'right' }}>Avg W</span>
          <span style={{ textAlign: 'right' }}>Avg HR</span>
          <span style={{ textAlign: 'right' }}>EF</span>
        </div>
        {recentActivities.map(a => {
          const ef = a.icu_average_watts && a.average_heartrate
            ? (a.icu_average_watts / a.average_heartrate).toFixed(3)
            : '—';
          return (
            <div className="activity-row" key={a.id}>
              <span className="activity-name">
                {a.name || 'Untitled'}
                <span className="type-badge">{a.type}</span>
              </span>
              <span className="activity-data">{a.icu_training_load ? Math.round(a.icu_training_load) : '—'}</span>
              <span className="activity-data">{formatDuration(a.moving_time || a.elapsed_time)}</span>
              <span className="activity-data">{a.icu_average_watts || a.average_watts || '—'}</span>
              <span className="activity-data">{a.average_heartrate ? Math.round(a.average_heartrate) : '—'}</span>
              <span className="activity-data">{ef}</span>
            </div>
          );
        })}
        {recentActivities.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
            No activities found in the last 90 days.
          </div>
        )}
      </div>
    </div>
  );
}
