import React, { useMemo, useState } from 'react';

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

function Metric({ label, value, color, unit }) {
  if (value == null) return null;
  return (
    <div style={{ padding: '8px 10px', background: 'var(--bg-1)', borderRadius: 7 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginBottom: 3, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: color || 'var(--text-0)' }}>
        {value}
        {unit && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)', marginLeft: 2 }}>{unit}</span>}
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

export default function Activities({ activities, loading, athlete }) {
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [filterType, setFilterType] = useState('all');

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
        const tss = a.icu_training_load || a.training_load || null;
        const type = a.type || a.sport_type || a.sport || '';
        const name = a.name || a.description || '';
        const distance = a.distance ? (a.distance / 1000) : null;
        const elevGain = a.total_elevation_gain || null;
        const intensity = a.icu_intensity || (normalizedWatts && ftp ? normalizedWatts / ftp : null);
        const zone = zoneFromIF(intensity);
        const ef = watts && hr ? watts / hr : null;

        return {
          ...a,
          _name: name || type || 'Activity',
          _type: type,
          _tss: tss,
          _duration: duration,
          _watts: watts,
          _normalizedWatts: normalizedWatts,
          _hr: hr,
          _maxHr: maxHr,
          _distance: distance,
          _elevGain: elevGain,
          _intensity: intensity,
          _zone: zone,
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

          return (
            <div
              key={a.id}
              style={{
                background: 'var(--bg-1)',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${color}`,
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)', marginBottom: 4 }}>
                    {a._name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                      {a.dateStr}
                    </span>
                    {a._type && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-3)', color: 'var(--text-2)', letterSpacing: '0.06em' }}>
                        {a._type.toUpperCase()}
                      </span>
                    )}
                    {zone && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${color}18`, color, letterSpacing: '0.06em', fontWeight: 600 }}>
                        {zone} · {ZONE_LABELS[zone]}
                      </span>
                    )}
                  </div>
                </div>
                {a._tss != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 2 }}>TSS</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--accent-cyan)' }}>
                      {Math.round(a._tss)}
                    </div>
                  </div>
                )}
              </div>

              {/* Intensity bar */}
              <ActivityIntensityBar zone={zone} durationSec={a._duration} />

              {/* Zone label row */}
              {zone && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  background: `${color}0f`, borderRadius: 6, marginBottom: 10,
                  borderLeft: `3px solid ${color}`,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>
                      {ZONE_LABELS[zone]}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                      {zone} · {ZONE_PCT[zone][0]}–{ZONE_PCT[zone][1]}% FTP
                      {ftp && a._watts ? ` · ~${Math.round(a._watts)}W avg` : ''}
                      {a._intensity ? ` · IF ${a._intensity.toFixed(2)}` : ''}
                    </div>
                  </div>
                  {a._duration > 0 && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color }}>
                      {formatDuration(a._duration)}
                    </div>
                  )}
                </div>
              )}

              {/* Metrics grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 6 }}>
                {a._duration > 0 && !zone && (
                  <Metric label="DURATION" value={formatDuration(a._duration)} />
                )}
                {a._watts != null && (
                  <Metric label="AVG POWER" value={Math.round(a._watts)} unit="W" color="var(--accent-blue)" />
                )}
                {a._normalizedWatts != null && a._normalizedWatts !== a._watts && (
                  <Metric label="NP" value={Math.round(a._normalizedWatts)} unit="W" color="var(--accent-cyan)" />
                )}
                {a._hr != null && (
                  <Metric label="AVG HR" value={Math.round(a._hr)} unit="bpm" color="var(--accent-red)" />
                )}
                {a._maxHr != null && (
                  <Metric label="MAX HR" value={Math.round(a._maxHr)} unit="bpm" color="var(--accent-orange)" />
                )}
                {a.ef != null && (
                  <Metric label="EF" value={a.ef.toFixed(3)} color={a.ef > 1.5 ? 'var(--accent-green)' : a.ef < 1.2 ? 'var(--accent-orange)' : 'var(--text-1)'} />
                )}
                {a._distance != null && (
                  <Metric label="DISTANCE" value={a._distance.toFixed(1)} unit="km" />
                )}
                {a._elevGain != null && (
                  <Metric label="ELEVATION" value={Math.round(a._elevGain)} unit="m" />
                )}
              </div>
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
