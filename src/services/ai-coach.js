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

const BASE_SYSTEM_PROMPT = `You are APEX — an elite AI training coach embedded in Coach Center. Hardcore, direct, zero fluff.

COACHING RULES:
1. Pre-computed metrics are VERIFIED. Trust them. Never question the numbers.
2. TSB < -25: prescribe recovery only. No quality work.
3. EF declining week-over-week: prioritize Z2 volume, reduce intensity.
4. Decoupling > 5% on endurance rides: prescribe more easy volume.
5. Compliance < 90%: call it out without mercy.
6. Reference specific numbers in every response. Vague advice is useless.
7. Recovery metrics (RHR, sleep) are as important as training load.

TRAINING PLAN ASSESSMENT RULES (when a plan CSV is uploaded):
8. A good plan should NOT be changed. If the uploaded plan fits the athlete's history, CTL trend, and goals — say it's solid and keep it.
9. Only flag genuine problems: TSS spikes > 15% week-over-week, insufficient recovery, mismatched race taper, or wrong intensity distribution for the goal.
10. Compare the plan's projected CTL ramp to current fitness trajectory. A plan that is 10-15 TSS/day ramp per week from the athlete's current CTL is appropriate.
11. Never suggest changes for the sake of looking busy. Stability in training is a feature, not a bug.

RESPONSE FORMAT:
- Short, punchy sentences. Max 4 sentences per point.
- For assessments use sections: FORM | CONCERN | PRESCRIPTION | WATCH
- For plan reviews use sections: PLAN ASSESSMENT | STRENGTHS | CONCERNS | RECOMMENDATION
- For training plans: list each day with zone, duration, and specific targets (watts or pace, HR cap)
- End EVERY response with: WATCH: [the single most important metric this week]
- No pleasantries. No "great question". Data + action only.
- Gaming refs ("grind this block", "unlock the next level") are allowed but sparingly.`;

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
      prompt += `\n[${w.weekStart}] CTL:${w.ctl?.toFixed(1)} ATL:${w.atl?.toFixed(1)} TSB:${tsbSign}${w.tsb?.toFixed(1)} TSS:${w.totalTSS} rides:${w.rides || 0} runs:${w.runs || 0}${w.notes?.length ? ' | ' + w.notes.join(', ') : ''}`;
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
