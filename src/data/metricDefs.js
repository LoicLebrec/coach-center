/**
 * Centralised metric definitions used by InfoTip across the app.
 * Each entry: { label, description, formula?, source }
 */

export const METRICS = {

  CTL: {
    label: 'CTL — Chronic Training Load',
    description: 'Long-term fitness trend. How fit are you over the past 6 weeks? Higher = more fitness base.',
    formula: 'CTL(t) = CTL(t−1) + (TSS(t) − CTL(t−1)) / 42',
    source: 'Banister (1975) · Coggan & Allen model · Source: Intervals.icu wellness or estimated from activities',
  },

  ATL: {
    label: 'ATL — Acute Training Load',
    description: 'Short-term fatigue. How hard have you trained in the past week? Rises quickly after hard blocks.',
    formula: 'ATL(t) = ATL(t−1) + (TSS(t) − ATL(t−1)) / 7',
    source: 'Banister impulse-response model · Source: Intervals.icu wellness or estimated',
  },

  TSB: {
    label: 'TSB — Training Stress Balance (Form)',
    description: 'Fitness minus fatigue. Positive = fresh/peaked. Negative = building/fatigued. Below −25 = overreaching risk.',
    formula: 'TSB = CTL − ATL',
    source: 'Coggan & Allen model · Optimal race window: +5 to +25',
  },

  TSS: {
    label: 'TSS — Training Stress Score',
    description: 'Physiological cost of an activity. 100 TSS = 1 hour at exactly FTP. An easy Z2 hour ≈ 50–60, a hard race ≈ 200–300.',
    formula: 'TSS = (t_sec × NP × IF) / (FTP × 3600) × 100',
    source: 'Coggan & Allen (2010) · Source: Intervals.icu or calculated from power / HR',
  },

  NP: {
    label: 'NP — Normalized Power',
    description: 'Physiologically weighted power. Accounts for the greater metabolic cost of variable efforts vs. steady riding. Always ≥ average power.',
    formula: '30s rolling avg → ⁴√(mean(x⁴))',
    source: 'Coggan (2003) · Source: Intervals.icu or Strava',
  },

  IF: {
    label: 'IF — Intensity Factor',
    description: 'How hard was this ride relative to your threshold? 1.00 = sustained FTP for the whole ride. >1.05 = above threshold average.',
    formula: 'IF = NP / FTP',
    source: 'Coggan & Allen · Source: calculated from NP and FTP',
  },

  EF: {
    label: 'EF — Efficiency Factor',
    description: 'Aerobic efficiency: watts produced per heartbeat. Higher = better aerobic base. Improves progressively with endurance training.',
    formula: 'EF = avg_watts / avg_HR',
    source: "Friel (The Triathlete's Training Bible) · Source: calculated from activity data",
  },

  FTP: {
    label: 'FTP — Functional Threshold Power',
    description: 'Maximum average power sustainable for ~1 hour. Anchor for all training zones and load calculations. Should be tested every 6–8 weeks.',
    formula: '≈ 95% of best 20-min power (field test)\nor direct 60-min TT average',
    source: 'Source: Intervals.icu profile → Strava → manual entry in Settings',
  },

  ZONE: {
    label: 'Training Zone (Coggan 7-zone)',
    description: 'Effort level based on Intensity Factor (NP ÷ FTP). Guides training specificity.',
    formula: 'Z1 <55% · Z2 56–75% · Z3 76–90%\nZ4 91–105% · Z5 106–120%\nZ6 121–150% · Z7 >150% FTP',
    source: 'Coggan (2003) 7-zone model · Source: calculated from NP/FTP',
  },

  RHR: {
    label: 'RHR — Resting Heart Rate',
    description: 'A reliable recovery indicator. Elevated RHR (+5–7 bpm above baseline) often signals incomplete recovery, illness, or overtraining.',
    source: 'Source: Intervals.icu wellness log · Measured on waking',
  },

  RAMP_RATE: {
    label: 'CTL Ramp Rate',
    description: 'How fast your fitness is building week over week. Safe progression: 3–8 TSS/week. Above 10/week risks injury or overtraining.',
    formula: 'Ramp = CTL_current − CTL_7d_ago',
    source: 'Source: Intervals.icu wellness · Coggan & Allen guidelines',
  },

  HRTSS: {
    label: 'hrTSS — Heart Rate TSS',
    description: 'TSS estimated from heart rate when no power data is available. Uses Banister TRIMP normalised to the TSS scale.',
    formula: 'TRIMP = t_min × hrReserve × 0.64 × e^(1.92 × hrReserve)\nhrReserve = (avgHR − restHR) / (maxHR − restHR)',
    source: 'Banister et al. (1975) · Normalised so 1h at LTHR ≈ 100 TSS',
  },

  WEEKLY_TSS: {
    label: 'Weekly TSS',
    description: 'Total training stress for the week. Typical ranges: recreational 200–400, amateur racer 400–700, elite 700–1200+.',
    formula: 'Sum of TSS across all activities in the week',
    source: 'Source: Intervals.icu or calculated from activities',
  },

};
