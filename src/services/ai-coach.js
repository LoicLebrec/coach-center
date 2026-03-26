/**
 * AI Coach Service (PLANNED — Phase 2)
 * 
 * This module will connect to the Claude API to provide
 * "skeptical, elite-level" coaching interpretations.
 * 
 * Design principle: "Zero-Inference Prompting"
 * ─────────────────────────────────────────────
 * The LLM does NOT analyze raw data. Instead, analytics.js
 * pre-computes all metrics and trends into a structured JSON
 * "coach context" object. The LLM then INTERPRETS these
 * pre-calculated findings.
 * 
 * This ensures:
 * 1. The AI cannot hallucinate data patterns
 * 2. All numerical analysis is deterministic and auditable
 * 3. The AI adds coaching knowledge, not statistical inference
 * 
 * Usage (future):
 *   import aiCoach from './ai-coach';
 *   aiCoach.configure(userApiKey);
 *   const advice = await aiCoach.interpret(coachContext);
 */

const SYSTEM_PROMPT = `You are a skeptical, elite-level cycling coach. Your athlete races at category A1/open level in France, with an FTP around 295W at 77kg (3.83 W/kg).

Your coaching priorities:
1. Aerobic efficiency and glycogen sparing above all else
2. If Decoupling (Pwr:HR) exceeds 5% on an endurance ride, be CRITICAL and prescribe more Z2
3. Running volume is only relevant if it impacts cycling recovery
4. Never congratulate mediocre metrics — be honest about what needs work
5. Track Efficiency Factor trends as primary indicator of aerobic fitness progression

You will receive a JSON object containing pre-computed metrics. These numbers are VERIFIED — trust them.
Your job is to INTERPRET the trends and provide actionable coaching recommendations.

Format your response as:
1. FORM ASSESSMENT (2-3 sentences on current CTL/ATL/TSB state)
2. KEY CONCERN (the single most important issue right now)
3. PRESCRIPTION (specific workout or adjustment for the next 3-5 days)
4. MONITORING (what metric to watch this week)

Be concise. Be direct. No pleasantries.`;

class AICoachService {
  constructor() {
    this.apiKey = null;
    this.conversationHistory = [];
    this.model = 'claude-sonnet-4-20250514';
  }

  configure(apiKey) {
    this.apiKey = apiKey;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Send a pre-computed coach context to Claude for interpretation.
   * 
   * @param {Object} coachContext - Output of analytics.buildCoachContext()
   * @param {string} userMessage - Optional follow-up question from athlete
   * @returns {Promise<string>} - Coach's response
   */
  async interpret(coachContext, userMessage = null) {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured. Set it in Settings.');
    }

    const messages = [
      ...this.conversationHistory,
    ];

    // First message: structured context
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: `Here is my current training data:\n\n${JSON.stringify(coachContext, null, 2)}\n\nAnalyze my current form and give me your coaching assessment.`,
      });
    }

    // Follow-up question
    if (userMessage) {
      messages.push({
        role: 'user',
        content: userMessage,
      });
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const assistantMessage = data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      // Maintain conversation history for follow-ups
      this.conversationHistory = [
        ...messages,
        { role: 'assistant', content: assistantMessage },
      ];

      return assistantMessage;
    } catch (err) {
      throw new Error(`Coach AI error: ${err.message}`);
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }
}

export const aiCoachService = new AICoachService();
export default AICoachService;
