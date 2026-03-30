import React, { useMemo, useState, useEffect } from 'react';
import {
  ComposedChart, LineChart, Line, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import persistence from '../services/persistence';
import InfoTip from './InfoTip';
import { METRICS } from '../data/metricDefs';

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

/**
 * Estimate TSS for a single activity using a 4-tier cascade:
 *   1. Direct TSS field (icu_training_load / training_load / tss)  — most accurate
 *   2. Power-based TSS  (NP / FTP)                                 — accurate with power meter
 *   3. hrTSS via Banister TRIMP × normalisation factor             — good with HR only
 *   4. Rough duration-based proxy                                  — last resort
 *
 * Returns { tss, method } so callers can report data quality.
 */
function estimateActivityTSS(activity, athlete) {
  const duration = Number(
    activity.moving_time || activity.elapsed_time || activity.icu_moving_time || 0
  );
  if (!duration) return { tss: 0, method: 'none' };

  // ── 1. Direct TSS ─────────────────────────────────────────────
  const direct = Number(activity.icu_training_load || activity.training_load || activity.tss || 0);
  if (Number.isFinite(direct) && direct > 0) return { tss: direct, method: 'direct' };

  // ── 2. Power-based TSS  (TSS = t × NP × IF / FTP / 3600 × 100) ─
  const ftp = Number(
    athlete?.icu_ftp || athlete?.ftp || athlete?.ftp_watts || athlete?.critical_power || 0
  );
  const np = Number(
    activity.icu_normalized_watts || activity.weighted_average_watts ||
    activity.icu_average_watts   || activity.average_watts || 0
  );
  if (ftp > 0 && np > 0) {
    const ifPower = np / ftp;
    const tss = Math.round((duration / 3600) * ifPower * ifPower * 100);
    if (tss > 0 && tss < 600) return { tss, method: 'power' };
  }

  // ── 3. hrTSS via Banister TRIMP ───────────────────────────────
  // TRIMP = t_min × hrReserve × 0.64 × e^(1.92 × hrReserve)
  // Scaled so that 1 h at LTHR ≈ 100 TSS
  const avgHr = Number(activity.average_heartrate || 0);
  if (avgHr > 0) {
    const maxHr   = Number(athlete?.max_hr || athlete?.icu_hr_max || athlete?.hr_max || 0) || 185;
    const restHr  = Number(athlete?.resting_hr || athlete?.icu_resting_hr || 0) || 50;
    // LTHR ≈ 88 % of maxHR (well-trained cyclist) or use explicit field
    const lthr    = Number(athlete?.lthr || athlete?.threshold_hr || 0) || Math.round(maxHr * 0.88);

    const hrReserve = (avgHr - restHr) / (maxHr - restHr);
    if (hrReserve > 0.1 && hrReserve <= 1.05) {
      const durationMin = duration / 60;
      const trimp = durationMin * hrReserve * 0.64 * Math.exp(1.92 * hrReserve);

      // Normalisation: compute TRIMP for 60 min at LTHR-equivalent hrReserve
      const lthrReserve    = (lthr - restHr) / (maxHr - restHr);
      const trimpPerHrAtLT = 60 * lthrReserve * 0.64 * Math.exp(1.92 * lthrReserve);
      const tss = Math.round(trimp * (100 / trimpPerHrAtLT));
      if (tss > 0 && tss < 500) return { tss, method: 'hr' };
    }

    // Simplified hrTSS fallback if TRIMP gives odd values
    const ifHr  = avgHr / lthr;
    const hrTss = Math.round((duration / 3600) * ifHr * ifHr * 100);
    if (hrTss > 0 && hrTss < 400) return { tss: hrTss, method: 'hr' };
  }

  // ── 4. Duration proxy — 50 TSS/hour (moderate effort assumption) ─
  const tss = Math.round((duration / 3600) * 50);
  return { tss, method: 'duration' };
}

/**
 * Build full PMC time-series (CTL / ATL / TSB) from raw activities.
 * Also returns `coverage` object with method counts for UI reporting.
 */
function computePMCSeriesFromActivities(activities = [], athlete = null, days = 120) {
  if (!activities.length) return { series: [], coverage: {} };

  const dailyLoad = new Map();
  const coverage  = { direct: 0, power: 0, hr: 0, duration: 0 };

  activities.forEach(a => {
    const day = String(a.start_date_local || '').slice(0, 10);
    if (!day) return;
    const { tss, method } = estimateActivityTSS(a, athlete);
    if (tss > 0) {
      dailyLoad.set(day, (dailyLoad.get(day) || 0) + tss);
      coverage[method] = (coverage[method] || 0) + 1;
    }
  });

  const today  = new Date();
  let ctl = 0, atl = 0;
  const ctlTau = 42, atlTau = 7;

  // Prime model 90 days before the visible window
  for (let d = days + 90; d > days; d--) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    const key  = day.toISOString().slice(0, 10);
    const load = dailyLoad.get(key) || 0;
    ctl = ctl + (load - ctl) * (1 / ctlTau);
    atl = atl + (load - atl) * (1 / atlTau);
  }

  const series = [];
  for (let d = days; d >= 0; d--) {
    const day = new Date(today);
    day.setDate(today.getDate() - d);
    const key  = day.toISOString().slice(0, 10);
    const load = dailyLoad.get(key) || 0;
    ctl = ctl + (load - ctl) * (1 / ctlTau);
    atl = atl + (load - atl) * (1 / atlTau);
    series.push({
      date:      key,
      shortDate: key.slice(5),
      ctl:  Math.round(ctl  * 10) / 10,
      atl:  Math.round(atl  * 10) / 10,
      tsb:  Math.round((ctl - atl) * 10) / 10,
      load,
    });
  }

  return { series, coverage };
}

export default function PMCChart({ wellness, activities, athlete, loading }) {
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

  const isEstimated = !wellness || wellness.length === 0;

  const { series: estimatedSeries, coverage } = useMemo(
    () => computePMCSeriesFromActivities(activities || [], athlete, 120),
    [activities, athlete]
  );

  const data = useMemo(() => {
    if (!isEstimated) {
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
    }
    // Fallback: estimated from activities
    return estimatedSeries.slice(-range).map(p => ({
      ...p,
      rhr: null,
      impressionValue: null,
      impression: formImpressions[p.date]?.impression || null,
    }));
  }, [wellness, activities, range, formImpressions, isEstimated, estimatedSeries]);

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
          <strong>No PMC data available</strong>
          <div style={{ marginTop: 6, fontSize: 12 }}>
            No activities found to estimate training load. Sync activities or connect Intervals.icu in Settings for accurate CTL/ATL/TSB data.
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

      {isEstimated && (
        <div className="info-banner" style={{ backgroundColor: 'rgba(250,204,21,0.06)', borderColor: 'rgba(250,204,21,0.25)', marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <strong>Estimated mode</strong> — Intervals.icu not connected.
              TSS calculated per activity using the best available data.
            </div>
            {coverage && Object.values(coverage).some(v => v > 0) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                {coverage.direct > 0 && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
                    ✓ {coverage.direct} direct TSS
                  </span>
                )}
                {coverage.power > 0 && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(96,148,240,0.12)', color: '#6094f0', border: '1px solid rgba(96,148,240,0.3)' }}>
                    ⚡ {coverage.power} power
                  </span>
                )}
                {coverage.hr > 0 && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(251,146,60,0.12)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }}>
                    ♥ {coverage.hr} hrTSS
                  </span>
                )}
                {coverage.duration > 0 && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
                    ⏱ {coverage.duration} duration estimate
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main PMC chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
            CTL / ATL / TSB
            <InfoTip {...METRICS.CTL} />
          </span>
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
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center' }}>CTL (Fitness)<InfoTip {...METRICS.CTL} /></div>
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
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center' }}>ATL (Fatigue)<InfoTip {...METRICS.ATL} /></div>
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
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center' }}>TSB (Form)<InfoTip {...METRICS.TSB} /></div>
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
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center' }}>RHR (Recovery)<InfoTip {...METRICS.RHR} /></div>
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
