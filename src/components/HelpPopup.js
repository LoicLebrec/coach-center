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
        background: 'var(--bg-1)',
        border: '1.5px solid var(--border-accent)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        animation: 'helpFadeIn 0.12s ease',
      }}
    >
      <style>{`@keyframes helpFadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }`}</style>

      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--pine)', fontFamily: 'var(--font-mono)' }}>
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
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.65 }}>{content}</p>
        ) : Array.isArray(content) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {content.map((block, i) => (
              <div key={i}>
                {block.heading && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                    {block.heading}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{block.text}</p>
              </div>
            ))}
          </div>
        ) : null}

        {tips && tips.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 5 }}>Conseils</div>
            {tips.map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <span style={{ color: 'var(--pine)', flexShrink: 0, fontSize: 11, lineHeight: '18px' }}>›</span>
                <span style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.55 }}>{tip}</span>
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
          border: `1px solid ${open ? 'var(--pine)' : 'var(--border-accent)'}`,
          background: open ? 'var(--bg-2)' : 'transparent',
          fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
          color: open ? 'var(--pine)' : 'var(--text-4)',
          cursor: 'pointer', marginLeft: 6,
          transition: 'all 0.12s', lineHeight: 1, flexShrink: 0,
          userSelect: 'none',
        }}
        onMouseOver={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--pine)'; e.currentTarget.style.color = 'var(--text-2)'; } }}
        onMouseOut={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-4)'; } }}
      >
        ?
      </button>
      {panel}
    </span>
  );
}
