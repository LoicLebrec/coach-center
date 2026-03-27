import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from 'recharts';
import IntervalsService from '../services/intervals';
import analytics from '../services/analytics';

function estimatePMCFromActivities(activities = []) {
  if (!activities.length) return null;

  const dailyLoad = new Map();
  activities.forEach(a => {
    const day = String(a.start_date_local || '').slice(0, 10);
    if (!day) return;
    const load = Number(a.icu_training_load || a.training_load || 0);
    dailyLoad.set(day, (dailyLoad.get(day) || 0) + (Number.isFinite(load) ? load : 0));
  });

  const today = new Date();
  let ctl = 0;
  let atl = 0;
  const ctlTau = 42;
  const atlTau = 7;

  for (let d = 90; d >= 0; d--) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    const key = day.toISOString().slice(0, 10);
    const load = dailyLoad.get(key) || 0;
    ctl = ctl + (load - ctl) * (1 / ctlTau);
    atl = atl + (load - atl) * (1 / atlTau);
  }

  return { ctl, atl, tsb: ctl - atl };
}

// ── FormGauge: horizontal gradient bar with TSB indicator ────────────────────
function FormGauge({ tsb }) {
  if (tsb == null) return null;
  const pct = Math.min(100, Math.max(0, ((tsb - (-30)) / 60) * 100));
  return (
    <div style={{ position: 'relative', width: '100%', marginTop: 12, marginBottom: 8 }}>
      <div style={{
        height: 10,
        borderRadius: 5,
        background: 'linear-gradient(to right, #ef4444 0%, #ef4444 15%, #f97316 15%, #f97316 35%, #facc15 35%, #facc15 55%, #22c55e 55%, #22c55e 80%, #4ade80 80%, #4ade80 92%, #94a3b8 92%, #94a3b8 100%)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          left: `${pct}%`,
          top: -3,
          transform: 'translateX(-50%)',
          width: 4,
          height: 16,
          background: 'var(--text-0)',
          borderRadius: 2,
          boxShadow: '0 0 4px rgba(0,0,0,0.5)',
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 5,
        fontSize: 9,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-3)',
        letterSpacing: '0.04em',
      }}>
        <span>Overtraining</span>
        <span>Fatigued</span>
        <span>Neutral</span>
        <span>Fresh</span>
        <span>Race Ready</span>
      </div>
    </div>
  );
}

export default function Dashboard({ wellness, activities, athlete, loading, error }) {
  const latest = wellness?.[wellness.length - 1];
  const estimatedPMC = useMemo(() => estimatePMCFromActivities(activities), [activities]);
  const ctl = latest?.icu_ctl ?? estimatedPMC?.ctl ?? null;
  const atl = latest?.icu_atl ?? estimatedPMC?.atl ?? null;
  const tsb = ctl != null && atl != null ? ctl - atl : null;
  const formState = IntervalsService.assessFormState(tsb);

  const readiness = (ctl != null || atl != null)
    ? Math.round(Math.min(100, Math.max(0, 50 + tsb * 2)))
    : null;

  const ftpValue = athlete?.icu_ftp ?? null;
  const weightValue = athlete?.icu_weight ?? latest?.weight ?? null;
  const wkgValue = (ftpValue && weightValue) ? (ftpValue / weightValue) : null;

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

  // Weekly TSS — last 8 weeks
  const weeklyTSS = useMemo(() => {
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
      const tss = activities
        .filter(a => {
          if (!a.start_date_local) return false;
          const d = new Date(a.start_date_local);
          return d >= start && d <= end;
        })
        .reduce((s, a) => s + (a.icu_training_load || 0), 0);
      result.push({ label, tss: Math.round(tss), current: i === 0 });
    }
    return result;
  }, [activities]);

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
            {p.name}: {p.value?.toFixed ? p.value.toFixed(1) : p.value}
          </div>
        ))}
      </div>
    );
  };

  const BarTooltip = ({ active, payload, label }) => {
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
        <div style={{ color: 'var(--accent-blue)' }}>TSS: {payload[0]?.value}</div>
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

      {/* ─── Card 1: Training Readiness ─── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Training Readiness</span>
          {formState && (
            <span className="card-badge" style={{ background: `${formState.color}18`, color: formState.color }}>
              {formState.label}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 4 }}>
          <div style={{
            fontSize: 52,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            lineHeight: 1,
            color: formState?.color || 'var(--text-0)',
          }}>
            {readiness != null ? `${readiness}%` : '—'}
          </div>
          <div style={{ paddingBottom: 6, fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
            TSB {tsb != null ? `${tsb >= 0 ? '+' : ''}${tsb.toFixed(1)}` : '—'}
          </div>
        </div>
        <FormGauge tsb={tsb ?? 0} />
      </div>

      {/* ─── Card 2: PMC Metrics Row ─── */}
      <div className="metrics-row">
        <div className="metric-tile">
          <div className="metric-label">Fitness (CTL)</div>
          <div className="metric-value" style={{ color: 'var(--ctl-color)' }}>
            {ctl != null ? ctl.toFixed(1) : '—'}
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
            {atl != null ? atl.toFixed(1) : '—'}
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
            {tsb != null ? (tsb >= 0 ? '+' : '') + tsb.toFixed(1) : '—'}
          </div>
          <div className="form-indicator" style={{ marginTop: 6, background: `${formState.color}15`, color: formState.color }}>
            <span className="form-dot" style={{ background: formState.color }}></span>
            {formState.label}
          </div>
        </div>

        <div className="metric-tile">
          <div className="metric-label">FTP</div>
          <div className="metric-value">
            {ftpValue || '—'}<span className="metric-unit">W</span>
          </div>
          {wkgValue != null && Number.isFinite(wkgValue) && (
            <div className="metric-delta neutral">
              {wkgValue.toFixed(2)} W/kg
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

      {/* ─── Card 3: Weekly Load (last 8 weeks) ─── */}
      {weeklyTSS.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Weekly Load — Last 8 Weeks</span>
            <span className="card-badge">TSS</span>
          </div>
          <div style={{ height: 180, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTSS} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  label={{ value: 'TSS', angle: -90, position: 'insideLeft', fill: 'var(--text-3)', fontSize: 9, fontFamily: 'var(--font-mono)', dy: 14 }}
                />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="tss" name="TSS" radius={[3, 3, 0, 0]}>
                  {weeklyTSS.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.current ? 'var(--accent-blue)' : 'var(--bg-3)'}
                      stroke={entry.current ? 'var(--accent-blue)' : 'var(--border)'}
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ─── Card 4: Form & Fatigue 30-day chart ─── */}
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

      {/* ─── Card 5: EF Assessment ─── */}
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

      {/* ─── Card 6: Recent Activities ─── */}
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
