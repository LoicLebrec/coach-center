/**
 * Analytics Engine
 * 
 * This module implements the "zero-inference" principle:
 * compute all metrics and trends BEFORE sending to the AI coach.
 * The AI interprets pre-calculated trends, it does NOT analyze raw data.
 * 
 * Scientific basis:
 * - PMC model: Banister (1975) impulse-response model
 * - Efficiency Factor: Coggan & Allen, "Training and Racing with a Power Meter"
 * - Decoupling: Friel, "The Cyclist's Training Bible" 
 * - TSS: Coggan (2003), normalized to 100 for 1hr at FTP
 */

const analytics = {

  // ─── Form State Assessment ────────────────────────────────
  assessFormState(tsb) {
    if (tsb > 25) return { state: 'transition', label: 'Detraining Risk', color: '#94a3b8' };
    if (tsb > 15) return { state: 'fresh', label: 'Race Ready', color: '#22c55e' };
    if (tsb > 5) return { state: 'optimal', label: 'Fresh', color: '#4ade80' };
    if (tsb > -10) return { state: 'neutral', label: 'Neutral', color: '#facc15' };
    if (tsb > -25) return { state: 'tired', label: 'Fatigued', color: '#fb923c' };
    return { state: 'overreaching', label: 'Overreaching', color: '#ef4444' };
  },

  // ─── PMC Trend Analysis ───────────────────────────────────
  computePMCTrend(wellnessData, days = 14) {
    if (!wellnessData || wellnessData.length < 2) return null;

    const recent = wellnessData.slice(-days);
    const mid = Math.floor(recent.length / 2);
    const firstHalf = recent.slice(0, mid);
    const secondHalf = recent.slice(mid);

    const avgCTL = arr => arr.reduce((s, w) => s + (w.icu_ctl || 0), 0) / arr.length;
    const avgATL = arr => arr.reduce((s, w) => s + (w.icu_atl || 0), 0) / arr.length;

    const ctlFirst = avgCTL(firstHalf);
    const ctlSecond = avgCTL(secondHalf);
    const atlFirst = avgATL(firstHalf);
    const atlSecond = avgATL(secondHalf);

    return {
      ctlTrend: ctlSecond - ctlFirst,
      ctlTrendPct: ctlFirst > 0 ? ((ctlSecond - ctlFirst) / ctlFirst * 100) : 0,
      atlTrend: atlSecond - atlFirst,
      atlTrendPct: atlFirst > 0 ? ((atlSecond - atlFirst) / atlFirst * 100) : 0,
      tsbCurrent: (wellnessData[wellnessData.length - 1]?.icu_ctl || 0) - 
                  (wellnessData[wellnessData.length - 1]?.icu_atl || 0),
      periodDays: days,
    };
  },

  // ─── Efficiency Factor Trend ──────────────────────────────
  // EF = Normalized Power / Avg HR
  // A declining EF with static HR suggests aerobic regression
  computeEFTrend(activities, days = 14) {
    if (!activities || activities.length === 0) return null;

    const cycling = activities
      .filter(a => a.type === 'Ride' && a.icu_average_watts && a.average_heartrate)
      .slice(-20);

    if (cycling.length < 2) return null;

    const efValues = cycling.map(a => ({
      date: a.start_date_local,
      ef: (a.icu_average_watts || a.average_watts) / a.average_heartrate,
      np: a.icu_average_watts,
      hr: a.average_heartrate,
    }));

    const mid = Math.floor(efValues.length / 2);
    const firstAvg = efValues.slice(0, mid).reduce((s, v) => s + v.ef, 0) / mid;
    const secondAvg = efValues.slice(mid).reduce((s, v) => s + v.ef, 0) / (efValues.length - mid);

    return {
      values: efValues,
      trend: secondAvg - firstAvg,
      trendPct: firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg * 100) : 0,
      latest: efValues[efValues.length - 1]?.ef || null,
      assessment: secondAvg < firstAvg * 0.97
        ? 'DECLINING: EF has dropped — potential aerobic regression or accumulated fatigue.'
        : secondAvg > firstAvg * 1.03
          ? 'IMPROVING: EF is rising — aerobic fitness is progressing.'
          : 'STABLE: EF is holding steady.',
    };
  },

  // ─── Compliance Score ─────────────────────────────────────
  // Compare target watts (from planned events) vs actual watts
  computeComplianceScore(activities, plannedEvents) {
    if (!activities || !plannedEvents) return null;

    const paired = [];
    for (const act of activities) {
      const planned = plannedEvents.find(e => 
        e.start_date_local?.split('T')[0] === act.start_date_local?.split('T')[0] &&
        e.icu_training_load
      );
      if (planned && act.icu_training_load) {
        paired.push({
          date: act.start_date_local,
          planned: planned.icu_training_load,
          actual: act.icu_training_load,
          ratio: act.icu_training_load / planned.icu_training_load,
        });
      }
    }

    if (paired.length === 0) return null;

    const avgRatio = paired.reduce((s, p) => s + p.ratio, 0) / paired.length;
    return {
      pairs: paired,
      avgCompliance: avgRatio,
      compliancePct: avgRatio * 100,
      assessment: avgRatio < 0.90
        ? `Under-performing: Last ${paired.length} workouts averaged ${(avgRatio * 100).toFixed(0)}% of planned load.`
        : avgRatio > 1.10
          ? `Over-performing: Exceeding plan by ${((avgRatio - 1) * 100).toFixed(0)}%. Monitor fatigue.`
          : `On track: Compliance at ${(avgRatio * 100).toFixed(0)}%.`,
    };
  },

  // ─── Resting Heart Rate Trend ─────────────────────────────
  // Rising RHR = autonomic fatigue / overtraining signal
  computeRHRTrend(wellnessData, days = 14) {
    if (!wellnessData?.length) return null;
    const entries = wellnessData
      .filter(w => w.restingHR > 30 && w.restingHR < 120)
      .slice(-days);
    if (entries.length < 3) return null;

    const mid = Math.floor(entries.length / 2);
    const avg = arr => arr.reduce((s, w) => s + w.restingHR, 0) / arr.length;
    const firstAvg = avg(entries.slice(0, mid));
    const secondAvg = avg(entries.slice(mid));
    const delta = secondAvg - firstAvg;

    return {
      current: entries[entries.length - 1]?.restingHR,
      trend: Math.round(delta * 10) / 10,
      assessment: delta > 5
        ? `ALERT: RHR up ${delta.toFixed(1)} bpm — autonomic fatigue. Mandatory recovery priority.`
        : delta > 2
          ? `WARNING: RHR elevated +${delta.toFixed(1)} bpm. Monitor closely.`
          : 'STABLE: RHR within normal range.',
    };
  },

  // ─── Sleep Trend ──────────────────────────────────────────
  computeSleepTrend(wellnessData, days = 14) {
    if (!wellnessData?.length) return null;
    const entries = wellnessData
      .filter(w => w.sleepSecs > 0 || w.sleepScore > 0)
      .slice(-days);
    if (entries.length < 3) return null;

    const mid = Math.floor(entries.length / 2);
    const avgHrs = arr => arr.filter(w => w.sleepSecs > 0)
      .reduce((s, w) => s + w.sleepSecs, 0) / Math.max(1, arr.filter(w => w.sleepSecs > 0).length) / 3600;

    const firstHrs = avgHrs(entries.slice(0, mid));
    const secondHrs = avgHrs(entries.slice(mid));
    const scoreEntries = entries.filter(w => w.sleepScore > 0);
    const latestScore = scoreEntries.length
      ? scoreEntries.slice(-3).reduce((s, w) => s + w.sleepScore, 0) / Math.min(3, scoreEntries.slice(-3).length)
      : null;

    const current = secondHrs > 0 ? secondHrs : null;
    return {
      avgHoursLast7d: current ? Math.round(current * 10) / 10 : null,
      trend: current && firstHrs > 0 ? Math.round((current - firstHrs) * 10) / 10 : null,
      latestScore: latestScore ? Math.round(latestScore) : null,
      assessment: current === null
        ? 'NO SLEEP DATA: Enable sleep tracking for recovery-aware coaching.'
        : current < 6.5
          ? `SLEEP DEBT: Avg ${current.toFixed(1)}h — adaptation blocked. Cap intensity, no quality work.`
          : current < 7.5
            ? `MARGINAL: Avg ${current.toFixed(1)}h sleep. Aim for 7.5–9h for peak adaptation.`
            : `GOOD: Avg ${current.toFixed(1)}h sleep — recovery window open.`,
    };
  },

  // ─── Intensity Distribution — Seiler 3-Zone Model ────────
  // Based on: Seiler & Kjerland (2006), Seiler (2010, IJSPP)
  // Muñoz et al. (2014): polarized > threshold for endurance performance
  //
  // Zone 1: IF < 0.75   → below LT1 (first lactate threshold)
  // Zone 2: IF 0.75–0.88 → LT1 to LT2 ("grey zone": tempo/sweet spot)
  // Zone 3: IF > 0.88   → above LT2 (threshold, VO2max, anaerobic)
  //
  // Elite target: ~80% Z1, <5% Z2, ~15-20% Z3 (Seiler 2010)
  // "Grey zone" (Z2) appears productive but accumulates chronic fatigue
  // without adequate aerobic stimulus.
  computeIntensityDistribution(activities, ftp, weeks = 8) {
    if (!activities?.length || !ftp) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    const recent = activities.filter(a => {
      const d = new Date(a.start_date_local);
      return d >= cutoff && (a.type === 'Ride' || a.type === 'VirtualRide' || a.type === 'Run');
    });
    if (recent.length < 3) return null;

    let z1TSS = 0, z2TSS = 0, z3TSS = 0;
    for (const a of recent) {
      const tss = a.icu_training_load || 0;
      if (tss === 0) continue;
      // Use icu_intensity (IF) from ICU directly, or compute from NP/FTP
      const ifValue = a.icu_intensity
        || ((a.icu_normalized_watts || a.weighted_average_watts) && ftp
          ? (a.icu_normalized_watts || a.weighted_average_watts) / ftp
          : null);
      if (ifValue) {
        if (ifValue < 0.75) z1TSS += tss;
        else if (ifValue < 0.88) z2TSS += tss;
        else z3TSS += tss;
      }
    }

    const total = z1TSS + z2TSS + z3TSS;
    if (total === 0) return null;

    const z1Pct = Math.round(z1TSS / total * 100);
    const z2Pct = Math.round(z2TSS / total * 100);
    const z3Pct = 100 - z1Pct - z2Pct;

    // Seiler model: ideal is ~80% Z1, <5% Z2, ~15-20% Z3
    const greyZoneExcess = z2Pct > 15;
    const z1Deficit = z1Pct < 70;
    const z3Excess = z3Pct > 30;

    let assessment;
    if (greyZoneExcess && z1Deficit) {
      assessment = `GREY ZONE TRAP (Seiler 2010): ${z2Pct}% in tempo/sweet-spot. This zone feels productive but chronically accumulates fatigue without aerobic adaptation. Shift volume to Z1 (<${Math.round(ftp * 0.75)}W) and sharpen with Z3 intervals.`;
    } else if (z3Excess) {
      assessment = `INTENSITY-OVERLOADED: ${z3Pct}% Z3+ TSS. Risk of non-functional overreaching. Add 2-3 pure Z1 sessions before next quality block.`;
    } else if (z1Pct >= 75 && z2Pct <= 10) {
      assessment = `POLARIZED: Z1:${z1Pct}% Z2:${z2Pct}% Z3:${z3Pct}% — matches Seiler elite distribution. Maintain.`;
    } else {
      assessment = `THRESHOLD-BIASED: Z1:${z1Pct}% Z2:${z2Pct}% Z3:${z3Pct}%. Reduce grey-zone volume. Target Z1≥80%, Z2<10%, Z3 15-20%.`;
    }

    return {
      z1Pct, z2Pct, z3Pct,
      z1Watts: `<${Math.round(ftp * 0.75)}W`,
      z2Watts: `${Math.round(ftp * 0.75)}–${Math.round(ftp * 0.88)}W`,
      z3Watts: `>${Math.round(ftp * 0.88)}W`,
      weeksAnalyzed: weeks,
      model: 'Seiler 3-zone (2010)',
      assessment,
    };
  },

  // ─── ACWR — Acute:Chronic Workload Ratio ─────────────────
  // Gabbett (2016, BJSM): "The training-injury prevention paradox"
  // Hulin et al. (2016): sweet spot 0.8–1.3, danger zone >1.5
  // Using PMC ATL/CTL as proxy (Coggan) — equivalent to 7-day/42-day ratio
  computeACWR(wellnessData) {
    if (!wellnessData?.length) return null;
    const latest = wellnessData[wellnessData.length - 1];
    const atl = latest?.icu_atl;
    const ctl = latest?.icu_ctl;
    if (!atl || !ctl || ctl === 0) return null;

    const ratio = Math.round(atl / ctl * 100) / 100;
    let zone, assessment;
    if (ratio < 0.8) {
      zone = 'detraining';
      assessment = `DETRAINING (ACWR ${ratio}): Load too low relative to fitness base. Increase volume — deconditioning risk (Hulin 2016).`;
    } else if (ratio <= 1.3) {
      zone = 'optimal';
      assessment = `OPTIMAL ACWR ${ratio} — in the 0.8–1.3 sweet spot (Hulin 2016). Safe to build load.`;
    } else if (ratio <= 1.5) {
      zone = 'caution';
      assessment = `CAUTION: ACWR ${ratio} approaching danger threshold. Load is high relative to fitness base. No further spikes.`;
    } else {
      zone = 'danger';
      assessment = `DANGER ZONE: ACWR ${ratio} exceeds 1.5 threshold (Hulin 2016). High injury/illness risk. Immediate load reduction required.`;
    }

    return { ratio, zone, assessment };
  },

  // ─── Training Monotony & Strain ───────────────────────────
  // Foster et al. (1998, J Strength Cond Res): "A New Approach to
  // Monitoring Exercise Training"
  // Monotony = mean(daily TSS) / SD(daily TSS) — >2 = staleness risk
  // Strain = weekly TSS × monotony — >2000 = non-functional overreaching
  computeTrainingMonotonyStrain(activities) {
    if (!activities?.length) return null;

    const now = new Date();
    const dailyTSS = {};
    for (let d = 0; d < 7; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      dailyTSS[date.toISOString().split('T')[0]] = 0;
    }

    for (const a of activities) {
      const date = (a.start_date_local || '').slice(0, 10);
      if (date in dailyTSS) dailyTSS[date] += (a.icu_training_load || 0);
    }

    const values = Object.values(dailyTSS);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const sd = Math.sqrt(variance);
    if (sd === 0) return null;

    const monotony = Math.round(mean / sd * 100) / 100;
    const weeklyTSS = values.reduce((s, v) => s + v, 0);
    const strain = Math.round(weeklyTSS * monotony);

    return {
      monotony,
      strain,
      weeklyTSS,
      assessment: monotony > 2
        ? `HIGH MONOTONY (${monotony}, Foster 1998): Training is too repetitive. Vary session type/intensity to prevent staleness.`
        : strain > 2000
          ? `HIGH STRAIN (${strain}, Foster 1998): Volume × repetition too high. Insert a recovery day.`
          : `HEALTHY (monotony ${monotony}, strain ${strain}) — adequate variety in training stimulus.`,
    };
  },

  // ─── Critical Power Model ─────────────────────────────────
  // Morton (1996), Poole et al. (2016, Med Sci Sports Exerc)
  // CP = the highest power sustainable without exhaustion (physiological ceiling)
  // W' = anaerobic work capacity above CP (joules; depletes during efforts >CP)
  //
  // 2-parameter model: P(t) = CP + W'/t
  // Solved from 5min and 20min bests:
  //   CP = (P5·t5 - P20·t20) / (t5 - t20)
  //   W' = (P5 - CP) × t5
  //
  // W' reconstitution (Skiba et al., 2012):
  //   τ_W' = 546·exp(−0.01·DCP) + 316  where DCP = CP − P_recovery
  computeCriticalPowerModel(powerCurve, ftp) {
    if (!powerCurve?.values?.length) return null;

    const find = (secs) => {
      const e = powerCurve.values.find(v => v.secs === secs || v.elapsed === secs);
      return e ? (e.watts || e.power || null) : null;
    };

    const p5min = find(300);
    const p20min = find(1200);
    if (!p5min || !p20min || p5min <= p20min) return null;

    const t5 = 300, t20 = 1200;
    const cp = Math.round((p5min * t5 - p20min * t20) / (t5 - t20));
    const wPrime = Math.round((p5min - cp) * t5);

    if (cp <= 0 || wPrime <= 0) return null;

    // W' reconstitution at common recovery intensities (Skiba 2012)
    const reconstitutionTime = (recoveryPower) => {
      const dcp = cp - recoveryPower;
      if (dcp <= 0) return null;
      const tau = 546 * Math.exp(-0.01 * dcp) + 316;
      return {
        tau63pct: Math.round(tau),
        tau95pct: Math.round(tau * 3),
      };
    };

    // Recovery at 50% FTP (typical endurance recovery)
    const recovAt50pct = ftp ? reconstitutionTime(ftp * 0.50) : null;

    // Time to exhaust W' at common intensities above CP
    const timeToExhaust = (power) => {
      if (power <= cp) return Infinity;
      return Math.round(wPrime / (power - cp));
    };

    return {
      cp,
      wPrime,
      wPrimeKj: Math.round(wPrime / 1000 * 10) / 10,
      cpVsFTP: ftp ? Math.round((cp / ftp - 1) * 100) : null,
      reconstitution: recovAt50pct
        ? { at50pctFTP: { tau63pct: recovAt50pct.tau63pct, tau95pct: recovAt50pct.tau95pct } }
        : null,
      intervalPrescription: ftp ? {
        // Time sustainable at VO2max intensity (105% FTP) before W' depleted
        secsAtVO2maxPower: Math.min(timeToExhaust(Math.round(ftp * 1.05)), 600),
        // How long to recover between VO2max intervals at 50% FTP
        recoverySecs63pct: recovAt50pct?.tau63pct || null,
      } : null,
      assessment: wPrime < 10000
        ? `WEAK W' (${Math.round(wPrime / 1000 * 10) / 1}kJ): Low anaerobic capacity. Prescribe 30s-2min efforts to develop W'. CP≈${cp}W.`
        : wPrime > 25000
          ? `STRONG W' (${Math.round(wPrime / 1000)}kJ): High anaerobic reserve. Good for criteriums/attacks. CP≈${cp}W.`
          : `W' ${Math.round(wPrime / 1000)}kJ, CP ${cp}W — typical all-round profile.`,
    };
  },

  // ─── VO2max Estimate ──────────────────────────────────────
  // Hawley & Noakes (1992): VO2max ≈ (MAP × 10.8 / BW) + 7
  // Where MAP (Maximal Aerobic Power) ≈ 5-min MMP (best proxy without lab)
  // Reference ranges (Astrand & Rodahl 1970, Joyner & Coyle 2008):
  //   Elite male cyclists: ≥70 ml/kg/min
  //   Competitive amateur: 55–65 ml/kg/min
  //   Recreational: 40–55 ml/kg/min
  computeVO2maxEstimate(powerCurve, weight, ftp) {
    if (!powerCurve?.values?.length || !weight || !ftp) return null;

    const find = (secs) => {
      const e = powerCurve.values.find(v => v.secs === secs || v.elapsed === secs);
      return e ? (e.watts || e.power || null) : null;
    };

    const map = find(300); // 5-min best = best MAP proxy without ramp test
    if (!map) return null;

    const vo2max = Math.round(((map * 10.8) / weight + 7) * 10) / 10;
    const wkgAt5min = Math.round(map / weight * 100) / 100;

    let category;
    if (vo2max >= 70) category = 'ELITE (≥70 ml/kg/min)';
    else if (vo2max >= 60) category = 'ADVANCED (60–70 ml/kg/min)';
    else if (vo2max >= 50) category = 'COMPETITIVE (50–60 ml/kg/min)';
    else category = 'DEVELOPING (<50 ml/kg/min)';

    // Optimal interval power for VO2max stimulus (Billat 2001):
    // vVO2max ≈ 100–106% of MAP. Prescribe 3-5min reps at this power.
    const vVO2maxW = Math.round(map * 1.02);

    return {
      vo2maxEstimate: vo2max,
      category,
      map,
      wkgAt5min,
      vVO2maxWatts: vVO2maxW,
      intervalProtocol: `Billat 2001: 4-6 × ${ftp ? Math.min(5, Math.round(20000 / (vVO2maxW - ftp))) : 4}min @ ${vVO2maxW}W, recovery ${Math.round(vVO2maxW / (ftp || vVO2maxW) * 2)}min at Z1`,
      assessment: `VO2max ≈ ${vo2max} ml/kg/min — ${category}. MAP ${map}W (${wkgAt5min} W/kg). Optimal VO2max interval: ${vVO2maxW}W.`,
    };
  },

  // ─── Weekly Ramp Rate ─────────────────────────────────────
  // Load spike >20%/week = elevated injury risk
  computeWeeklyRampRate(weeklyLoads) {
    if (!weeklyLoads || weeklyLoads.length < 3) return null;
    const recent = weeklyLoads.slice(-4);
    const ramps = [];
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1].totalLoad;
      const curr = recent[i].totalLoad;
      if (prev > 10) ramps.push(((curr - prev) / prev) * 100);
    }
    if (ramps.length === 0) return null;

    const lastRamp = ramps[ramps.length - 1];
    const avgRamp = ramps.reduce((s, r) => s + r, 0) / ramps.length;

    return {
      lastWeekChangePct: Math.round(lastRamp * 10) / 10,
      avgChangePct4w: Math.round(avgRamp * 10) / 10,
      assessment: Math.abs(lastRamp) > 20
        ? `SPIKE: Load ${lastRamp > 0 ? '+' : ''}${lastRamp.toFixed(0)}% last week — injury risk elevated. Cap intensity.`
        : Math.abs(lastRamp) < 3 && Math.abs(avgRamp) < 3
          ? 'STAGNANT: Load flat for 4 weeks — apply progressive overload or block a build week.'
          : `PROGRESSIVE: Avg ${avgRamp > 0 ? '+' : ''}${avgRamp.toFixed(0)}%/week — within safe range.`,
    };
  },

  // ─── Next Event Context ───────────────────────────────────
  computeNextEventContext(plannedEvents) {
    if (!plannedEvents?.length) return null;
    const now = new Date();
    const races = plannedEvents
      .filter(e => (e.kind === 'race' || e.type === 'Race') && e.start_date_local)
      .map(e => ({ name: e.name || e.title || 'Race', date: e.start_date_local, _d: new Date(e.start_date_local) }))
      .filter(e => e._d > now)
      .sort((a, b) => a._d - b._d);

    if (!races.length) return null;
    const next = races[0];
    const daysUntil = Math.round((next._d - now) / 86400000);

    return {
      name: next.name,
      date: next.date?.slice(0, 10),
      daysUntil,
      phase: daysUntil <= 3 ? 'race-imminent' : daysUntil <= 7 ? 'race-week' : daysUntil <= 14 ? 'taper' : daysUntil <= 28 ? 'build' : 'base',
    };
  },

  // ─── Power Zones from FTP ─────────────────────────────────
  computePowerZones(ftp) {
    if (!ftp || ftp < 50) return null;
    return {
      Z1: { label: 'Active Recovery', max: Math.round(ftp * 0.55) },
      Z2: { label: 'Endurance', min: Math.round(ftp * 0.56), max: Math.round(ftp * 0.75) },
      Z3: { label: 'Tempo', min: Math.round(ftp * 0.76), max: Math.round(ftp * 0.87) },
      Z4: { label: 'Threshold', min: Math.round(ftp * 0.88), max: Math.round(ftp * 1.05) },
      Z5: { label: 'VO2max', min: Math.round(ftp * 1.06), max: Math.round(ftp * 1.20) },
      Z6: { label: 'Anaerobic', min: Math.round(ftp * 1.21), max: Math.round(ftp * 1.50) },
      Z7: { label: 'Neuromuscular', min: Math.round(ftp * 1.51) },
    };
  },

  // ─── Power Curve Summary ──────────────────────────────────
  // Summarize ICU power curve into W/kg benchmarks for AI context
  computePowerCurveSummary(powerCurve, weight, ftp) {
    if (!powerCurve?.values?.length) return null;
    const curve = powerCurve.values;

    const DURATIONS = [
      { label: '5s', secs: 5 },
      { label: '1min', secs: 60 },
      { label: '5min', secs: 300 },
      { label: '20min', secs: 1200 },
      { label: '60min', secs: 3600 },
    ];

    const results = {};
    for (const { label, secs } of DURATIONS) {
      const entry = curve.find(v => v.secs === secs || v.elapsed === secs);
      if (entry?.watts || entry?.power) {
        const w = entry.watts || entry.power;
        results[label] = { watts: w, wkg: weight ? Math.round(w / weight * 100) / 100 : null };
      }
    }

    if (Object.keys(results).length === 0) return null;

    const ftpBenchmark = results['20min']?.watts
      ? Math.round(results['20min'].watts * 0.95)
      : ftp;

    return {
      bests: results,
      estimatedFTP: ftpBenchmark,
      note: ftp && ftpBenchmark && Math.abs(ftpBenchmark - ftp) > 15
        ? `Gap detected: 20min-estimated FTP (${ftpBenchmark}W) differs from recorded FTP (${ftp}W) — consider re-testing.`
        : null,
    };
  },

  // ─── Decoupling Analysis ──────────────────────────────────
  // Pwr:HR decoupling > 5% on endurance rides = insufficient Z2 base
  // Requires activity streams (watts + heartrate)
  computeDecoupling(wattsStream, hrStream) {
    if (!wattsStream || !hrStream || wattsStream.length < 60) return null;

    const len = wattsStream.length;
    const mid = Math.floor(len / 2);

    const avgSlice = (arr, start, end) => {
      const slice = arr.slice(start, end).filter(v => v > 0);
      return slice.length > 0 ? slice.reduce((s, v) => s + v, 0) / slice.length : 0;
    };

    const watts1 = avgSlice(wattsStream, 0, mid);
    const watts2 = avgSlice(wattsStream, mid, len);
    const hr1 = avgSlice(hrStream, 0, mid);
    const hr2 = avgSlice(hrStream, mid, len);

    if (hr1 === 0 || hr2 === 0) return null;

    const ef1 = watts1 / hr1;
    const ef2 = watts2 / hr2;
    const decoupling = ((ef1 - ef2) / ef1) * 100;

    return {
      firstHalfEF: ef1,
      secondHalfEF: ef2,
      decouplingPct: decoupling,
      assessment: decoupling > 5
        ? 'CRITICAL: Decoupling >5% — aerobic base is insufficient for this duration/intensity. Prescribe more Z2.'
        : decoupling > 3
          ? 'WARNING: Moderate decoupling (3-5%). Monitor trend.'
          : 'GOOD: Minimal decoupling (<3%). Aerobic base is adequate for this effort.',
    };
  },

  // ─── Weekly Load Summary ──────────────────────────────────
  computeWeeklyLoads(activities, weeks = 8) {
    if (!activities) return [];

    const now = new Date();
    const weeklyBuckets = [];

    for (let w = 0; w < weeks; w++) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);

      const weekActivities = activities.filter(a => {
        const d = new Date(a.start_date_local);
        return d >= weekStart && d < weekEnd;
      });

      const cyclingLoad = weekActivities
        .filter(a => a.type === 'Ride')
        .reduce((s, a) => s + (a.icu_training_load || 0), 0);

      const runningLoad = weekActivities
        .filter(a => a.type === 'Run')
        .reduce((s, a) => s + (a.icu_training_load || 0), 0);

      const totalLoad = weekActivities
        .reduce((s, a) => s + (a.icu_training_load || 0), 0);

      weeklyBuckets.push({
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0],
        totalLoad,
        cyclingLoad,
        runningLoad,
        activityCount: weekActivities.length,
        cyclingCount: weekActivities.filter(a => a.type === 'Ride').length,
        runningCount: weekActivities.filter(a => a.type === 'Run').length,
      });
    }

    return weeklyBuckets.reverse();
  },

  // ═══════════════════════════════════════════════════════════
  // ATHLETE DEVELOPMENT MODELLING
  // These functions analyse historical data to model HOW the athlete
  // responds to training — speed of adaptation, recovery signature,
  // rider profile, and long-term aerobic development.
  // ═══════════════════════════════════════════════════════════

  // ─── Fitness Build Rate ───────────────────────────────────
  // Detects build phases (≥14 consecutive days of CTL increase)
  // and computes average CTL gain per week across all such blocks.
  _computeFitnessBuildRate(wellnessData) {
    if (!wellnessData || wellnessData.length < 14) return null;

    const builds = [];
    let block = null;

    for (let i = 1; i < wellnessData.length; i++) {
      const delta = (wellnessData[i].icu_ctl || 0) - (wellnessData[i - 1].icu_ctl || 0);
      if (delta > 0) {
        if (!block) block = { gain: 0, days: 1 };
        block.gain += delta;
        block.days++;
      } else {
        if (block && block.days >= 14) builds.push(block);
        block = null;
      }
    }
    if (block && block.days >= 14) builds.push(block);
    if (builds.length === 0) return null;

    const avgGainPerWeek = builds.reduce((s, b) => s + (b.gain / b.days * 7), 0) / builds.length;
    return {
      avgCTLGainPerWeek: Math.round(avgGainPerWeek * 10) / 10,
      buildBlocksFound: builds.length,
      assessment: avgGainPerWeek > 3
        ? 'FAST ADAPTER: Builds fitness rapidly. Can absorb aggressive load increases.'
        : avgGainPerWeek > 1.5
          ? 'MODERATE ADAPTER: Standard CTL build rate. Apply standard progressive overload.'
          : 'SLOW ADAPTER: Fitness builds slowly. Prioritise consistency over intensity spikes.',
    };
  },

  // ─── Recovery Signature ───────────────────────────────────
  // After each TSB dip below -20, measures days to return to ≥0.
  // Tells us how long to allow between hard blocks.
  _computeRecoverySignature(wellnessData) {
    if (!wellnessData || wellnessData.length < 21) return null;

    const tsbs = wellnessData.map(w => (w.icu_ctl || 0) - (w.icu_atl || 0));
    const recoveries = [];
    let dipStart = null;

    for (let i = 0; i < tsbs.length; i++) {
      if (dipStart === null && tsbs[i] < -20) {
        dipStart = i;
      } else if (dipStart !== null && tsbs[i] >= 0) {
        recoveries.push(i - dipStart);
        dipStart = null;
      }
    }

    if (recoveries.length === 0) return null;
    const avg = Math.round(recoveries.reduce((s, d) => s + d, 0) / recoveries.length);

    return {
      avgRecoveryDays: avg,
      samplesCount: recoveries.length,
      assessment: avg <= 7
        ? `FAST RECOVERY: ~${avg}d to clear deep fatigue. Hard blocks can be spaced 7–10 days apart.`
        : avg <= 14
          ? `STANDARD RECOVERY: ~${avg}d. Allow 2-week recovery windows between load blocks.`
          : `SLOW RECOVERY: ~${avg}d. Space hard blocks 3+ weeks apart. Monitor RHR closely.`,
    };
  },

  // ─── Aerobic Development Trend (6-month EF arc) ──────────
  // Tracks efficiency factor month-by-month.
  // Improving EF = the aerobic engine is developing.
  _computeAerobicDevelopmentTrend(activities) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);

    const rides = activities
      .filter(a =>
        (a.type === 'Ride' || a.type === 'VirtualRide') &&
        (a.icu_normalized_watts || a.weighted_average_watts || a.icu_average_watts) &&
        a.average_heartrate > 60 &&
        new Date(a.start_date_local) >= cutoff
      )
      .sort((a, b) => (a.start_date_local || '').localeCompare(b.start_date_local || ''));

    if (rides.length < 5) return null;

    const byMonth = {};
    for (const r of rides) {
      const month = (r.start_date_local || '').slice(0, 7);
      const np = r.icu_normalized_watts || r.weighted_average_watts || r.icu_average_watts;
      const ef = np / r.average_heartrate;
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(ef);
    }

    const months = Object.keys(byMonth).sort();
    if (months.length < 2) return null;

    const avgEF = (m) => byMonth[m].reduce((s, v) => s + v, 0) / byMonth[m].length;
    const firstEF = avgEF(months[0]);
    const latestEF = avgEF(months[months.length - 1]);
    const changePct = Math.round((latestEF - firstEF) / firstEF * 1000) / 10;

    return {
      firstMonthEF: Math.round(firstEF * 100) / 100,
      latestMonthEF: Math.round(latestEF * 100) / 100,
      changePct,
      monthsTracked: months.length,
      assessment: changePct > 5
        ? `DEVELOPING: EF +${changePct}% over ${months.length} months — aerobic system responding well.`
        : changePct > 0
          ? `SLOW PROGRESS: EF +${changePct}% — aerobic gains are marginal. Add Z2 volume.`
          : `STAGNANT/DECLINING: EF ${changePct}% — no aerobic development detected. Rebuild base.`,
    };
  },

  // ─── Rider Profile (power curve shape) ───────────────────
  // Classifies the athlete based on relative strength across durations.
  // Requires ICU power curve data.
  _computeRiderProfile(powerCurve, ftp, weight) {
    if (!powerCurve?.values?.length || !ftp || ftp < 50) return null;

    const find = (secs) => {
      const e = powerCurve.values.find(v => v.secs === secs || v.elapsed === secs);
      return e ? (e.watts || e.power || null) : null;
    };

    const p5s = find(5);
    const p1min = find(60);
    const p5min = find(300);
    const p20min = find(1200);

    if (!p5min || !p20min) return null;

    const vo2Ratio = p5min / ftp;
    const aerobicRatio = p20min / ftp;
    const sprintRatio = p5s ? p5s / ftp : null;
    const anaerobicRatio = p1min ? p1min / ftp : null;

    let type, strengths, limiters;
    if (sprintRatio && sprintRatio > 13 && vo2Ratio < 1.20) {
      type = 'SPRINTER';
      strengths = ['Peak neuromuscular power', 'Sprint finishes'];
      limiters = ['5min VO2max power', 'Sustained climbs — needs interval work'];
    } else if (vo2Ratio > 1.25 && aerobicRatio > 0.95) {
      type = 'PUNCHEUR';
      strengths = ['Explosive efforts', 'Short climbs', 'Race attacks'];
      limiters = ['Long sustained TT efforts'];
    } else if (aerobicRatio > 0.97 && vo2Ratio < 1.22) {
      type = 'DIESEL / TT';
      strengths = ['Sustained threshold', 'Long climbs', 'Time trials'];
      limiters = ['Maximal 1-5min efforts — needs VO2 work'];
    } else if (vo2Ratio >= 1.22 && aerobicRatio >= 0.95) {
      type = 'ALL-ROUNDER';
      strengths = ['Balanced across durations', 'Versatile in varied terrain'];
      limiters = ['No dominant weapon — pick a race-type focus for peak results'];
    } else {
      type = 'DEVELOPING';
      strengths = ['Building across all durations'];
      limiters = ['All zones under-developed — prioritise aerobic base before specialisation'];
    }

    return {
      type,
      ratios: {
        sprint: sprintRatio ? Math.round(sprintRatio * 10) / 10 : null,
        vo2max: Math.round(vo2Ratio * 100) / 100,
        aerobic: Math.round(aerobicRatio * 100) / 100,
        anaerobic: anaerobicRatio ? Math.round(anaerobicRatio * 100) / 100 : null,
      },
      wkg: weight
        ? { '5min': Math.round(p5min / weight * 100) / 100, '20min': Math.round(p20min / weight * 100) / 100 }
        : null,
      strengths,
      limiters,
    };
  },

  // ─── Training Pattern History ─────────────────────────────
  // Classifies each week as high-intensity (>30% TSS from IF≥0.76)
  // or volume-dominant. Reveals the athlete's habitual training style
  // and whether it matches their stated goals.
  _computeTrainingPatternHistory(activities, ftp) {
    if (!activities?.length || !ftp || activities.length < 15) return null;

    const getWeekKey = (dateStr) => {
      const d = new Date(dateStr);
      const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    };

    const weekMap = {};
    for (const a of activities) {
      if (!a.start_date_local) continue;
      const wk = getWeekKey(a.start_date_local);
      if (!weekMap[wk]) weekMap[wk] = [];
      weekMap[wk].push(a);
    }

    let hiWeeks = 0, volWeeks = 0;
    for (const acts of Object.values(weekMap)) {
      let totalTSS = 0, hiTSS = 0;
      for (const a of acts) {
        const tss = a.icu_training_load || 0;
        const np = a.icu_normalized_watts || a.weighted_average_watts || a.icu_average_watts;
        totalTSS += tss;
        if (np && np / ftp >= 0.76) hiTSS += tss;
      }
      if (totalTSS >= 30) {
        if (hiTSS / totalTSS > 0.30) hiWeeks++;
        else volWeeks++;
      }
    }

    const total = hiWeeks + volWeeks;
    if (total === 0) return null;
    const hiPct = Math.round(hiWeeks / total * 100);

    return {
      highIntensityWeeks: hiWeeks,
      volumeWeeks: volWeeks,
      highIntensityPct: hiPct,
      pattern: hiPct > 55
        ? 'INTENSITY-DOMINANT'
        : hiPct < 35
          ? 'VOLUME-DOMINANT'
          : 'BALANCED',
      assessment: hiPct > 55
        ? `INTENSITY-DOMINANT: ${hiPct}% of weeks are high-intensity. Risk of chronic fatigue without deliberate base blocks.`
        : hiPct < 35
          ? `VOLUME-DOMINANT: ${100 - hiPct}% volume weeks — aerobic engine is well-developed. May need more race-specific sharpening.`
          : `BALANCED: ${hiPct}% intensity, ${100 - hiPct}% volume — healthy polarisation pattern.`,
    };
  },

  // ─── Historical Peak CTL ──────────────────────────────────
  // Establishes the athlete's proven fitness ceiling and how close
  // they are to it currently. Useful for load target setting.
  _computeHistoricalPeakCTL(wellnessData) {
    if (!wellnessData?.length) return null;
    const valid = wellnessData.filter(w => w.icu_ctl > 10);
    if (valid.length === 0) return null;

    const peak = Math.max(...valid.map(w => w.icu_ctl));
    const current = wellnessData[wellnessData.length - 1]?.icu_ctl || 0;
    const pctOfPeak = Math.round(current / peak * 100);
    const peakEntry = valid.find(w => w.icu_ctl === peak);

    return {
      peakCTL: Math.round(peak * 10) / 10,
      currentCTL: Math.round(current * 10) / 10,
      pctOfPeak,
      peakDate: peakEntry?.id || null,
      assessment: pctOfPeak >= 90
        ? `NEAR PEAK: At ${pctOfPeak}% of best-ever CTL (${peak.toFixed(1)}). Race-ready condition.`
        : pctOfPeak >= 70
          ? `BUILDING: At ${pctOfPeak}% of peak CTL (${peak.toFixed(1)}). On track.`
          : `BELOW BASE: At ${pctOfPeak}% of peak (${peak.toFixed(1)}). Significant re-building needed before target events.`,
    };
  },

  // ─── Athlete Development Profile (main entry point) ──────
  computeAthleteDevelopmentProfile(wellnessData, activities, powerCurve, ftp, weight) {
    return {
      fitnessBuildRate: this._computeFitnessBuildRate(wellnessData),
      recoverySignature: this._computeRecoverySignature(wellnessData),
      aerobicDevelopment: this._computeAerobicDevelopmentTrend(activities),
      riderProfile: this._computeRiderProfile(powerCurve, ftp, weight),
      trainingPattern: this._computeTrainingPatternHistory(activities, ftp),
      fitnessHistory: this._computeHistoricalPeakCTL(wellnessData),
    };
  },

  // ─── Build AI Coach Context (the "zero-inference" JSON) ───
  buildCoachContext(wellnessData, activities, plannedEvents, athleteProfile, powerCurve = null) {
    const pmcTrend = this.computePMCTrend(wellnessData);
    const efTrend = this.computeEFTrend(activities);
    const compliance = this.computeComplianceScore(activities, plannedEvents);
    const weeklyLoads = this.computeWeeklyLoads(activities);

    const ftp = athleteProfile?.icu_ftp || null;
    const w = athleteProfile?.icu_weight || null;
    const latest = wellnessData?.[wellnessData.length - 1];
    const resolvedWeight = w || latest?.weight || null;

    const rhrTrend = this.computeRHRTrend(wellnessData);
    const sleepTrend = this.computeSleepTrend(wellnessData);
    const intensityDistrib = this.computeIntensityDistribution(activities, ftp);
    const rampRate = this.computeWeeklyRampRate(weeklyLoads);
    const nextEvent = this.computeNextEventContext(plannedEvents);
    const powerZones = this.computePowerZones(ftp);
    const powerCurveSummary = this.computePowerCurveSummary(powerCurve, resolvedWeight, ftp);

    // Scientific load models
    const acwr = this.computeACWR(wellnessData);
    const monotonyStrain = this.computeTrainingMonotonyStrain(activities);
    const cpModel = this.computeCriticalPowerModel(powerCurve, ftp);
    const vo2maxEstimate = this.computeVO2maxEstimate(powerCurve, resolvedWeight, ftp);

    // Athlete development profile (longitudinal)
    const athleteDevelopment = this.computeAthleteDevelopmentProfile(
      wellnessData, activities, powerCurve, ftp, resolvedWeight
    );

    return {
      timestamp: new Date().toISOString(),
      athleteProfile: {
        ftp,
        weight: resolvedWeight,
        restingHR: latest?.restingHR || null,
        sportFocus: 'cycling',
        powerZones,
      },
      currentForm: {
        ctl: latest?.icu_ctl || null,
        atl: latest?.icu_atl || null,
        tsb: pmcTrend?.tsbCurrent || null,
        formState: latest ? this.assessFormState((latest.icu_ctl || 0) - (latest.icu_atl || 0)) : null,
      },
      recovery: {
        rhrTrend,
        sleep: sleepTrend,
      },
      loadManagement: {
        acwr,
        monotonyStrain,
        weeklyRampRate: rampRate,
      },
      trends: {
        pmc: pmcTrend,
        efficiencyFactor: efTrend,
        compliance,
      },
      physiology: {
        criticalPower: cpModel,
        vo2max: vo2maxEstimate,
      },
      trainingDistribution: intensityDistrib,
      powerCurve: powerCurveSummary,
      athleteDevelopment,
      nextEvent,
      weeklyLoads,
    };
  },
};

export default analytics;
