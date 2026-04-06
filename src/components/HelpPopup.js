import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

/**
 * HelpPopup — a ? button that opens a clean floating help panel on click.
 *
 * Props:
 *   title   — section name shown in the panel header
 *   content — array of { heading?, text } objects or a plain string
 *   tips    — optional short bullet string array
 */
export default function HelpPopup({ title, content, tips }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const toggle = useCallback((e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    setOpen(o => !o);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!e.target.closest?.('[data-helppopup]')) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const panel = open ? ReactDOM.createPortal(
    <div
      data-helppopup="1"
      style={{
        position: 'fixed',
        zIndex: 99999,
        top: pos.top,
        left: Math.min(pos.left, window.innerWidth - 280 - 8),
        width: 272,
        background: '#0f1a2e',
        border: '1px solid rgba(34,211,238,0.3)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        animation: 'helpFadeIn 0.12s ease',
      }}
    >
      <style>{`@keyframes helpFadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }`}</style>

      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(34,211,238,0.08)',
        borderBottom: '1px solid rgba(34,211,238,0.15)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {title || 'Aide'}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: 'var(--text-4)',
          cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px 12px', maxHeight: 280, overflowY: 'auto' }}>
        {typeof content === 'string' ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.65 }}>{content}</p>
        ) : Array.isArray(content) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {content.map((block, i) => (
              <div key={i}>
                {block.heading && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', marginBottom: 2, letterSpacing: '0.04em' }}>
                    {block.heading}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{block.text}</p>
              </div>
            ))}
          </div>
        ) : null}

        {tips && tips.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', marginBottom: 5, letterSpacing: '0.06em' }}>CONSEILS</div>
            {tips.map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <span style={{ color: 'var(--accent-cyan)', flexShrink: 0, fontSize: 11, lineHeight: '18px' }}>›</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>{tip}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Aide"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%',
          border: `1px solid ${open ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.18)'}`,
          background: open ? 'rgba(34,211,238,0.15)' : 'transparent',
          fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
          color: open ? 'var(--accent-cyan)' : 'var(--text-4)',
          cursor: 'pointer', marginLeft: 6,
          transition: 'all 0.12s', lineHeight: 1, flexShrink: 0,
          userSelect: 'none',
        }}
        onMouseOver={e => { if (!open) { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)'; e.currentTarget.style.color = 'var(--text-2)'; } }}
        onMouseOut={e => { if (!open) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = 'var(--text-4)'; } }}
      >
        ?
      </button>
      {panel}
    </span>
  );
}
