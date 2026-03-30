import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTip } from 'recharts';
import InfoTip from './InfoTip';
import { METRICS } from '../data/metricDefs';

const ZONE_COLORS = {
  Z1: '#475569', Z2: '#22c55e', Z3: '#eab308',
  Z4: '#f97316', Z5: '#ef4444', Z6: '#a855f7', Z7: '#8b5cf6',
};
const ZONE_LABELS = {
  Z1: 'Recovery', Z2: 'Endurance', Z3: 'Tempo',
  Z4: 'Threshold', Z5: 'VO2 Max', Z6: 'Anaerobic', Z7: 'Sprint',
};
const ZONE_PCT = {
  Z1: [45, 55], Z2: [56, 75], Z3: [76, 90],
  Z4: [91, 105], Z5: [106, 120], Z6: [121, 150], Z7: [151, 200],
};

const WORKOUT_TYPE_COLOR = {
  recovery:  '#475569',
  endurance: '#22c55e',
  base:      '#6094f0',
  tempo:     '#eab308',
  threshold: '#f97316',
  intervals: '#ef4444',
  sprint:    '#8b5cf6',
  race:      '#f0b429',
};
const WORKOUT_TYPE_LABEL = {
  recovery:  'Recovery',
  endurance: 'Endurance',
  base:      'Base',
  tempo:     'Tempo',
  threshold: 'Threshold',
  intervals: 'Intervals',
  sprint:    'Sprint',
  race:      'Race',
};

// Normalize intensity factor — intervals.icu returns decimal (0.75 = 75% FTP)
// but some sources return percentage (75). Values > 3 are almost certainly percent.
function normalizeIF(val) {
  if (val == null) return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 3 ? n / 100 : n;
}

function zoneFromIF(intensity) {
  if (!intensity || intensity <= 0) return null;
  if (intensity < 0.55) return 'Z1';
  if (intensity < 0.75) return 'Z2';
  if (intensity < 0.90) return 'Z3';
  if (intensity < 1.05) return 'Z4';
  if (intensity < 1.20) return 'Z5';
  if (intensity < 1.50) return 'Z6';
  return 'Z7';
}

// HR-based zone using heart rate reserve (Karvonen method)
function zoneFromHR(avgHr, maxHr, restHr = 50) {
  if (!avgHr || !maxHr || maxHr <= restHr) return null;
  const hrr = Math.min(1.05, (avgHr - restHr) / (maxHr - restHr));
  if (hrr < 0.50) return 'Z1';
  if (hrr < 0.65) return 'Z2';
  if (hrr < 0.78) return 'Z3';
  if (hrr < 0.90) return 'Z4';
  return 'Z5';
}

function detectWorkoutType(activity, zone, durationMin) {
  const name = (activity.name || '').toLowerCase();
  // Name-based detection (highest priority)
  if (/(race|compet|ronde|etape|grand.?fond|criterium|crit\b|course)/i.test(name)) return 'race';
  if (/(sprint|neuromuscul|tabata|1\s?x\s?30|tornade|punch)/i.test(name)) return 'sprint';
  if (/(interval|vo2|hiit|hitt|\d\s?x\s?\d|repet|effort|séance)/i.test(name)) return 'intervals';
  if (/(threshold|ftp|sweet.?spot|tempo|seuil|zone\s?4)/i.test(name)) return 'threshold';
  if (/(recovery|récup|active.?rec|easy|endur|fond|sortie\s?z|long\s?ride|aero)/i.test(name)) return 'endurance';

  // Zone-based detection
  if (zone === 'Z1') return 'recovery';
  if (zone === 'Z2') return durationMin > 80 ? 'endurance' : 'base';
  if (zone === 'Z3') return 'tempo';
  if (zone === 'Z4') return 'threshold';
  if (zone === 'Z5') return 'intervals';
  if (zone === 'Z6' || zone === 'Z7') return 'sprint';

  // Duration-based fallback
  if (durationMin > 180) return 'endurance';
  if (durationMin > 90) return 'base';
  return 'base';
}

// Visual bar representing intensity — height proportional to zone midpoint, like WorkoutDetailVisual
function ActivityIntensityBar({ zone, durationSec }) {
  if (!zone) return null;
  const color = ZONE_COLORS[zone];
  const pct = ZONE_PCT[zone];
  const barHeight = Math.max(20, Math.round(((pct[0] + pct[1]) / 2) / 2));

  return (
    <div style={{ display: 'flex', height: 40, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
      <div
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-end',
          background: 'var(--bg-3)', borderRadius: 6,
        }}
      >
        <div style={{
          width: '100%', height: `${barHeight}%`,
          background: color, opacity: 0.85,
          borderRadius: '4px 4px 0 0',
          transition: 'height 0.3s ease',
        }} />
      </div>
    </div>
  );
}

function Metric({ label, value, color, unit, tip }) {
  if (value == null) return null;
  return (
    <div style={{ padding: '8px 10px', background: 'var(--bg-1)', borderRadius: 7 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 3, letterSpacing: '0.06em', display: 'flex', alignItems: 'center' }}>
        {label}
        {tip && <InfoTip {...tip} />}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: color || 'var(--text-0)' }}>
        {value}
        {unit && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-3)', marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  );
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`;
}

function ActivityDetailChart({ activity, ftp, typeColor }) {
  const zone = activity._zone;
  const intensity = activity._intensity;

  // Build a simple bar chart: estimated effort in each zone segment
  // Uses IF to estimate the zone the bulk of the ride was in, with realistic warmup/cooldown
  const durationMin = activity._durationMin || 0;
  if (!durationMin) return null;

  // Estimate effort distribution from IF / zone
  const ifVal = intensity || 0.70;
  const warmupPct   = Math.max(0.08, Math.min(0.20, 15 / Math.max(1, durationMin)));
  const cooldownPct = Math.max(0.05, Math.min(0.15, 10 / Math.max(1, durationMin)));
  const mainPct     = 1 - warmupPct - cooldownPct;
  const mainIF      = Math.min(1.45, ifVal * 1.05); // main block slightly above average

  const segments = [
    { name: 'Warm-up', if: ifVal * 0.72, min: Math.round(warmupPct * durationMin) },
    { name: 'Main',    if: mainIF,        min: Math.round(mainPct   * durationMin) },
    { name: 'Cool-down', if: ifVal * 0.60, min: Math.round(cooldownPct * durationMin) },
  ];

  const barData = segments.map(s => ({
    name: s.name,
    duration: s.min,
    intensity: Math.round(s.if * 100),
  }));

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>EFFORT ESTIMATE</div>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={barData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="20%">
          <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--font-sans)' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 160]} tick={{ fill: 'var(--text-3)', fontSize: 9, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
          <RechartsTip
            formatter={(v, n) => n === 'intensity' ? [`${v}% FTP`, 'Intensity'] : [`${v} min`, 'Duration']}
            contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
          />
          {ftp && <ReferenceLine y={100} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" label={{ value: 'FTP', fill: 'var(--text-3)', fontSize: 9, position: 'right' }} />}
          <Bar dataKey="intensity" name="intensity" fill={typeColor || 'var(--brand)'} opacity={0.85} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginTop: 2, textAlign: 'center' }}>
        Estimated from avg power · actual effort may vary
      </div>
    </div>
  );
}

export default function Activities({ activities, loading, athlete }) {
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [filterType, setFilterType] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const ftp = athlete?.ftp || athlete?.icu_ftp || athlete?.ftp_watts || null;

  const processed = useMemo(() => {
    if (!activities) return [];
    return activities
      .map(a => {
        const watts = a.icu_average_watts || a.average_watts || null;
        const normalizedWatts = a.icu_normalized_watts || a.weighted_average_watts || watts;
        const hr = a.average_heartrate || null;
        const maxHr = a.max_heartrate || null;
        const duration = a.moving_time || a.elapsed_time || a.icu_moving_time || 0;
        const durationMin = duration / 60;
        const tss = a.icu_training_load || a.training_load || null;
        const type = a.type || a.sport_type || a.sport || '';
        const name = a.name || a.description || '';
        const distance = a.distance ? (a.distance / 1000) : null;
        const elevGain = a.total_elevation_gain || null;

        // Normalize intensity factor — handles decimal (0.75) and percentage (75) formats
        const icuIF = normalizeIF(a.icu_intensity);
        const computedIF = normalizedWatts && ftp ? normalizedWatts / ftp : null;
        const intensity = icuIF ?? computedIF;

        // Zone: power-based first, HR fallback
        const zone = zoneFromIF(intensity)
          || zoneFromHR(hr, maxHr, 50);

        const workoutType = detectWorkoutType(a, zone, durationMin);
        const ef = watts && hr ? watts / hr : null;

        return {
          ...a,
          _name: name || type || 'Activity',
          _type: type,
          _tss: tss,
          _duration: duration,
          _durationMin: durationMin,
          _watts: watts,
          _normalizedWatts: normalizedWatts,
          _hr: hr,
          _maxHr: maxHr,
          _distance: distance,
          _elevGain: elevGain,
          _intensity: intensity,
          _zone: zone,
          _workoutType: workoutType,
          ef,
          dateStr: String(a.start_date_local || '').slice(0, 10),
        };
      })
      .filter(a => filterType === 'all' || a._type === filterType);
  }, [activities, filterType, ftp]);

  const sorted = useMemo(() => {
    const arr = [...processed];
    arr.sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case 'date': va = a.start_date_local || ''; vb = b.start_date_local || ''; break;
        case 'tss': va = a._tss || 0; vb = b._tss || 0; break;
        case 'duration': va = a._duration || 0; vb = b._duration || 0; break;
        case 'watts': va = a._watts || 0; vb = b._watts || 0; break;
        default: va = 0; vb = 0;
      }
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return arr;
  }, [processed, sortField, sortDir]);

  const types = useMemo(() => {
    if (!activities) return [];
    const set = new Set(activities.map(a => a.type || a.sport_type || a.sport).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [activities]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  if (loading && processed.length === 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading activities...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Activities</div>
          <div className="page-subtitle">{sorted.length} activities — last 90 days</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {types.map(t => (
            <button
              key={t}
              className={`btn ${filterType === t ? 'btn-primary' : ''}`}
              onClick={() => setFilterType(t)}
              style={{ padding: '5px 10px', fontSize: 11 }}
            >
              {t === 'all' ? 'All' : t}
            </button>
          ))}
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            {[
              { id: 'date', label: 'Date' },
              { id: 'tss', label: 'TSS' },
              { id: 'duration', label: 'Time' },
              { id: 'watts', label: 'Power' },
            ].map(s => (
              <button
                key={s.id}
                className={`btn ${sortField === s.id ? 'btn-primary' : ''}`}
                onClick={() => handleSort(s.id)}
                style={{ padding: '5px 10px', fontSize: 11 }}
              >
                {s.label} {sortField === s.id ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(a => {
          const zone = a._zone;
          const color = zone ? ZONE_COLORS[zone] : 'var(--border)';
          const typeColor = a._workoutType ? WORKOUT_TYPE_COLOR[a._workoutType] : color;
          const isExpanded = expandedId === a.id;

          return (
            <div
              key={a.id}
              style={{
                background: 'var(--bg-1)',
                border: `1px solid ${isExpanded ? typeColor + '55' : 'var(--border)'}`,
                borderLeft: `4px solid ${typeColor}`,
                borderRadius: 10,
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Clickable header */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
                style={{ padding: '14px 16px', cursor: 'pointer' }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a._name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-4)', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                        {a.dateStr}
                      </span>
                      {a._type && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'var(--bg-3)', color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                          {a._type}
                        </span>
                      )}
                      {a._workoutType && (
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 12, padding: '2px 9px', borderRadius: 20,
                          background: `${typeColor}18`, color: typeColor,
                          border: `1px solid ${typeColor}44`,
                          letterSpacing: '0.06em', fontWeight: 600,
                        }}>
                          {WORKOUT_TYPE_LABEL[a._workoutType]}
                        </span>
                      )}
                      {zone && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 7px', borderRadius: 20, background: `${color}12`, color, letterSpacing: '0.06em' }}>
                          {zone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexShrink: 0, marginLeft: 10 }}>
                    {a._duration > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginBottom: 1 }}>TIME</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: typeColor }}>
                          {formatDuration(a._duration)}
                        </div>
                      </div>
                    )}
                    {a._tss != null && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginBottom: 1 }}>TSS</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent-cyan)' }}>
                          {Math.round(a._tss)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Compact metric strip */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {a._watts != null && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>
                      <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{Math.round(a._watts)}W</span>
                      {a._normalizedWatts != null && a._normalizedWatts !== a._watts && ` · NP ${Math.round(a._normalizedWatts)}W`}
                    </span>
                  )}
                  {a._hr != null && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>
                      <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>{Math.round(a._hr)}</span> bpm
                    </span>
                  )}
                  {a._distance != null && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>
                      <span style={{ fontWeight: 700 }}>{a._distance.toFixed(1)}</span> km
                    </span>
                  )}
                  {a._elevGain != null && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>
                      +<span style={{ fontWeight: 700 }}>{Math.round(a._elevGain)}</span>m
                    </span>
                  )}
                  {a._intensity != null && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)' }}>
                      IF <span style={{ fontWeight: 700, color: typeColor }}>{a._intensity.toFixed(2)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
                    {/* Left: effort chart */}
                    <div>
                      <ActivityDetailChart activity={a} ftp={ftp} typeColor={typeColor} />
                    </div>
                    {/* Right: metrics grid */}
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 8 }}>ALL METRICS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {a._duration > 0 && <Metric label="DURATION" value={formatDuration(a._duration)} />}
                        {a._distance != null && <Metric label="DISTANCE" value={a._distance.toFixed(1)} unit="km" />}
                        {a._tss != null && <Metric label="TSS" value={Math.round(a._tss)} color="var(--accent-cyan)" tip={METRICS.TSS} />}
                        {a._watts != null && <Metric label="AVG POWER" value={Math.round(a._watts)} unit="W" color="var(--accent-blue)" />}
                        {a._normalizedWatts != null && a._normalizedWatts !== a._watts && (
                          <Metric label="NP" value={Math.round(a._normalizedWatts)} unit="W" color="var(--accent-cyan)" tip={METRICS.NP} />
                        )}
                        {a._intensity != null && <Metric label="IF" value={a._intensity.toFixed(2)} tip={METRICS.IF} />}
                        {a._hr != null && <Metric label="AVG HR" value={Math.round(a._hr)} unit="bpm" color="var(--accent-red)" />}
                        {a._maxHr != null && <Metric label="MAX HR" value={Math.round(a._maxHr)} unit="bpm" color="var(--accent-orange)" />}
                        {a.ef != null && (
                          <Metric label="EF" value={a.ef.toFixed(3)} color={a.ef > 1.5 ? 'var(--accent-green)' : a.ef < 1.2 ? 'var(--accent-orange)' : 'var(--text-1)'} tip={METRICS.EF} />
                        )}
                        {a._elevGain != null && <Metric label="ELEVATION" value={Math.round(a._elevGain)} unit="m" />}
                      </div>
                    </div>
                  </div>
                  {/* Zone info bar */}
                  {(a._workoutType || zone) && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginTop: 12,
                      background: `${typeColor}0f`, borderRadius: 8,
                      borderLeft: `3px solid ${typeColor}`,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {a._workoutType ? WORKOUT_TYPE_LABEL[a._workoutType] : ZONE_LABELS[zone]}
                          {zone && <InfoTip {...METRICS.ZONE} />}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                          {zone ? `${zone} · ${ZONE_PCT[zone][0]}–${ZONE_PCT[zone][1]}% FTP` : 'Classified by heart rate'}
                          {a._intensity ? ` · IF ${a._intensity.toFixed(2)}` : ''}
                          {!a._intensity && a._hr ? ` · ${Math.round(a._hr)} bpm avg` : ''}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
          No activities found for the selected filter.
        </div>
      )}
    </div>
  );
}
