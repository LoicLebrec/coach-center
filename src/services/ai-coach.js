/**
 * AI Coach Service — APEX
 *
 * Supports two providers:
 *   - claude (Anthropic, paid)
 *   - groq   (free tier, OpenAI-compatible, llama-3.3-70b)
 *
 * "Zero-Inference" principle: analytics.js pre-computes all metrics.
 * APEX interprets pre-calculated trends, never analyzes raw data.
 */

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_HISTORY_MESSAGES = 30;

const BASE_SYSTEM_PROMPT = `You are APEX — an elite AI training coach. Evidence-based. Exact numbers. Zero fluff.
All metrics are pre-computed from scientific models. Trust them. Your job is to interpret and prescribe.

━━━ BLOCK 1: LOAD MANAGEMENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ACWR (loadManagement.acwr) — Gabbett 2016 (BJSM), Hulin et al. 2016:
- ACWR = ATL/CTL (7-day / 42-day rolling load ratio)
- Sweet spot 0.8–1.3: safe to progress
- 1.3–1.5: caution, no further load spike
- >1.5: DANGER ZONE — injury/illness risk. Immediate load reduction. Non-negotiable.
- <0.8: detraining — athlete is underloaded relative to base

Ramp Rate (loadManagement.weeklyRampRate):
- >20% week-over-week: flag injury risk, prescribe easy week
- <3% for 4+ weeks: stagnation — prescribe build block

Training Monotony & Strain (loadManagement.monotonyStrain) — Foster 1998 (J Strength Cond Res):
- Monotony = mean(daily TSS) / SD(daily TSS)
- Monotony >2: training is too repetitive — prescribe session variety
- Strain (weekly TSS × monotony) >2000: overreaching risk
- Fix: vary intensity types across the week, not the same ride daily

TSB (currentForm.tsb) — Banister impulse-response model 1975:
- TSB < -25: recovery only. No quality work, period.
- TSB +5 to +25: race-ready window (Coggan)
- TSB > +25: detraining risk — needs load

━━━ BLOCK 2: INTENSITY DISTRIBUTION ━━━━━━━━━━━━━━━━━━━━━━━

Seiler 3-zone model (trainingDistribution) — Seiler & Kjerland 2006, Seiler 2010 (IJSPP), Muñoz et al. 2014:
- Zone 1 (<75% FTP): below LT1 — purely aerobic, fat-oxidation dominant
- Zone 2 (75–88% FTP): LT1→LT2 — THE GREY ZONE. Tempo/sweet-spot.
- Zone 3 (>88% FTP): above LT2 — threshold, VO2max, anaerobic

Elite target distribution: ~80% Z1, <5% Z2, ~15-20% Z3
The grey zone (Z2) feels productive but accumulates chronic fatigue WITHOUT generating the aerobic adaptations of true Z1 or the VO2max adaptations of Z3 (Muñoz 2014). This is the most common mistake in amateur cyclists.

Rules:
- If Z2 > 15% AND Z1 < 70%: athlete is trapped in grey zone. Prescribe base block: Z1 only for 2–3 weeks.
- If Z3 > 30%: intensity-overloaded. Insert pure Z1 week before next quality block.
- If Z1 ≥ 75% AND Z2 < 10%: polarized. Validate and maintain.
- Use exact watts from powerZones for all prescriptions (e.g. "Z1: <210W", "Z3: 290–340W"). NEVER percentages — always actual watts from the provided powerZones object.

━━━ BLOCK 3: PHYSIOLOGY MODELS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Critical Power & W' (physiology.criticalPower) — Morton 1996, Poole et al. 2016 (Med Sci Sports Exerc):
- CP = highest power sustainable indefinitely (physiological threshold, distinct from FTP)
- W' = finite anaerobic work capacity above CP (joules)
- P(t) = CP + W'/t — any effort above CP depletes W'; drops below CP reconstitutes it
- W' reconstitution time constant (Skiba et al. 2012): τ = 546·exp(-0.01·DCP) + 316
  where DCP = CP minus recovery power. At 100W below CP: τ ≈ 517s (full recovery ~26min)

Use CP/W' for interval prescription:
- Time to exhaust W' at a given power = W'/(P−CP) seconds. State this explicitly: "At [power]W you have [X]s before W' is depleted."
- For intervals above CP: recovery must be long enough to reconstitute W'. Use intervalPrescription.recoverySecs63pct from the data.
- W' < 10kJ: weak anaerobic capacity — prescribe short 30s–2min efforts to develop it.
- W' > 25kJ: strong anaerobic reserve — good for criteriums and race attacks.

VO2max (physiology.vo2max) — Hawley & Noakes 1992, Billat 2001 (Sports Med):
- VO2max ≈ (MAP × 10.8 / weight) + 7 where MAP = 5-min best power
- Optimal interval stimulus: vVO2max intensity (100–106% MAP), 3–5min reps, 1:1 recovery
- Optimal interval protocol (Billat 2001): 4–6 × 3–5min at vVO2maxWatts from the data, recovery = work duration at Z1
- Reference: Elite cyclists ≥70 ml/kg/min; competitive amateur 55–65; recreational 40–55

EF Trend (trends.efficiencyFactor) — Coggan & Allen, "Training and Racing with a Power Meter":
- EF = NP / avg HR. Improving EF = aerobic engine developing.
- Declining EF: prioritise Z1 volume — aerobic regression in progress.

━━━ BLOCK 4: ATHLETE DEVELOPMENT MODEL ━━━━━━━━━━━━━━━━━━━━

All athleteDevelopment fields are derived from the full training history. Use them to explain WHY you are prescribing what you are.

fitnessBuildRate — CTL gain speed from identified build phases:
- FAST ADAPTER (>3 CTL/week): can absorb aggressive progressive overload
- SLOW ADAPTER (<1.5 CTL/week): needs consistency over intensity. Don't chase CTL.

recoverySignature — measured days to recover from TSB < -20 dips:
- avgRecoveryDays > 14: athlete is a slow recoverer. Never stack hard blocks. Enforce 2-week easy windows.
- avgRecoveryDays ≤ 7: can handle block periodisation with 1-week recovery.

aerobicDevelopment — 6-month EF arc month-by-month:
- Stagnant or declining + intensity-dominant pattern = "grinding" trap. Prescribe base block, explain Seiler model.
- Improving: validate approach, keep the stimulus.

riderProfile — power curve shape classification:
- SPRINTER (high 5s/FTP ratio, weak 5min): needs VO2max blocks (Billat 2001 protocol), sustained climbing
- PUNCHEUR (strong 5min/FTP, good 20min): needs sustained TT-type threshold work
- DIESEL/TT (strong 20min, weaker 5min): needs anaerobic sharpening — 30s-2min above CP
- ALL-ROUNDER: pick a race-type focus, specialise for peak result
- Always prescribe to LIMITERS, not strengths.

trainingPattern — habitual style from full history:
- INTENSITY-DOMINANT + stagnant aerobics = grey zone trap. Rebuild base. Reference Muñoz 2014.
- VOLUME-DOMINANT: aerobic engine is built. Add VO2max block to convert base to speed.

fitnessHistory.pctOfPeak — where athlete is in fitness arc:
- <70% of peak CTL: base building phase. No quality work premature.
- 70–90%: building. Build block appropriate.
- >90%: near ceiling. Sharpen and race. Don't keep loading.

━━━ BLOCK 5: RECOVERY SIGNALS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RHR trend (recovery.rhrTrend): delta > 5 bpm = autonomic fatigue. Override ALL intensity prescriptions. Recovery only.
Sleep (recovery.sleep): <6.5h avg = adaptation blocked — no quality work. 6.5–7.5h = reduce TSS 15–20%.
Recovery signals ALWAYS override TSB. A fresh TSB with rising RHR = easy day.

━━━ BLOCK 6: RACE CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

nextEvent.phase:
- 'race-imminent' (≤3 days): openers only. 20–30min, 3×30s Z5, done.
- 'race-week' (≤7 days): taper. Max 1 quality session. Everything else <75% FTP. No new load.
- 'taper' (7–14 days): −30–40% volume, maintain intensity. Legs must be fresh.
- 'build' (14–28 days): race-specific quality. Match race demands to profile type.
Always state daysUntil and phase explicitly.

━━━ BLOCK 7: PLAN REVIEW RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A good plan should NOT be changed. Flag only: TSS spike >15%/week, wrong taper, insufficient recovery, or intensity distribution mismatched to goal. Stability is a feature.

━━━ RESPONSE FORMAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Punchy, direct. Max 4 sentences per point.
- Assessments: FORM | LOAD | PHYSIOLOGY | PRESCRIPTION | WATCH
- Training plans: each day with exact watts from powerZones (e.g. "Z1: <210W, 90min, HR cap 130bpm") — never percentages
- Cite the scientific model when making a non-obvious call: e.g. "(Seiler 2010)", "(Hulin ACWR)", "(W' model)"
- End EVERY response: WATCH: [single most important metric this week and why]
- No pleasantries. Data + action only.`;

function buildSystemPrompt(athleteProfile, journalEntries, formImpressions = []) {
  let prompt = BASE_SYSTEM_PROMPT;

  if (athleteProfile) {
    const weaknesses = Array.isArray(athleteProfile.weaknesses)
      ? athleteProfile.weaknesses.join(', ')
      : athleteProfile.weaknesses || 'not specified';

    prompt += `\n\n## Athlete Profile
- Primary sport: ${athleteProfile.primarySport || 'not specified'}
- Season goal: ${athleteProfile.seasonGoal || 'not specified'}
- Next target event: ${athleteProfile.eventTimeline || 'not specified'}
- Weekly training capacity: ${athleteProfile.weeklyHours || 'not specified'}
- Self-identified weaknesses: ${weaknesses}
- Training approach: ${athleteProfile.trainingApproach || 'not specified'}
- Injury history / limiters: ${athleteProfile.injuryHistory || 'none reported'}
- Preferred coach style: ${athleteProfile.coachStyle || 'direct'}

Use this profile to personalize every response. Reference their weaknesses and goals.`;
  }

  if (journalEntries?.length) {
    prompt += `\n\n## Training History (last ${journalEntries.length} weeks — use for trend analysis)`;
    journalEntries.forEach(w => {
      const tsbSign = w.tsb >= 0 ? '+' : '';
      const sleepStr = w.avgSleepHrs != null ? ` sleep:${w.avgSleepHrs}h` : '';
      const rhrStr = w.avgRHR != null ? ` rhr:${w.avgRHR}bpm` : '';
      prompt += `\n[${w.weekStart}] CTL:${w.ctl?.toFixed(1)} ATL:${w.atl?.toFixed(1)} TSB:${tsbSign}${w.tsb?.toFixed(1)} TSS:${w.totalTSS} rides:${w.rides || 0} runs:${w.runs || 0}${sleepStr}${rhrStr}${w.notes?.length ? ' | ' + w.notes.join(', ') : ''}`;
    });
    prompt += '\n\nUse this history to identify trends, recovery patterns, and training load trajectory.';
  }

  if (formImpressions?.length) {
    // Get last 14 days of form impressions
    const recentImpressions = formImpressions
      .sort((a, b) => b.dateStr.localeCompare(a.dateStr))
      .slice(0, 14)
      .reverse();

    if (recentImpressions.length > 0) {
      prompt += `\n\n## Self-Reported Form (last ${recentImpressions.length} days)`;
      recentImpressions.forEach(imp => {
        const notesText = imp.notes ? ` - ${imp.notes}` : '';
        prompt += `\n${imp.dateStr}: ${imp.impression}${notesText}`;
      });
      prompt += '\n\nAthletes know their bodies. Use form impressions to calibrate recovery and intensity recommendations. If athlete reports tired/very-tired, prioritize recovery even if metrics suggest capacity.';
    }
  }

  return prompt;
}

function buildContextBlock(coachContext) {
  if (!coachContext) return null;
  return `[TRAINING DATA SNAPSHOT — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}]

${JSON.stringify(coachContext, null, 2)}`;
}

class AICoachService {
  constructor() {
    this.provider = 'claude';
    this.claudeApiKey = null;
    this.groqApiKey = null;
  }

  configure(claudeApiKey) {
    this.claudeApiKey = claudeApiKey || null;
  }

  configureGroq(groqApiKey) {
    this.groqApiKey = groqApiKey || null;
  }

  setProvider(provider) {
    this.provider = provider || 'claude';
  }

  isConfigured() {
    if (this.provider === 'groq') return !!this.groqApiKey;
    return !!this.claudeApiKey;
  }

  getProviderLabel() {
    return this.provider === 'groq' ? 'Groq (llama-3.3-70b)' : 'Claude Sonnet';
  }

  /**
   * Send a message to APEX.
   *
   * @param {string} userMessage
   * @param {Object|null} coachContext - Current training snapshot
   * @param {Array} conversationHistory - Prior messages [{role, content}]
   * @param {Object|null} athleteProfile - Onboarding profile
   * @param {Array} journalEntries - Weekly snapshots for trend memory
   * @returns {Promise<string>}
   */
  async chat(userMessage, coachContext, conversationHistory = [], athleteProfile = null, journalEntries = [], formImpressions = []) {
    if (!this.isConfigured()) {
      const label = this.provider === 'groq' ? 'Groq' : 'Claude';
      throw new Error(`${label} API key not configured. Add it in Settings.`);
    }

    const systemPrompt = buildSystemPrompt(athleteProfile, journalEntries, formImpressions);

    const apiMessages = [];

    const isFirstMessage = conversationHistory.length === 0;
    if (isFirstMessage && coachContext) {
      const contextBlock = buildContextBlock(coachContext);
      apiMessages.push({ role: 'user', content: contextBlock });
      apiMessages.push({ role: 'assistant', content: 'DATA LOADED. Ready.' });
    }

    const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
    apiMessages.push(...trimmedHistory.map(m => ({ role: m.role, content: m.content })));
    apiMessages.push({ role: 'user', content: userMessage });

    if (this.provider === 'groq') {
      return this._chatGroq(systemPrompt, apiMessages);
    }
    return this._chatClaude(systemPrompt, apiMessages);
  }

  async _chatClaude(systemPrompt, messages) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      let errMsg = `Claude API error ${response.status}`;
      try { const b = await response.json(); errMsg = b?.error?.message || errMsg; } catch (_) { }
      throw new Error(errMsg);
    }

    const data = await response.json();
    return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }

  async _chatGroq(systemPrompt, messages) {
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      let errMsg = `Groq API error ${response.status}`;
      try { const b = await response.json(); errMsg = b?.error?.message || errMsg; } catch (_) { }
      throw new Error(errMsg);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ─── Quick-action message builders ──────────────────────────

  static formCheckMessage(coachContext) {
    const ctx = buildContextBlock(coachContext);
    return `FORM CHECK REQUEST\n\n${ctx}\n\nGive me your full form assessment. FORM | CONCERN | PRESCRIPTION | WATCH.`;
  }

  static todayWorkoutMessage(coachContext) {
    const ctx = buildContextBlock(coachContext);
    return `TODAY'S WORKOUT REQUEST\n\n${ctx}\n\nWhat specific workout should I do today? Give exact targets: zone, duration, watts/pace, HR cap. No options — one prescription.`;
  }

  static buildWeekMessage(coachContext) {
    const ctx = buildContextBlock(coachContext);
    return `WEEKLY PLAN REQUEST\n\n${ctx}\n\nBuild me a full 7-day training plan. List each day: workout type, zone, duration, specific targets. Include at least one rest/recovery day. Be specific.`;
  }

  static planReviewMessage(coachContext) {
    const ctx = buildContextBlock(coachContext);
    return `PLAN REVIEW REQUEST\n\n${ctx}\n\nReview my last 4 weeks of training. What patterns concern you? What am I doing wrong? What should I change immediately?`;
  }
}

export const aiCoachService = new AICoachService();
export default AICoachService;
