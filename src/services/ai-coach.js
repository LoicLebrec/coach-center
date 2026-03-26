/**
 * AI Coach Service — APEX
 *
 * "Zero-Inference" principle: analytics.js pre-computes all metrics.
 * APEX interprets pre-calculated trends, never analyzes raw data.
 *
 * The service is stateless — conversation history is owned by the
 * CoachChat component and passed in on each call.
 */

const MODEL = 'claude-sonnet-4-20250514';
const MAX_HISTORY_MESSAGES = 30; // keep context window manageable

const BASE_SYSTEM_PROMPT = `You are APEX — an elite AI training coach embedded in Coach Center. Hardcore, direct, zero fluff.

COACHING RULES:
1. Pre-computed metrics are VERIFIED. Trust them. Never question the numbers.
2. TSB < -25: prescribe recovery only. No quality work.
3. EF declining week-over-week: prioritize Z2 volume, reduce intensity.
4. Decoupling > 5% on endurance rides: prescribe more easy volume.
5. Compliance < 90%: call it out without mercy.
6. Reference specific numbers in every response. Vague advice is useless.
7. Recovery metrics (RHR, sleep) are as important as training load.

RESPONSE FORMAT:
- Short, punchy sentences. Max 4 sentences per point.
- For assessments use sections: FORM | CONCERN | PRESCRIPTION | WATCH
- For training plans: list each day with zone, duration, and specific targets (watts or pace, HR cap)
- End EVERY response with: WATCH: [the single most important metric this week]
- No pleasantries. No "great question". Data + action only.
- Gaming refs ("grind this block", "unlock the next level") are allowed but sparingly.`;

function buildSystemPrompt(athleteProfile) {
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

  return prompt;
}

function buildContextBlock(coachContext) {
  if (!coachContext) return null;
  return `[TRAINING DATA SNAPSHOT — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}]

${JSON.stringify(coachContext, null, 2)}`;
}

class AICoachService {
  constructor() {
    this.apiKey = null;
  }

  configure(apiKey) {
    this.apiKey = apiKey || null;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Send a message to APEX.
   *
   * @param {string} userMessage - The user's message
   * @param {Object|null} coachContext - Current training data (injected on first message)
   * @param {Array} conversationHistory - Prior messages [{role, content}]
   * @param {Object|null} athleteProfile - Onboarding profile
   * @returns {Promise<string>} APEX's response
   */
  async chat(userMessage, coachContext, conversationHistory = [], athleteProfile = null) {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured. Add it in Settings.');
    }

    const systemPrompt = buildSystemPrompt(athleteProfile);

    // Build the messages array for the API call
    const apiMessages = [];

    // Inject context as first user/assistant pair if this is a fresh conversation
    const isFirstMessage = conversationHistory.length === 0;
    if (isFirstMessage && coachContext) {
      const contextBlock = buildContextBlock(coachContext);
      apiMessages.push({
        role: 'user',
        content: contextBlock,
      });
      apiMessages.push({
        role: 'assistant',
        content: 'DATA LOADED. Ready.',
      });
    }

    // Append trimmed conversation history
    const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
    apiMessages.push(...trimmedHistory.map(m => ({ role: m.role, content: m.content })));

    // Append the new user message
    apiMessages.push({ role: 'user', content: userMessage });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: apiMessages,
      }),
    });

    if (!response.ok) {
      let errMsg = `API error ${response.status}`;
      try {
        const errBody = await response.json();
        errMsg = errBody?.error?.message || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    return data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
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
