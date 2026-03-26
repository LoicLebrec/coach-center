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
  claudeApiKey,
  onNeedApiKey,
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Typewriter state
  const [typingId, setTypingId] = useState(null);
  const [typedContent, setTypedContent] = useState('');
  const typewriterRef = useRef(null);

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
      const [history, profile] = await Promise.all([
        persistence.getConversationHistory(),
        persistence.getAthleteProfile(),
      ]);
      if (history?.length) {
        setMessages(history);
        // Restore message counter beyond existing IDs to avoid collisions
        msgCounter.current = history.length;
      }
      setAthleteProfile(profile);
      setProfileLoaded(true);
    })();
  }, []);

  // Configure AI service when API key changes
  useEffect(() => {
    aiCoachService.configure(claudeApiKey);
  }, [claudeApiKey]);

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

  const sendMessage = useCallback(
    async (text) => {
      if (!text?.trim() || isLoading || !claudeApiKey) return;
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
        setTypingId(null);
      }

      const userMsg = {
        id: makeId(),
        role: 'user',
        content: text.trim(),
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
          athleteProfile
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
    [messages, isLoading, claudeApiKey, coachContext, athleteProfile, startTypewriter]
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
  }, []);

  const handleResetProfile = useCallback(async () => {
    await persistence.saveAthleteProfile(null);
    setAthleteProfile(null);
    await handleClearHistory();
  }, [handleClearHistory]);

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
  if (!athleteProfile) {
    return (
      <div className="coach-view">
        <AthleteOnboarding onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  // ── No API key prompt ────────────────────────────────────
  if (!claudeApiKey) {
    return (
      <div className="coach-view">
        <div className="coach-init-screen">
          <div className="no-key-box">
            <div className="no-key-title">[⚡ APEX] OFFLINE</div>
            <div className="no-key-body">
              Claude API key required to activate APEX coaching.
            </div>
            <button className="coach-send-btn" onClick={onNeedApiKey}>
              CONFIGURE IN SETTINGS
            </button>
            <button
              className="hud-clear-btn"
              style={{ marginTop: 8 }}
              onClick={handleResetProfile}
            >
              RESET PLAYER PROFILE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main chat interface ──────────────────────────────────
  const visibleMessages = messages.filter((m) => !m._isContext);

  return (
    <div className="coach-view">
      {/* ── HUD bar ── */}
      <div className="coach-hud">
        <span className="hud-apex-label">[⚡ APEX]</span>

        <div className="hud-sep" />

        {ctl != null && (
          <>
            <div className="hud-metric">
              <span className="hud-label">CTL</span>
              <span className="hud-value" style={{ color: 'var(--ctl-color)' }}>
                {ctl.toFixed(1)}
              </span>
            </div>
            <div className="hud-sep" />
          </>
        )}

        {atl != null && (
          <>
            <div className="hud-metric">
              <span className="hud-label">ATL</span>
              <span className="hud-value" style={{ color: 'var(--atl-color)' }}>
                {atl.toFixed(1)}
              </span>
            </div>
            <div className="hud-sep" />
          </>
        )}

        {tsb != null && (
          <>
            <div className="hud-metric">
              <span className="hud-label">TSB</span>
              <span
                className="hud-value"
                style={{ color: tsb >= 0 ? 'var(--tsb-color)' : 'var(--accent-red)' }}
              >
                {tsb >= 0 ? '+' : ''}{tsb.toFixed(1)}
              </span>
            </div>
            <div className="hud-sep" />
          </>
        )}

        {ftp && (
          <>
            <div className="hud-metric">
              <span className="hud-label">FTP</span>
              <span className="hud-value">{ftp}W</span>
            </div>
            <div className="hud-sep" />
          </>
        )}

        {streak > 0 && (
          <>
            <div className="hud-metric">
              <span className="hud-label">STREAK</span>
              <span className="hud-value" style={{ color: 'var(--accent-yellow)' }}>
                {streak}d
              </span>
            </div>
            <div className="hud-sep" />
          </>
        )}

        {formState && (
          <div className={`hud-form-badge ${getFormClass(formState.state)}`}>
            {formState.label.toUpperCase()}
          </div>
        )}

        <div className="hud-right">
          <button
            className="hud-clear-btn"
            onClick={handleClearHistory}
            title="Clear conversation history"
          >
            NEW SESSION
          </button>
          <button
            className="hud-clear-btn"
            onClick={handleResetProfile}
            title="Reset player profile"
            style={{ marginLeft: 6 }}
          >
            RESET PROFILE
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="coach-messages">
        {visibleMessages.length === 0 && !isLoading && (
          <div className="coach-empty-state">
            <div className="empty-apex-art">
{`  ██████╗ ██████╗ ███████╗██╗  ██╗
  ██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝
  ███████║██████╔╝█████╗   ╚███╔╝
  ██╔══██║██╔═══╝ ██╔══╝   ██╔██╗
  ██║  ██║██║     ███████╗██╔╝ ██╗
  ╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝`}
            </div>
            <div className="empty-tagline">ELITE TRAINING COACH // SESSION READY</div>
            <div className="empty-hint">
              Select a quick action or type your question below.
            </div>
          </div>
        )}

        {visibleMessages.map((msg) => {
          const isTypingThis = msg.id === typingId;
          const content = isTypingThis ? typedContent : msg.content;

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
                <div className="msg-prefix">[APEX] SYSTEM ERROR</div>
                <div className="msg-content">{content}</div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="coach-msg assistant">
              <div className="msg-prefix">[APEX]</div>
              <div className="msg-content">
                {content}
                {isTypingThis && <span className="typing-cursor" />}
              </div>
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
          placeholder="ASK APEX ANYTHING..."
          disabled={isLoading}
          autoFocus
        />
        <button
          className="coach-send-btn"
          onClick={() => sendMessage(inputText)}
          disabled={isLoading || !inputText.trim()}
        >
          {isLoading ? '···' : 'TRANSMIT'}
        </button>
      </div>
    </div>
  );
}
