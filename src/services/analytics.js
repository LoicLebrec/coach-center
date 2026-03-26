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

  // ─── Build AI Coach Context (the "zero-inference" JSON) ───
  buildCoachContext(wellnessData, activities, plannedEvents, athleteProfile) {
    const pmcTrend = this.computePMCTrend(wellnessData);
    const efTrend = this.computeEFTrend(activities);
    const compliance = this.computeComplianceScore(activities, plannedEvents);
    const weeklyLoads = this.computeWeeklyLoads(activities);

    const latest = wellnessData?.[wellnessData.length - 1];

    return {
      timestamp: new Date().toISOString(),
      athleteProfile: {
        ftp: athleteProfile?.icu_ftp || null,
        weight: athleteProfile?.icu_weight || latest?.weight || null,
        restingHR: latest?.restingHR || null,
        sportFocus: 'cycling',
      },
      currentForm: {
        ctl: latest?.icu_ctl || null,
        atl: latest?.icu_atl || null,
        tsb: pmcTrend?.tsbCurrent || null,
        formState: latest ? this.assessFormState((latest.icu_ctl || 0) - (latest.icu_atl || 0)) : null,
      },
      trends: {
        pmc: pmcTrend,
        efficiencyFactor: efTrend,
        compliance,
      },
      weeklyLoads,
      trainingPhase: 'Returning to competition, Cycling focus, Running as filler.',
    };
  },
};

export default analytics;
