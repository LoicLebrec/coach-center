import React, { useMemo, useState } from 'react';

export default function Activities({ activities, loading }) {
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [filterType, setFilterType] = useState('all');

  const processed = useMemo(() => {
    if (!activities) return [];
    return activities
      .map(a => ({
        ...a,
        ef: a.icu_average_watts && a.average_heartrate
          ? a.icu_average_watts / a.average_heartrate
          : null,
        dateStr: a.start_date_local?.split('T')[0] || '',
        durationMin: Math.round((a.moving_time || a.elapsed_time || 0) / 60),
      }))
      .filter(a => filterType === 'all' || a.type === filterType);
  }, [activities, filterType]);

  const sorted = useMemo(() => {
    const arr = [...processed];
    arr.sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case 'date': va = a.start_date_local || ''; vb = b.start_date_local || ''; break;
        case 'tss': va = a.icu_training_load || 0; vb = b.icu_training_load || 0; break;
        case 'duration': va = a.moving_time || 0; vb = b.moving_time || 0; break;
        case 'watts': va = a.icu_average_watts || 0; vb = b.icu_average_watts || 0; break;
        case 'hr': va = a.average_heartrate || 0; vb = b.average_heartrate || 0; break;
        case 'ef': va = a.ef || 0; vb = b.ef || 0; break;
        default: va = 0; vb = 0;
      }
      if (sortDir === 'asc') return va > vb ? 1 : -1;
      return va < vb ? 1 : -1;
    });
    return arr;
  }, [processed, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ field, children, align = 'left' }) => (
    <span
      onClick={() => handleSort(field)}
      style={{
        cursor: 'pointer',
        textAlign: align,
        userSelect: 'none',
        color: sortField === field ? 'var(--accent-cyan)' : undefined,
      }}
    >
      {children} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </span>
  );

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}m`;
  };

  // Unique activity types for filter
  const types = useMemo(() => {
    if (!activities) return [];
    const set = new Set(activities.map(a => a.type).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [activities]);

  if (loading && processed.length === 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading activities...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Activities</div>
          <div className="page-subtitle">{sorted.length} activities — last 90 days</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
        </div>
      </div>

      <div className="card" style={{ padding: '12px 0' }}>
        <div className="activity-row activity-row-header" style={{ padding: '0 16px 8px' }}>
          <SortHeader field="date">Date / Name</SortHeader>
          <SortHeader field="tss" align="right">TSS</SortHeader>
          <SortHeader field="duration" align="right">Duration</SortHeader>
          <SortHeader field="watts" align="right">Avg W</SortHeader>
          <SortHeader field="hr" align="right">Avg HR</SortHeader>
          <SortHeader field="ef" align="right">EF</SortHeader>
        </div>

        <div style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          {sorted.map(a => (
            <div className="activity-row" key={a.id}>
              <span className="activity-name">
                <span style={{ color: 'var(--text-2)', fontSize: 10, display: 'block', marginBottom: 2 }}>
                  {a.dateStr}
                </span>
                {a.name || 'Untitled'}
                <span className="type-badge">{a.type}</span>
              </span>
              <span className="activity-data">
                {a.icu_training_load ? Math.round(a.icu_training_load) : '—'}
              </span>
              <span className="activity-data">
                {formatDuration(a.moving_time || a.elapsed_time)}
              </span>
              <span className="activity-data">
                {a.icu_average_watts || a.average_watts || '—'}
              </span>
              <span className="activity-data">
                {a.average_heartrate ? Math.round(a.average_heartrate) : '—'}
              </span>
              <span className="activity-data" style={{
                color: a.ef ? (a.ef > 1.5 ? 'var(--accent-green)' : a.ef < 1.2 ? 'var(--accent-orange)' : 'var(--text-1)') : 'var(--text-2)',
              }}>
                {a.ef ? a.ef.toFixed(3) : '—'}
              </span>
            </div>
          ))}
        </div>

        {sorted.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
            No activities found for the selected filter.
          </div>
        )}
      </div>
    </div>
  );
}
