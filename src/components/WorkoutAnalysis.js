import React, { useState, useCallback } from 'react';
import {
  BarChart, Bar,
  ComposedChart, Line,
  XAxis, YAxis,
  Tooltip as RechartsTip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { intervalsService } from '../services/intervals';
import workoutAnalyzer from '../services/workout-analyzer';

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_COLORS = {
  Z1: '#475569', Z2: '#22c55e', Z3: '#eab308',
  Z4: '#f97316', Z5: '#ef4444', Z6: '#a855f7', Z7: '#8b5cf6',
};
const ZONE_LABELS = {
  Z1: 'Z1 Récup', Z2: 'Z2 Endurance', Z3: 'Z3 Tempo',
  Z4: 'Z4 Seuil', Z5: 'Z5 VO2', Z6: 'Z6 Anaérobie', Z7: 'Z7 Sprint',
};

const RACE_PATTERN = /(race|course|compet|ronde|crit[eé]rium|criterium|[eé]tape|etape)/i;

const TOOLTIP_STYLE = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-1)',
};

// ─── Small shared components ──────────────────────────────────────────────────

function SectionCard({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, badges, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, ...style }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14, color: 'var(--text-0)' }}>
        {title}
      </span>
      {badges}
    </div>
  );
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 20,
      background: bg || 'var(--bg-3)',
      color: color || 'var(--text-2)',
      border: `1px solid ${color ? color + '44' : 'var(--border)'}`,
      letterSpacing: '0.05em',
      fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function StatRow({ stats }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
      {stats.map((s, i) => s.value != null ? (
        <div key={i} style={{
          flex: '1 1 120px',
          background: 'var(--bg-2)',
          borderRadius: 7,
          padding: '8px 10px',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 3, letterSpacing: '0.07em' }}>
            {s.label}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: s.color || 'var(--text-0)' }}>
            {s.value}
            {s.unit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 2 }}>{s.unit}</span>}
          </div>
        </div>
      ) : null)}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m}min${s > 0 ? String(s).padStart(2, '0') + 's' : ''}`;
  return `${s}s`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).slice(0, 10);
}

function complianceColor(pct) {
  if (pct == null) return 'var(--accent-blue)';
  if (pct >= 95) return '#3ecf6e';
  if (pct >= 85) return '#f77f3a';
  return '#f06060';
}

function fatigueColor(fi) {
  if (fi == null) return 'var(--text-2)';
  if (fi > -2) return '#3ecf6e';
  if (fi > -5) return '#f77f3a';
  return '#f06060';
}

function pacingColor(pi) {
  if (pi == null) return 'var(--text-2)';
  return pi >= 0 ? '#3ecf6e' : '#f06060';
}

function isRaceActivity(activity) {
  const type = (activity.type || activity.sport_type || '').toLowerCase();
  const name = activity.name || activity.description || '';
  return type.includes('race') || RACE_PATTERN.test(name);
}

// ─── Section: Interval Set Analysis ──────────────────────────────────────────

function IntervalSetSection({ intervalAnalysis, ftp }) {
  if (!intervalAnalysis || intervalAnalysis.repCount < 2) return null;

  const { reps, repCount, fatigueIndex, avgCompliance, hrSlope, assessment } = intervalAnalysis;

  const hasTargets = reps.some(r => r.targetLow != null || r.targetHigh != null);

  // Build bar chart data
  const chartData = reps.map(r => {
    const targetMid = (r.targetLow != null && r.targetHigh != null)
      ? (r.targetLow + r.targetHigh) / 2
      : r.targetLow ?? r.targetHigh ?? null;

    const complianceVsFirst = reps[0].avgWatts && r.avgWatts
      ? (r.avgWatts / reps[0].avgWatts) * 100
      : null;

    return {
      rep:           r.repNumber,
      label:         r.label || `Rep ${r.repNumber}`,
      actual:        r.avgWatts != null ? Math.round(r.avgWatts) : null,
      target:        targetMid != null ? Math.round(targetMid) : null,
      compliance:    r.compliancePct,
      compVsFirst:   complianceVsFirst,
    };
  });

  const fiColor = fatigueColor(fatigueIndex);
  const fiLabel = fatigueIndex != null ? `${fatigueIndex > 0 ? '+' : ''}${fatigueIndex.toFixed(1)}%/rep` : '—';

  return (
    <SectionCard>
      <SectionHeader
        title="Analyse des intervalles"
        badges={
          <>
            <Badge label={`${repCount} reps`} />
            <Badge
              label={fiLabel}
              color={fiColor}
              bg={fiColor + '18'}
            />
          </>
        }
      />

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="25%">
          <XAxis
            dataKey="rep"
            tick={{ fill: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Rep', position: 'insideBottomRight', fill: 'var(--text-3)', fontSize: 10, offset: 0 }}
          />
          <YAxis
            tick={{ fill: 'var(--text-3)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            unit="W"
          />
          <RechartsTip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => {
              if (name === 'target') return [`${value}W`, 'Cible'];
              if (name === 'actual') return [`${value}W`, 'Réalisé'];
              return [value, name];
            }}
            labelFormatter={label => `Rep ${label}`}
          />
          {ftp && (
            <ReferenceLine
              y={ftp}
              stroke="rgba(255,255,255,0.25)"
              strokeDasharray="4 3"
              label={{ value: 'FTP', fill: 'var(--text-3)', fontSize: 9, position: 'right' }}
            />
          )}

          {hasTargets && (
            <Bar dataKey="target" name="target" fill="var(--accent-blue)" opacity={0.25} radius={[2, 2, 0, 0]} />
          )}
          <Bar dataKey="actual" name="actual" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, index) => {
              const pct = hasTargets ? entry.compliance : entry.compVsFirst;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={complianceColor(pct)}
                  opacity={0.9}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <StatRow stats={[
        {
          label: 'CONFORMITÉ MOY.',
          value: avgCompliance != null ? `${avgCompliance.toFixed(1)}%` : hasTargets ? '—' : 'N/A',
          color: avgCompliance != null ? complianceColor(avgCompliance) : 'var(--text-2)',
        },
        {
          label: 'INDICE FATIGUE',
          value: fiLabel,
          color: fiColor,
        },
        {
          label: 'PENTE FC',
          value: hrSlope != null ? `${hrSlope > 0 ? '+' : ''}${hrSlope.toFixed(1)} bpm/rep` : '—',
          color: hrSlope != null && hrSlope > 2 ? '#f06060' : 'var(--text-2)',
        },
      ]} />

      <div style={{
        marginTop: 12,
        padding: '10px 12px',
        background: 'var(--bg-2)',
        borderRadius: 7,
        borderLeft: `3px solid ${fiColor}`,
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: 'var(--text-2)',
        lineHeight: 1.5,
      }}>
        {assessment}
      </div>
    </SectionCard>
  );
}

// ─── Section: Fatigue Curve ───────────────────────────────────────────────────

function FatigueCurveSection({ fatigueCurve }) {
  if (!fatigueCurve || !fatigueCurve.curve || fatigueCurve.curve.length < 10) return null;

  const { curve, medianNP, durationMin, npDrop, hrRise } = fatigueCurve;
  const hasHR = curve.some(pt => pt.hr != null);

  const durationBadge = durationMin != null
    ? `${Math.floor(durationMin / 60) > 0 ? Math.floor(durationMin / 60) + 'h' : ''}${Math.round(durationMin % 60)}min`
    : null;

  // Y axis domains
  const npValues = curve.map(p => p.np).filter(v => v > 0);
  const hrValues = curve.map(p => p.hr).filter(v => v != null && v > 0);
  const npMin = Math.max(0, Math.min(...npValues) - 20);
  const npMax = Math.max(...npValues) + 20;
  const hrMin = hrValues.length ? Math.max(40, Math.min(...hrValues) - 10) : 0;
  const hrMax = hrValues.length ? Math.min(220, Math.max(...hrValues) + 10) : 220;

  return (
    <SectionCard>
      <SectionHeader
        title="Courbe de fatigue"
        badges={
          <>
            {durationBadge && <Badge label={durationBadge} />}
            {medianNP > 0 && <Badge label={`NP méd. ${medianNP}W`} color="var(--accent-cyan)" bg="rgba(34,211,238,0.1)" />}
          </>
        }
      />

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={curve} margin={{ top: 4, right: hasHR ? 40 : 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="timeMin"
            tick={{ fill: 'var(--text-3)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${v}min`}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="np"
            orientation="left"
            domain={[npMin, npMax]}
            tick={{ fill: 'var(--text-3)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            unit="W"
          />
          {hasHR && (
            <YAxis
              yAxisId="hr"
              orientation="right"
              domain={[hrMin, hrMax]}
              tick={{ fill: 'var(--text-3)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              unit="bpm"
            />
          )}
          <RechartsTip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => {
              if (name === 'np') return [`${value}W`, 'NP roulante'];
              if (name === 'hr') return [`${value} bpm`, 'FC roulante'];
              return [value, name];
            }}
            labelFormatter={v => `${v} min`}
          />
          {medianNP > 0 && (
            <ReferenceLine
              yAxisId="np"
              y={medianNP}
              stroke="rgba(34,211,238,0.4)"
              strokeDasharray="5 3"
              label={{ value: 'Médiane', fill: 'var(--accent-cyan)', fontSize: 9, position: 'left' }}
            />
          )}
          <Line
            yAxisId="np"
            type="monotone"
            dataKey="np"
            stroke="var(--accent-blue)"
            dot={false}
            strokeWidth={2}
            name="np"
            isAnimationActive={false}
          />
          {hasHR && (
            <Line
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              stroke="var(--accent-red)"
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              name="hr"
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <StatRow stats={[
        {
          label: 'NP MÉDIANE',
          value: medianNP > 0 ? medianNP : null,
          unit: 'W',
          color: 'var(--accent-cyan)',
        },
        {
          label: 'CHUTE NP',
          value: npDrop != null ? `${npDrop > 0 ? '+' : ''}${npDrop.toFixed(1)}%` : null,
          color: npDrop != null && npDrop < -5 ? '#f06060' : npDrop != null && npDrop < -2 ? '#f77f3a' : '#3ecf6e',
        },
        {
          label: 'HAUSSE FC',
          value: hrRise != null ? `${hrRise > 0 ? '+' : ''}${hrRise.toFixed(1)} bpm` : null,
          color: hrRise != null && hrRise > 10 ? '#f06060' : hrRise != null && hrRise > 5 ? '#f77f3a' : 'var(--text-2)',
        },
      ]} />
    </SectionCard>
  );
}

// ─── Section: Race Analysis ───────────────────────────────────────────────────

function ZoneBar({ zoneDistribution }) {
  const zones = Object.keys(zoneDistribution);
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 6 }}>
        DISTRIBUTION DE ZONES
      </div>
      <div style={{
        display: 'flex',
        height: 20,
        borderRadius: 5,
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}>
        {zones.map(z => {
          const pct = zoneDistribution[z];
          if (!pct || pct < 0.5) return null;
          return (
            <div
              key={z}
              title={`${ZONE_LABELS[z]}: ${pct.toFixed(1)}%`}
              style={{
                width: `${pct}%`,
                background: ZONE_COLORS[z],
                transition: 'width 0.3s ease',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {zones.map(z => {
          const pct = zoneDistribution[z];
          if (!pct || pct < 0.5) return null;
          return (
            <div key={z} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[z] }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                {z} {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchList({ matches }) {
  if (!matches || matches.length === 0) return null;
  const top3 = matches.slice(0, 3);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 6 }}>
        TOP MATCHES
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top3.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 10px',
            background: 'var(--bg-2)',
            borderRadius: 6,
            borderLeft: '3px solid var(--accent-purple)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>
              {formatDuration(m.startSec)} — {formatDuration(m.durationSec)} match
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent-orange)' }}>
                {m.avgWatts}W
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                {m.pctFTP}× FTP
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MMPTable({ mmp, ftp }) {
  if (!mmp) return null;
  const entries = Object.entries(mmp).filter(([, v]) => v.watts != null);
  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 6 }}>
        PUISSANCE MAX MOYENNE (MMP)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${entries.length}, 1fr)`, gap: 5 }}>
        {entries.map(([dur, v]) => (
          <div key={dur} style={{
            background: 'var(--bg-2)',
            borderRadius: 7,
            padding: '6px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>
              {dur}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent-blue)' }}>
              {v.watts}W
            </div>
            {v.pctFTP != null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                {v.pctFTP}× FTP
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PacingRow({ pacing }) {
  if (!pacing) return null;
  const { firstHalfWatts, secondHalfWatts, pacingIndex } = pacing;
  const piColor = pacingColor(pacingIndex);
  const piLabel = pacingIndex != null
    ? `${pacingIndex > 0 ? '+' : ''}${pacingIndex.toFixed(1)}%`
    : '—';
  const piDesc = pacingIndex == null
    ? ''
    : pacingIndex > 2
      ? 'Négatif — bonne gestion de l\'effort'
      : pacingIndex < -5
        ? 'Positif — départ trop rapide'
        : 'Régulier';

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 6 }}>
        ALLURE (1ère moitié vs 2ème moitié)
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, background: 'var(--bg-2)', borderRadius: 7, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>1ÈRE MOITIÉ</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-0)' }}>{firstHalfWatts}W</div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-2)', borderRadius: 7, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>2ÈME MOITIÉ</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-0)' }}>{secondHalfWatts}W</div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-2)', borderRadius: 7, padding: '8px 10px', textAlign: 'center', borderLeft: `3px solid ${piColor}` }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>INDICE ALLURE</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: piColor }}>{piLabel}</div>
          {piDesc && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{piDesc}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RaceSection({ raceAnalysis, ftp }) {
  if (!raceAnalysis) return null;

  const { zoneDistribution, matchCount, totalMatchDuration, matches, mmp, pacing, wAboveFTP } = raceAnalysis;

  return (
    <SectionCard>
      <SectionHeader
        title="Analyse de course"
        badges={
          <>
            <Badge
              label={`${matchCount} match${matchCount !== 1 ? 's' : ''}`}
              color="var(--accent-purple)"
              bg="rgba(155,121,245,0.12)"
            />
            {totalMatchDuration > 0 && (
              <Badge label={formatDuration(totalMatchDuration) + ' ≥150% FTP'} />
            )}
          </>
        }
      />

      <ZoneBar zoneDistribution={zoneDistribution} />

      <StatRow stats={[
        {
          label: 'TEMPS AU-DESSUS FTP',
          value: wAboveFTP != null ? `${wAboveFTP.toFixed(1)}%` : null,
          color: wAboveFTP > 30 ? '#f06060' : wAboveFTP > 15 ? '#f77f3a' : 'var(--text-2)',
        },
        {
          label: 'MATCHES BRÛLÉS',
          value: matchCount,
          color: matchCount > 20 ? '#f06060' : matchCount > 10 ? '#f77f3a' : 'var(--accent-green)',
        },
        {
          label: 'DURÉE TOTALE MATCHES',
          value: totalMatchDuration > 0 ? formatDuration(totalMatchDuration) : '0s',
          color: 'var(--accent-orange)',
        },
      ]} />

      <MatchList matches={matches} />
      <MMPTable mmp={mmp} ftp={ftp} />
      <PacingRow pacing={pacing} />
    </SectionCard>
  );
}

// ─── Activity Selector ────────────────────────────────────────────────────────

function ActivitySelector({ activities, selectedId, onChange }) {
  const eligible = (activities || [])
    .filter(a => (a.icu_average_watts || a.average_watts || 0) > 0)
    .slice(0, 30);

  const selectedActivity = eligible.find(a => String(a.id) === String(selectedId));
  const isRace = selectedActivity ? isRaceActivity(selectedActivity) : false;
  const tss = selectedActivity
    ? (selectedActivity.icu_training_load || selectedActivity.training_load)
    : null;
  const duration = selectedActivity
    ? (selectedActivity.moving_time || selectedActivity.elapsed_time || selectedActivity.icu_moving_time)
    : null;
  const type = selectedActivity
    ? (selectedActivity.type || selectedActivity.sport_type || '')
    : '';

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>
        SÉLECTIONNER UNE ACTIVITÉ
      </div>
      <select
        value={selectedId || ''}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text-0)',
          padding: '8px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          width: '100%',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
        }}
      >
        <option value="" disabled>— Choisir une activité —</option>
        {eligible.map(a => {
          const watts = a.icu_average_watts || a.average_watts || 0;
          const date  = formatDate(a.start_date_local);
          const tss   = a.icu_training_load || a.training_load;
          const name  = a.name || a.description || 'Activité';
          return (
            <option key={a.id} value={String(a.id)}>
              {date}  {name}  · {Math.round(watts)}W{tss ? `  · TSS ${Math.round(tss)}` : ''}
            </option>
          );
        })}
      </select>

      {selectedActivity && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          {type && (
            <Badge label={type} />
          )}
          {isRace && (
            <Badge label="COURSE" color="var(--accent-yellow)" bg="rgba(240,180,41,0.12)" />
          )}
          {tss != null && (
            <Badge label={`TSS ${Math.round(tss)}`} color="var(--accent-cyan)" bg="rgba(34,211,238,0.1)" />
          )}
          {duration != null && (
            <Badge label={formatDuration(duration)} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section: Planned vs Actual ──────────────────────────────────────────────

const ZONE_COLORS_PVA = { Z1:'#475569', Z2:'#22c55e', Z3:'#eab308', Z4:'#f97316', Z5:'#ef4444', Z6:'#a855f7', Z7:'#8b5cf6' };
const ZONE_PCT_PVA    = { Z1:[45,55], Z2:[56,75], Z3:[76,90], Z4:[91,105], Z5:[106,120], Z6:[121,150], Z7:[151,200] };

function PlannedVsActualSection({ plannedEvent, activity, ftp }) {
  if (!activity) return null;
  const blocks = plannedEvent?.workoutBlocks || [];
  const totalPlannedMin = blocks.reduce((s, b) => s + (Number(b.durationMin) || 0), 0);
  const plannedTSS = plannedEvent?.estimatedTSS || plannedEvent?.icu_training_load || null;
  const actualTSS  = activity.icu_training_load || activity.training_load || null;
  const actualDur  = activity.moving_time || activity.elapsed_time || 0;
  const actualWatts = activity.icu_average_watts || activity.average_watts || null;
  const actualNP    = activity.icu_normalized_watts || activity.weighted_average_watts || null;
  const actualIF    = ftp && actualNP ? (actualNP / ftp) : null;

  const tssCompliance = plannedTSS && actualTSS ? Math.round((actualTSS / plannedTSS) * 100) : null;
  const compColor = tssCompliance == null ? 'var(--text-2)' : tssCompliance >= 95 ? '#3ecf6e' : tssCompliance >= 80 ? '#f77f3a' : '#f06060';

  return (
    <SectionCard style={{ marginBottom: 14 }}>
      <SectionHeader
        title="Prévu vs Réalisé"
        badges={
          tssCompliance != null && (
            <Badge
              label={`Compliance ${tssCompliance}%`}
              color={compColor}
              bg={compColor + '18'}
            />
          )
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Planned */}
        <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '12px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 8 }}>
            PRÉVU {plannedEvent ? `· ${plannedEvent.title || plannedEvent.name || ''}` : '· Non planifié'}
          </div>
          {blocks.length > 0 ? (
            <>
              <div style={{ display: 'flex', height: 36, borderRadius: 6, overflow: 'hidden', marginBottom: 8, gap: 2 }}>
                {blocks.map((b, i) => {
                  const pct = ((Number(b.durationMin) || 0) / Math.max(1, totalPlannedMin)) * 100;
                  const zId = String(b.zone || 'Z2').toUpperCase();
                  const color = ZONE_COLORS_PVA[zId] || '#22c55e';
                  const zonePct = ZONE_PCT_PVA[zId] || ZONE_PCT_PVA.Z2;
                  const barH = Math.max(20, Math.round(((zonePct[0] + zonePct[1]) / 2) / 2));
                  return (
                    <div key={i} style={{ width: `${Math.max(2, pct)}%`, display: 'flex', alignItems: 'flex-end' }} title={`${b.label} · ${b.durationMin}min @ ${zId}`}>
                      <div style={{ width: '100%', height: `${barH}%`, background: color, opacity: 0.85, borderRadius: '3px 3px 0 0' }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {blocks.map((b, i) => {
                  const zId = String(b.zone || 'Z2').toUpperCase();
                  const color = ZONE_COLORS_PVA[zId] || '#22c55e';
                  const pct = ZONE_PCT_PVA[zId] || ZONE_PCT_PVA.Z2;
                  const loW = ftp ? Math.round((pct[0] / 100) * ftp) : null;
                  const hiW = ftp ? Math.round((pct[1] / 100) * ftp) : null;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, borderLeft: `2px solid ${color}`, paddingLeft: 6 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{b.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                        {b.durationMin}min{loW ? ` · ${loW}–${hiW}W` : ` · ${zId}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              {totalPlannedMin > 0 && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 6, textAlign: 'right' }}>
                  {totalPlannedMin} min{plannedTSS ? ` · ~${Math.round(plannedTSS)} TSS` : ''}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-mono)', padding: '8px 0' }}>
              Aucune séance planifiée ce jour-là
            </div>
          )}
        </div>

        {/* Actual */}
        <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: '12px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 8 }}>
            RÉALISÉ · {activity.name || 'Activité'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {actualWatts != null && (
              <div style={{ background: 'var(--bg-3)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginBottom: 2 }}>MOY PUISSANCE</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--accent-blue)' }}>{Math.round(actualWatts)}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)', marginLeft: 2 }}>W</span></div>
              </div>
            )}
            {actualNP != null && (
              <div style={{ background: 'var(--bg-3)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginBottom: 2 }}>NP</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--accent-cyan)' }}>{Math.round(actualNP)}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)', marginLeft: 2 }}>W</span></div>
              </div>
            )}
            {actualIF != null && (
              <div style={{ background: 'var(--bg-3)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginBottom: 2 }}>IF</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-0)' }}>{actualIF.toFixed(2)}</div>
              </div>
            )}
            {actualTSS != null && (
              <div style={{ background: 'var(--bg-3)', borderRadius: 6, padding: '8px 10px', borderLeft: tssCompliance != null ? `3px solid ${compColor}` : undefined }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginBottom: 2 }}>TSS RÉEL</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: compColor }}>{Math.round(actualTSS)}</div>
              </div>
            )}
          </div>
          {actualDur > 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 6, textAlign: 'right' }}>
              {formatDuration(actualDur)}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkoutAnalysis({ activities, athlete, plannedEvents }) {
  const ftp = athlete?.icu_ftp || athlete?.ftp || null;

  const [selectedId, setSelectedId]             = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [matchedPlan, setMatchedPlan]           = useState(null);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState(null);
  const [intervalAnalysis, setIntervalAnalysis] = useState(null);
  const [fatigueCurve, setFatigueCurve]         = useState(null);
  const [raceAnalysis, setRaceAnalysis]         = useState(null);
  const [isRace, setIsRace]                     = useState(false);

  const handleSelect = useCallback(async (id) => {
    if (!id) return;
    setSelectedId(id);
    setLoading(true);
    setError(null);
    setIntervalAnalysis(null);
    setFatigueCurve(null);
    setRaceAnalysis(null);
    setIsRace(false);
    setSelectedActivity(null);
    setMatchedPlan(null);

    try {
      const activity = (activities || []).find(a => String(a.id) === String(id));
      const actIsRace = activity ? isRaceActivity(activity) : false;
      setIsRace(actIsRace);
      setSelectedActivity(activity || null);

      // Match to planned event by date
      if (activity) {
        const actDate = String(activity.start_date_local || '').slice(0, 10);
        const plan = (plannedEvents || []).find(ev => {
          const evDate = String(ev.start_date_local || ev.date || '').slice(0, 10);
          return evDate === actDate;
        }) || null;
        setMatchedPlan(plan);
      }

      // Fetch streams and intervals in parallel
      const [rawStreams, rawIntervals] = await Promise.all([
        intervalsService.getActivityStreams(id, ['watts', 'heartrate', 'cadence']),
        intervalsService.getActivityIntervals(id).catch(() => []),
      ]);

      // Run all analyzers
      const curve    = workoutAnalyzer.computeFatigueCurve(rawStreams);
      const ivSet    = workoutAnalyzer.analyzeIntervalSet(rawIntervals, ftp);
      const race     = actIsRace && ftp
        ? workoutAnalyzer.analyzeRace(rawStreams, ftp)
        : null;

      setFatigueCurve(curve);
      setIntervalAnalysis(ivSet);
      setRaceAnalysis(race);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  }, [activities, ftp]);

  const eligible = (activities || []).filter(a => (a.icu_average_watts || a.average_watts || 0) > 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Analyse de séance</div>
        <div className="page-subtitle">
          Intervalles · Courbe de fatigue · Analyse de course
        </div>
      </div>

      {eligible.length === 0 ? (
        <SectionCard>
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
            Aucune activité avec données de puissance disponible.
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard style={{ marginBottom: 14 }}>
            <ActivitySelector
              activities={activities}
              selectedId={selectedId}
              onChange={handleSelect}
            />
            {!ftp && (
              <div style={{
                marginTop: 8, padding: '8px 12px',
                background: 'rgba(247,127,58,0.1)',
                border: '1px solid rgba(247,127,58,0.3)',
                borderRadius: 7,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--accent-orange)',
              }}>
                FTP non configuré — les analyses de conformité et de course ne seront pas disponibles.
              </div>
            )}
          </SectionCard>

          <PlannedVsActualSection
            plannedEvent={matchedPlan}
            activity={selectedActivity}
            ftp={ftp}
          />

          {loading && (
            <div className="loading-state">
              <div className="loading-spinner" />
            </div>
          )}

          {error && (
            <SectionCard>
              <div style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {error}
              </div>
            </SectionCard>
          )}

          {!loading && !error && selectedId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {intervalAnalysis && intervalAnalysis.repCount >= 2 && (
                <IntervalSetSection intervalAnalysis={intervalAnalysis} ftp={ftp} />
              )}

              {fatigueCurve && fatigueCurve.curve && fatigueCurve.curve.length >= 10 ? (
                <FatigueCurveSection fatigueCurve={fatigueCurve} />
              ) : (
                !intervalAnalysis && (
                  <SectionCard>
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      Données de puissance insuffisantes pour l'analyse.
                    </div>
                  </SectionCard>
                )
              )}

              {isRace && raceAnalysis && (
                <RaceSection raceAnalysis={raceAnalysis} ftp={ftp} />
              )}
            </div>
          )}

          {!loading && !error && !selectedId && (
            <SectionCard>
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>
                Sélectionnez une activité pour lancer l'analyse.
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
