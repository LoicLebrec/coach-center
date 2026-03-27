import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import persistence from '../services/persistence';
import { aiCoachService } from '../services/ai-coach';
import AICoachService from '../services/ai-coach';
import analytics from '../services/analytics';
import AthleteOnboarding from './AthleteOnboarding';
import { exportWorkoutFit, hasWorkoutContent } from '../services/workout-exporter';

// ── Offline setup screen ─────────────────────────────────
function ApexOfflineScreen({ llmProvider, onActivate, onSettings, onResetProfile }) {
  const [tab, setTab] = useState(llmProvider || 'groq');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setSaving(true);
    await onActivate(tab, key.trim());
  };

  return (
    <div className="coach-view">
      <div className="coach-init-screen">
        <div className="no-key-box" style={{ maxWidth: 480, width: '100%' }}>
          <div className="no-key-title" style={{ marginBottom: 6 }}>[APEX] OFFLINE</div>
          <div className="no-key-body" style={{ marginBottom: 20 }}>
            Choose an AI provider and enter your API key to activate coaching.
          </div>

          {/* Provider tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, width: '100%' }}>
            <button
              className={`hud-clear-btn${tab === 'groq' ? ' active-tab' : ''}`}
              style={{ flex: 1, fontSize: 11, padding: '6px 0', ...(tab === 'groq' ? { color: '#fff', borderColor: 'var(--accent-blue)', background: 'rgba(59,130,246,0.1)' } : {}) }}
              onClick={() => setTab('groq')}
            >
              GROQ — FREE
            </button>
            <button
              className={`hud-clear-btn${tab === 'claude' ? ' active-tab' : ''}`}
              style={{ flex: 1, fontSize: 11, padding: '6px 0', ...(tab === 'claude' ? { color: '#fff', borderColor: 'var(--accent-blue)', background: 'rgba(59,130,246,0.1)' } : {}) }}
              onClick={() => setTab('claude')}
            >
              CLAUDE — PAID
            </button>
          </div>

          {tab === 'groq' && (
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.7, textAlign: 'left', width: '100%' }}>
              Groq is <strong style={{ color: 'var(--accent-blue)' }}>free</strong> — llama-3.3-70b, fast, 14k req/day<br />
              1. Sign up at <span style={{ color: 'var(--accent-cyan)' }}>console.groq.com</span><br />
              2. Create an API key (starts with <code style={{ color: 'var(--accent-blue)' }}>gsk_</code>)
            </div>
          )}
          {tab === 'claude' && (
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.7, textAlign: 'left', width: '100%' }}>
              Anthropic Claude Sonnet — best coaching quality<br />
              1. Go to <span style={{ color: 'var(--accent-cyan)' }}>console.anthropic.com</span> → API Keys<br />
              2. Key starts with <code style={{ color: 'var(--accent-blue)' }}>sk-ant-</code>
            </div>
          )}

          <input
            className="coach-input"
            style={{ width: '100%', border: '1px solid var(--coach-border)', borderRadius: 3, padding: '8px 12px', marginBottom: 12, background: 'rgba(59,130,246,0.04)' }}
            type="password"
            placeholder={tab === 'groq' ? 'gsk_...' : 'sk-ant-...'}
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleActivate()}
            autoFocus
          />

          <button
            className="coach-send-btn"
            style={{ width: '100%', marginBottom: 10 }}
            onClick={handleActivate}
            disabled={!key.trim() || saving}
          >
            {saving ? 'ACTIVATING...' : 'ACTIVATE APEX'}
          </button>

          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button className="hud-clear-btn" style={{ flex: 1 }} onClick={onSettings}>
              OPEN SETTINGS
            </button>
            <button className="hud-clear-btn" style={{ flex: 1 }} onClick={() => {
              if (window.confirm('Reset player profile? This cannot be undone.')) onResetProfile();
            }}>
              RESET PROFILE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  {
    id: 'form',
    label: 'FORM CHECK',
    build: (ctx) => AICoachService.formCheckMessage(ctx),
  },
  {
    id: 'today',
    label: "TODAY'S WORKOUT",
    build: (ctx) => AICoachService.todayWorkoutMessage(ctx),
  },
  {
    id: 'week',
    label: 'BUILD MY WEEK',
    build: (ctx) => AICoachService.buildWeekMessage(ctx),
  },
  {
    id: 'review',
    label: 'PLAN REVIEW',
    build: (ctx) => AICoachService.planReviewMessage(ctx),
  },
];

function getFormClass(state) {
  const map = {
    transition: 'form-transition',
    fresh: 'form-fresh',
    optimal: 'form-fresh',
    neutral: 'form-neutral',
    tired: 'form-fatigued',
    overreaching: 'form-overreaching',
  };
  return map[state] || 'form-neutral';
}

function computeStreak(activities) {
  if (!activities?.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let day = new Date(today);
  const activityDays = new Set(
    activities.map((a) => a.start_date_local?.split('T')[0])
  );
  while (true) {
    const key = day.toISOString().split('T')[0];
    if (activityDays.has(key)) {
      streak++;
    } else if (streak > 0) {
      break;
    }
    day.setDate(day.getDate() - 1);
    if (streak === 0 && day < new Date(today.getTime() - 86400000)) break;
  }
  return streak;
}

export default function CoachChat({
  wellness,
  activities,
  athlete,
  events,
  plannedEvents,
  claudeApiKey,
  groqApiKey,
  llmProvider,
  onNeedApiKey,
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [journalEntries, setJournalEntries] = useState([]);
  const [formImpressions, setFormImpressions] = useState([]);
  const [editingProfile, setEditingProfile] = useState(false);

  // Typewriter state
  const [typingId, setTypingId] = useState(null);
  const [typedContent, setTypedContent] = useState('');
  const typewriterRef = useRef(null);
  const csvInputRef = useRef(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const msgCounter = useRef(0);

  const makeId = () => String(++msgCounter.current) + '_' + Date.now();

  // Pre-compute coach context from training data
  const coachContext = useMemo(() => {
    if (!wellness?.length && !activities?.length) return null;
    return analytics.buildCoachContext(wellness, activities, events, athlete);
  }, [wellness, activities, events, athlete]);

  // Latest PMC values for HUD
  const latest = wellness?.[wellness.length - 1];
  const ctl = latest?.icu_ctl ?? null;
  const atl = latest?.icu_atl ?? null;
  const tsb = ctl != null && atl != null ? ctl - atl : null;
  const ftp = athlete?.icu_ftp ?? null;
  const formState = tsb != null ? analytics.assessFormState(tsb) : null;
  const streak = useMemo(() => computeStreak(activities), [activities]);

  // Load persisted data on mount
  useEffect(() => {
    (async () => {
      const [history, profile, journal, impressions] = await Promise.all([
        persistence.getConversationHistory(),
        persistence.getAthleteProfile(),
        persistence.getRecentJournal(8),
        persistence.getFormImpressions(),
      ]);
      if (history?.length) {
        setMessages(history);
        msgCounter.current = history.length;
      }
      setAthleteProfile(profile);
      setJournalEntries(journal || []);
      setFormImpressions(impressions || []);
      setProfileLoaded(true);
    })();
  }, []);

  // Configure AI service when keys/provider change
  useEffect(() => {
    aiCoachService.configure(claudeApiKey);
    aiCoachService.configureGroq(groqApiKey);
    aiCoachService.setProvider(llmProvider);
  }, [claudeApiKey, groqApiKey, llmProvider]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typedContent]);

  // Cleanup typewriter on unmount
  useEffect(() => {
    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, []);

  const startTypewriter = useCallback((messageId, fullText) => {
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    let i = 0;
    setTypingId(messageId);
    setTypedContent('');

    typewriterRef.current = setInterval(() => {
      // Adaptive speed: faster for long messages
      const charsPerTick = Math.max(1, Math.floor(fullText.length / 250));
      i = Math.min(i + charsPerTick, fullText.length);
      setTypedContent(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
        setTypingId(null);
      }
    }, 16);
  }, []);

  const isLlmConfigured = (llmProvider === 'groq') ? !!groqApiKey : !!claudeApiKey;

  const sendMessage = useCallback(
    async (text, options = {}) => {
      if (!text?.trim() || isLoading || !isLlmConfigured) return;
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
        setTypingId(null);
      }

      const userMsg = {
        id: makeId(),
        role: 'user',
        content: text.trim(),
        displayContent: options.displayContent || null,
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInputText('');
      setIsLoading(true);

      try {
        // Pass history (excluding the new user msg we just added)
        const historyForApi = messages.filter((m) => !m._isContext);

        const reply = await aiCoachService.chat(
          text.trim(),
          coachContext,
          historyForApi,
          athleteProfile,
          journalEntries,
          formImpressions
        );

        const assistantMsg = {
          id: makeId(),
          role: 'assistant',
          content: reply,
          timestamp: new Date().toISOString(),
        };

        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);

        // Persist (cap at 60 messages)
        await persistence.saveConversationHistory(finalMessages.slice(-60));

        startTypewriter(assistantMsg.id, reply);
      } catch (err) {
        const errorMsg = {
          id: makeId(),
          role: 'error',
          content: `ERROR: ${err.message}`,
          timestamp: new Date().toISOString(),
        };
        const withError = [...updatedMessages, errorMsg];
        setMessages(withError);
        await persistence.saveConversationHistory(withError.slice(-60));
      } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [messages, isLoading, isLlmConfigured, coachContext, athleteProfile, journalEntries, formImpressions, startTypewriter]
  );

  const handleClearHistory = useCallback(async () => {
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    setMessages([]);
    setTypingId(null);
    setTypedContent('');
    await persistence.clearConversationHistory();
    inputRef.current?.focus();
  }, []);

  const handleOnboardingComplete = useCallback(async (profile) => {
    await persistence.saveAthleteProfile(profile);
    setAthleteProfile(profile);
    setEditingProfile(false);
  }, []);

  const handleResetProfile = useCallback(async () => {
    if (!window.confirm('Reset player profile and clear all conversation history? This cannot be undone.')) return;
    await persistence.saveAthleteProfile(null);
    setAthleteProfile(null);
    setEditingProfile(false);
    await handleClearHistory();
  }, [handleClearHistory]);

  // ── CSV training plan upload ──────────────────────────────
  const handleCsvUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const msg = `TRAINING PLAN UPLOAD — Please analyse this plan and compare it to my recent training history. Assess whether it is appropriate given my current CTL/ATL/TSB and fitness trends. If the plan is solid, say so — do NOT change it for the sake of changing it. Only flag real problems.

\`\`\`csv
${text.slice(0, 4000)}
\`\`\`

Format your response: PLAN ASSESSMENT | STRENGTHS | CONCERNS (if any) | RECOMMENDATION`;
      sendMessage(msg, {
        displayContent: `↑ Training plan uploaded: ${file.name}\n${text.split('\n').length} rows — analysing with APEX...`,
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [sendMessage]);

  // ── Loading skeleton ──────────────────────────────────────
  if (!profileLoaded) {
    return (
      <div className="coach-view">
        <div className="coach-init-screen">
          <span className="phosphor-text">INITIALIZING APEX</span>
          <div className="coach-thinking">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  // ── Onboarding gate ──────────────────────────────────────
  if (!athleteProfile || editingProfile) {
    return (
      <div className="coach-view">
        <AthleteOnboarding
          onComplete={handleOnboardingComplete}
          existingProfile={editingProfile ? athleteProfile : undefined}
        />
      </div>
    );
  }

  // ── No API key prompt ────────────────────────────────────
  if (!isLlmConfigured) {
    return <ApexOfflineScreen
      llmProvider={llmProvider}
      onActivate={async (provider, key) => {
        if (provider === 'groq') {
          await persistence.saveGroqApiKey(key);
          await persistence.saveLlmProvider('groq');
        } else {
          await persistence.saveClaudeApiKey(key);
          await persistence.saveLlmProvider('claude');
        }
        onNeedApiKey(); // triggers App re-load via Settings nav
        window.location.reload(); // simplest way to re-init service
      }}
      onSettings={onNeedApiKey}
      onResetProfile={handleResetProfile}
    />;
  }


  // ── Main chat interface ──────────────────────────────────
  const visibleMessages = messages.filter((m) => !m._isContext);

  return (
    <div className="coach-view">
      {/* ── APEX header ── */}
      <div className="apex-header">
        <div className="apex-header-brand">APEX</div>
        <div className="apex-header-sub">Elite Training Coach</div>
        <div className="apex-header-right">
          {llmProvider === 'groq' ? 'Groq · llama-3.3-70b' : 'Claude · Sonnet'}
        </div>
      </div>

      {/* ── HUD metrics bar ── */}
      <div className="coach-hud">
        {ctl != null && (
          <>
            <div className="hud-metric">
              <span className="hud-label">Fitness</span>
              <span className="hud-value" style={{ color: 'var(--ctl-color)' }}>{ctl.toFixed(1)}</span>
            </div>
            <div className="hud-sep">·</div>
          </>
        )}
        {atl != null && (
          <>
            <div className="hud-metric">
              <span className="hud-label">Fatigue</span>
              <span className="hud-value" style={{ color: 'var(--atl-color)' }}>{atl.toFixed(1)}</span>
            </div>
            <div className="hud-sep">·</div>
          </>
        )}
        {tsb != null && (
          <>
            <div className="hud-metric">
              <span className="hud-label">Form</span>
              <span className="hud-value" style={{ color: tsb >= 0 ? 'var(--tsb-color)' : 'var(--accent-red)' }}>
                {tsb >= 0 ? '+' : ''}{tsb.toFixed(1)}
              </span>
            </div>
            <div className="hud-sep">·</div>
          </>
        )}
        {ftp && (
          <>
            <div className="hud-metric">
              <span className="hud-label">FTP</span>
              <span className="hud-value">{ftp}<span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 1 }}>W</span></span>
            </div>
            <div className="hud-sep">·</div>
          </>
        )}
        {streak > 0 && (
          <>
            <div className="hud-metric">
              <span className="hud-label">Streak</span>
              <span className="hud-value" style={{ color: 'var(--accent-yellow)' }}>{streak}<span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 1 }}>d</span></span>
            </div>
            <div className="hud-sep">·</div>
          </>
        )}

        <div className="hud-right">
          {formState && (
            <div className={`hud-form-badge ${getFormClass(formState.state)}`}>
              {formState.label.toUpperCase()}
            </div>
          )}
          <button className="hud-clear-btn" onClick={handleClearHistory}>New session</button>
          <button className="hud-clear-btn" onClick={() => setEditingProfile(true)}>Edit profile</button>
          <button className="hud-clear-btn" onClick={handleResetProfile}>Reset</button>
        </div>
      </div>

      {/* ── Main area: messages ── */}
      <div className="coach-main-area">
        <div className="coach-messages">
          {visibleMessages.length === 0 && !isLoading && (
            <div className="coach-empty-state">
              <div className="apex-logo-text">APEX</div>
              <div className="apex-logo-sub">ELITE TRAINING COACH</div>
              <div className="empty-hint">
                Use the quick actions below — or upload a CSV training plan with <strong>↑ UPLOAD PLAN</strong>.
              </div>
            </div>
          )}

          {visibleMessages.map((msg) => {
            const isTypingThis = msg.id === typingId;
            const content = isTypingThis ? typedContent : (msg.displayContent || msg.content);

            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="coach-msg user">
                  <div className="msg-meta">YOU</div>
                  <div className="msg-content">{content}</div>
                </div>
              );
            }

            if (msg.role === 'error') {
              return (
                <div key={msg.id} className="coach-msg error">
                  <div className="msg-prefix">[ERR] SYSTEM ERROR</div>
                  <div className="msg-content">{content}</div>
                </div>
              );
            }

            const hasWorkout = hasWorkoutContent(msg.content || '');
            return (
              <div key={msg.id} className="coach-msg assistant">
                <div className="msg-prefix">[APEX]</div>
                <div className="msg-content">
                  {content}
                  {isTypingThis && <span className="typing-cursor" />}
                </div>
                {hasWorkout && !isTypingThis && (
                  <button
                    className="workout-export-btn"
                    onClick={() => exportWorkoutFit(
                      msg.content,
                      athlete?.icu_ftp || null,
                      athleteProfile?.primarySport === 'Running' ? 'running' : 'cycling',
                      new Date().toISOString().split('T')[0]
                    )}
                  >
                    ▼ DOWNLOAD .FIT — GARMIN WORKOUT
                  </button>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="coach-msg assistant">
              <div className="msg-prefix">[APEX] PROCESSING</div>
              <div className="msg-content">
                <div className="coach-thinking">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

      </div>

      {/* ── Quick actions ── */}
      <div className="coach-actions">
        {QUICK_ACTIONS.map(({ id, label, build }) => (
          <button
            key={id}
            className="action-btn"
            onClick={() => sendMessage(build(coachContext))}
            disabled={isLoading || typingId != null}
          >
            ► {label}
          </button>
        ))}
        <button
          className="action-btn action-btn-upload"
          onClick={() => csvInputRef.current?.click()}
          disabled={isLoading}
          title="Upload a training plan (CSV) for APEX to analyse"
        >
          ↑ UPLOAD PLAN
        </button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,.txt,.fit"
          style={{ display: 'none' }}
          onChange={handleCsvUpload}
        />
      </div>

      {/* ── Input ── */}
      <div className="coach-input-area">
        <span className="coach-prompt-symbol">&gt;</span>
        <input
          ref={inputRef}
          className="coach-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(inputText);
            }
          }}
          placeholder="Ask APEX anything..."
          disabled={isLoading}
          autoFocus
        />
        <button
          className="coach-send-btn"
          onClick={() => sendMessage(inputText)}
          disabled={isLoading || !inputText.trim()}
        >
          {isLoading ? '···' : 'Send'}
        </button>
      </div>
    </div>
  );
}
