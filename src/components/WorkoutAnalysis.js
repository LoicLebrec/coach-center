import React, { useState, useCallback, useEffect, useMemo } from 'react';
import HelpPopup from './HelpPopup';
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
import { stravaService } from '../services/strava';
import workoutAnalyzer from '../services/workout-analyzer';
import Picto from './Pictos';
import RideInsights from './RideInsights';
import SessionFeedback, { RecentRides, feedbackFor } from './SessionFeedback';
import persistence from '../services/persistence';

// Convert Strava laps array → format expected by workoutAnalyzer.parseIntervals()
function stravaLapsToIntervals(laps) {
  if (!Array.isArray(laps)) return [];
  return laps
    .filter(l => (l.moving_time || 0) > 10)
    .map((l, i) => ({
      group: false,
      type: 'WORK',
      label: l.name || `Lap ${i + 1}`,
      average_watts:     l.average_watts     ?? null,
      max_watts:         l.max_watts         ?? null,
      normalized_watts:  l.weighted_average_watts ?? null,
      average_heartrate: l.average_heartrate ?? null,
      average_cadence:   l.average_cadence   ?? null,
      target_power_low:  null,
      target_power_high: null,
      moving_time:       l.moving_time       ?? l.elapsed_time ?? null,
    }));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_COLORS = {
  Z1: '#475569', Z2: '#22c55e', Z3: '#eab308',
  Z4: '#f97316', Z5: '#ef4444', Z6: '#f43f5e', Z7: '#e11d48',
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
    <div className="ride-card" style={style}>
      {children}
    </div>
  );
}

function SectionHeader({ title, badges, help, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, ...style }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--pine)', display: 'flex', alignItems: 'center' }}>
        {title}
        {help && <HelpPopup {...help} />}
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>
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
        help={{ title: 'Analyse des intervalles', content: [
          { heading: 'Barres bleues', text: 'Puissance cible planifiée pour chaque intervalle (zone de l\'entraînement prévu).' },
          { heading: 'Barres colorées', text: 'Puissance réelle réalisée. Vert = objectif atteint, orange = léger écart, rouge = sous-performance.' },
          { heading: 'Index de fatigue', text: 'Mesure à quel point votre puissance baisse au fil de la séance. Un index élevé indique une mauvaise gestion de l\'effort ou un manque de récupération.' },
        ], tips: ['Comparez systématiquement les intervalles du début et de fin de séance', 'Un IF final > IF initial = bonne progression de la fatigue', 'Sous-performance répétée → réduire les cibles ou augmenter la récupération'] }}
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
        help={{ title: 'Courbe de fatigue', content: [
          { heading: 'Ligne bleue — Puissance normalisée', text: 'NP calculée sur des fenêtres glissantes de 30s tout au long de la séance. Une pente descendante = vous faiblissez.' },
          { heading: 'Ligne rouge — Fréquence cardiaque', text: 'FC moyenne sur chaque segment. Souvent elle monte même si la puissance baisse = découplage aérobie (fatigue cardiovasculaire).' },
          { heading: 'Découplage', text: 'Quand la puissance baisse mais la FC monte, votre cœur travaille plus pour moins de watts. Signe de fatigue ou de déshydratation.' },
        ], tips: ['Une courbe NP plate = excellente gestion de l\'effort', 'FC qui monte sans augmentation de puissance → vous chauffez ou vous déshydratez', 'Comparez plusieurs séances similaires pour voir votre progression'] }}
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
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>
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
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>
        TOP ATTAQUES
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
              {formatDuration(m.startSec)} — {formatDuration(m.durationSec)} attaque
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
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>
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
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>
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
        help={{ title: 'Analyse de course', content: [
          { heading: 'Allumettes brûlées', text: 'Efforts dépassant 150% du FTP pendant ≥ 2 secondes consécutives. Chaque attaque brûlée consomme vos réserves anaérobies. Budget limité — dépensez-les stratégiquement.' },
          { heading: 'MMP — Max Mean Power', text: 'Meilleure puissance moyenne soutenue pour des durées clés (5s, 1min, 5min, 20min). Reflète votre profil de coureur.' },
          { heading: 'Distribution des zones', text: 'Temps passé dans chaque zone. Une course typique = beaucoup de Z2 avec des pics Z5/Z6 dans les moments clés.' },
        ], tips: ['Peu d\'attaques brûlées + bon résultat = gestion des efforts réussie', 'MMP 5min bas = manque de capacité VO2 — travaillez les intervalles 3–6min', '20min MMP ÷ 0.95 ≈ votre FTP estimé'] }}
        badges={
          <>
            <Badge
              label={`${matchCount} attaque${matchCount !== 1 ? 's' : ''}`}
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
          label: 'ATTAQUES BRÛLÉES',
          value: matchCount,
          color: matchCount > 20 ? '#f06060' : matchCount > 10 ? '#f77f3a' : 'var(--accent-green)',
        },
        {
          label: 'DURÉE TOTALE ATTAQUES',
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

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', flex: 1, minWidth: 90 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text-0)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PowerSummarySection({ analysis, ftp, activity }) {
  if (!analysis) return null;
  const { avgWatts, npWatts, maxWatts, intensityFactor, tss, wkg, npWkg, zoneDistribution, mmp, avgHR, maxHR, ef, durationSec } = analysis;

  const zoneData = Object.entries(zoneDistribution || {}).map(([z, v]) => ({
    zone: z, label: ZONE_LABELS[z] || z, pct: v.pct, secs: v.secs, color: ZONE_COLORS[z],
  })).filter(d => d.pct > 0);

  const mmpEntries = Object.entries(mmp || {}).filter(([, v]) => v.watts);

  const ifColor = intensityFactor
    ? intensityFactor > 1.05 ? '#ef4444' : intensityFactor > 0.90 ? '#f97316' : intensityFactor > 0.75 ? '#eab308' : '#22c55e'
    : 'var(--text-0)';

  return (
    <SectionCard>
      <SectionHeader title="Résumé de puissance" help={{ title: 'Métriques de puissance', content: [
        { heading: 'Puissance Normalisée (NP)', text: 'Équivalent physiologique de l\'effort. Plus élevée que la moyenne si le rythme est variable.' },
        { heading: 'Facteur d\'intensité (IF)', text: 'NP ÷ FTP. 0.75 = endurance, 0.90 = tempo, 1.05+ = effort intense.' },
        { heading: 'TSS', text: 'Training Stress Score. 100 = 1h à FTP. Indicateur de charge de la séance.' },
        { heading: 'EF (Efficiency Factor)', text: 'NP ÷ FC moyenne. Mesure l\'efficacité cardiaque. Progresse avec la forme.' },
      ], tips: [
        'IF > 1.05 → effort très intense, récupération longue nécessaire',
        'EF qui monte au fil des semaines = ta forme s\'améliore',
        'TSS > 150 → prévois 2 jours de récupération',
      ]}} />

      {/* Key stats */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {avgWatts > 0 && <StatBox label="Puissance moy." value={`${avgWatts}W`} sub={wkg ? `${wkg} W/kg` : null} />}
        {npWatts > 0 && <StatBox label="NP" value={`${npWatts}W`} sub={npWkg ? `${npWkg} W/kg` : null} color="var(--accent-orange)" />}
        {intensityFactor && <StatBox label="IF" value={intensityFactor} color={ifColor} sub={intensityFactor > 1 ? 'Au-dessus FTP' : 'Sous FTP'} />}
        {tss != null && <StatBox label="TSS" value={Math.round(tss)} sub={tss > 150 ? 'Charge haute' : tss > 80 ? 'Charge modérée' : 'Charge légère'} />}
        {maxWatts > 0 && <StatBox label="Max" value={`${maxWatts}W`} />}
        {avgHR && <StatBox label="FC moy." value={avgHR} sub={maxHR ? `max ${maxHR}` : null} />}
        {ef && <StatBox label="EF" value={ef} sub="NP/FC" />}
      </div>

      {/* Zone distribution */}
      {zoneData.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginBottom: 8 }}>Temps par zone de puissance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {zoneData.map(d => (
              <div key={d.zone} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: d.color, width: 88, flexShrink: 0 }}>{d.label}</div>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.pct}%`, background: d.color, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', width: 44, textAlign: 'right' }}>
                  {d.pct > 0 ? `${d.pct}%` : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', width: 36, textAlign: 'right' }}>
                  {d.secs >= 3600 ? `${Math.floor(d.secs/3600)}h${String(Math.floor((d.secs%3600)/60)).padStart(2,'0')}` : d.secs >= 60 ? `${Math.floor(d.secs/60)}min` : `${d.secs}s`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MMP table */}
      {mmpEntries.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginBottom: 8 }}>Meilleures puissances</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {mmpEntries.map(([dur, v]) => (
              <div key={dur} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', textAlign: 'center', minWidth: 64 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-4)', marginBottom: 3 }}>{dur}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 800, color: 'var(--accent-orange)' }}>{v.watts}W</div>
                {v.pctFTP && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{v.pctFTP}×FTP</div>}
                {v.wkg && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>{v.wkg} W/kg</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkoutAnalysis({ activities, athlete, plannedEvents, powerCurve = null }) {
  const ftp = athlete?.icu_ftp || athlete?.ftp || null;

  const [selectedId, setSelectedId]             = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState(null);
  const [intervalAnalysis, setIntervalAnalysis]   = useState(null);
  const [fatigueCurve, setFatigueCurve]           = useState(null);
  const [raceAnalysis, setRaceAnalysis]           = useState(null);
  const [activityAnalysis, setActivityAnalysis]   = useState(null);
  const [isRace, setIsRace]                       = useState(false);
  const [rideData, setRideData]                   = useState(null);

  const handleSelect = useCallback(async (id) => {
    if (id == null || id === '') return;
    setSelectedId(id);
    setLoading(true);
    setError(null);
    setIntervalAnalysis(null);
    setFatigueCurve(null);
    setRaceAnalysis(null);
    setActivityAnalysis(null);
    setIsRace(false);
    setRideData(null);
    setSelectedActivity(null);

    try {
      let activity = (activities || []).find(a => String(a.id) === String(id));

      const stravaConnected = stravaService.isConfigured();
      const stravaId = activity?.strava_id || activity?.external_id || null;
      let rawStreams = null;
      let rawIntervals = [];
      let source = 'none';

      // ── Try Strava first — richer second-by-second data ──────────────
      if (stravaConnected && stravaId) {
        try {
          const [stravaStreams, stravaLaps, stravaDetail] = await Promise.allSettled([
            stravaService.getActivityStreams(stravaId, ['watts', 'heartrate', 'cadence', 'velocity_smooth', 'altitude', 'distance', 'time']),
            stravaService.getActivityLaps(stravaId),
            stravaService.getActivity(stravaId),
          ]);

          if (stravaStreams.status === 'fulfilled' && stravaStreams.value) {
            rawStreams = stravaStreams.value;
            source = 'strava';
          }

          if (stravaLaps.status === 'fulfilled' && Array.isArray(stravaLaps.value) && stravaLaps.value.length > 1) {
            rawIntervals = stravaLapsToIntervals(stravaLaps.value);
          }

          // Enrich activity with NP / full metrics from Strava detail
          if (stravaDetail.status === 'fulfilled' && stravaDetail.value) {
            const d = stravaDetail.value;
            activity = {
              ...activity,
              weighted_average_watts:  d.weighted_average_watts  ?? activity?.weighted_average_watts,
              icu_normalized_watts:    d.weighted_average_watts  ?? activity?.icu_normalized_watts,
              average_watts:           d.average_watts           ?? activity?.average_watts,
              icu_average_watts:       d.average_watts           ?? activity?.icu_average_watts,
              average_heartrate:       d.average_heartrate       ?? activity?.average_heartrate,
              max_heartrate:           d.max_heartrate           ?? activity?.max_heartrate,
              total_elevation_gain:    d.total_elevation_gain    ?? activity?.total_elevation_gain,
              moving_time:             d.moving_time             ?? activity?.moving_time,
              icu_training_load:       activity?.icu_training_load ?? null,
            };
          }
        } catch (_) {
          // Strava fetch failed entirely — fall through to ICU
        }
      }

      // ── Fall back to Intervals.icu streams / intervals ────────────────
      if (!rawStreams && intervalsService.isConfigured()) {
        try {
          const [icuStreams, icuIntervals] = await Promise.allSettled([
            intervalsService.getActivityStreams(id, ['watts', 'heartrate', 'cadence', 'altitude', 'distance']),
            intervalsService.getActivityIntervals(id),
          ]);
          if (icuStreams.status === 'fulfilled') rawStreams = icuStreams.value;
          if (icuIntervals.status === 'fulfilled' && Array.isArray(icuIntervals.value) && icuIntervals.value.length > 0) {
            rawIntervals = icuIntervals.value;
            source = 'icu';
          } else if (source === 'none') source = 'icu';
        } catch (_) {}
      }

      if (!rawStreams) throw new Error('Le détail seconde par seconde n’est pas disponible pour cette sortie. Il vient d’Intervals.icu ou de Strava : vérifie la connexion dans les réglages.');

      const actIsRace = activity ? isRaceActivity(activity) : false;
      setIsRace(actIsRace);
      setSelectedActivity(activity || null);

      const curve    = workoutAnalyzer.computeFatigueCurve(rawStreams);
      const ivSet    = workoutAnalyzer.analyzeIntervalSet(rawIntervals, ftp);
      const race     = actIsRace && ftp ? workoutAnalyzer.analyzeRace(rawStreams, ftp) : null;
      const actSummary = ftp ? workoutAnalyzer.analyzeActivity(rawStreams, ftp, activity) : null;

      setFatigueCurve(curve);
      setIntervalAnalysis(ivSet);
      setRaceAnalysis(race);
      setActivityAnalysis(actSummary);
      setRideData({ streams: rawStreams, intervals: workoutAnalyzer.parseIntervals ? workoutAnalyzer.parseIntervals(rawIntervals) : [] });
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  }, [activities, plannedEvents, ftp]);

  const recent = useMemo(() => (activities || [])
    .filter(a => a.start_date_local && /ride|cycl|bike/i.test(String(a.type || 'Ride')) && (a.moving_time || 0) > 300)
    .sort((x, y) => String(y.start_date_local).localeCompare(String(x.start_date_local)))
    .slice(0, 12), [activities]);

  // What Today prescribed on each of these days.
  const [prescriptions, setPrescriptions] = useState({});
  useEffect(() => {
    let alive = true;
    const days = [...new Set(recent.map(a => String(a.start_date_local).slice(0, 10)))];
    Promise.all(days.map(d => persistence.getPref(`prescription-${d}`, null).catch(() => null)))
      .then(list => { if (alive) setPrescriptions(Object.fromEntries(days.map((d, i) => [d, list[i]]).filter(([, v]) => v))); });
    return () => { alive = false; };
  }, [recent]);

  // Open the latest ride straight away.
  useEffect(() => {
    if (selectedId == null && recent.length) handleSelect(recent[0].id);
  }, [recent, selectedId, handleSelect]);

  const selectedDate = selectedActivity ? String(selectedActivity.start_date_local).slice(0, 10)
    : recent.find(a => String(a.id) === String(selectedId))?.start_date_local?.slice(0, 10);
  const feedback = selectedDate ? feedbackFor(selectedDate, activities || [], prescriptions, plannedEvents || []) : null;
  const toneOf = (date) => feedbackFor(date, activities || [], prescriptions, plannedEvents || []).review?.tone || null;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Analyse de séance</div>
        <div className="page-subtitle">Ce que tu as roulé, comparé à ce qui était prévu</div>
      </div>

      {recent.length === 0 ? (
        <SectionCard>
          <p style={{ padding: 16, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
            Aucune sortie vélo récente. Connecte Intervals.icu ou Strava dans les réglages.
          </p>
        </SectionCard>
      ) : (
        <>
          <RecentRides rides={recent} selectedId={selectedId} onSelect={handleSelect} toneOf={toneOf} />

          {feedback && <SessionFeedback date={selectedDate} plan={feedback.plan} review={feedback.review} />}

          {!ftp && (
            <p className="ride-note">FTP non renseignée : l’intensité et la charge ne peuvent pas être calculées.</p>
          )}

          <h2 className="analysis-detail-title">Le détail de la sortie</h2>

          {loading && (
            <div className="loading-state">
              <div className="loading-spinner" />
            </div>
          )}

          {error && (
            <SectionCard>
              <p style={{ color: 'var(--text-1)', fontSize: 14, margin: 0 }}>{error}</p>
            </SectionCard>
          )}

          {!loading && !error && selectedId != null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Always-visible power summary */}
              <PowerSummarySection analysis={activityAnalysis} ftp={ftp} activity={selectedActivity} />

              {rideData && (
                <RideInsights rawStreams={rideData.streams} intervals={rideData.intervals} athlete={athlete}
                  activity={selectedActivity} powerCurve={powerCurve} />
              )}

              {/* Structured intervals (only if detected) */}
              {intervalAnalysis && intervalAnalysis.repCount >= 2 && (
                <IntervalSetSection intervalAnalysis={intervalAnalysis} ftp={ftp} />
              )}

              {/* Fatigue curve (only if enough data) */}
              {fatigueCurve && fatigueCurve.curve && fatigueCurve.curve.length >= 10 && (
                <FatigueCurveSection fatigueCurve={fatigueCurve} />
              )}

              {/* Race analysis (only for races) */}
              {isRace && raceAnalysis && (
                <RaceSection raceAnalysis={raceAnalysis} ftp={ftp} />
              )}

              {/* No data at all */}
              {!activityAnalysis && !intervalAnalysis && !fatigueCurve && !raceAnalysis && (
                <SectionCard>
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    <div style={{ marginBottom: 8 }}><Picto name="signal" size={36} /></div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Pas de données de puissance</div>
                    <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
                      Cette activité n'a pas de données de capteur de puissance ou les streams ne sont pas disponibles.
                    </div>
                  </div>
                </SectionCard>
              )}
            </div>
          )}

          {!loading && !error && selectedId == null && (
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
