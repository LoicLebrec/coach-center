import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

/**
 * HelpPopup — a visible ? button that opens a floating help panel on click.
 *
 * Props:
 *   title   — section name shown bold at top
 *   content — array of { heading?, text } or a plain string
 *   tips    — optional array of short bullet strings shown as tips
 */
export default function HelpPopup({ title, content, tips }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);

  const toggle = useCallback((e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen(o => !o);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  // Reposition if button rect changes (scroll)
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => setRect(btnRef.current?.getBoundingClientRect() ?? null);
    window.addEventListener('scroll', update, true);
    return () => window.removeEventListener('scroll', update, true);
  }, [open]);

  const panel = open && rect ? ReactDOM.createPortal(
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        zIndex: 99999,
        top: rect.bottom + 8,
        left: Math.min(rect.left, window.innerWidth - 300 - 12),
        width: 290,
        background: '#131a26',
        border: '1px solid rgba(34,211,238,0.25)',
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(34,211,238,0.06)',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {title || 'Help'}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer',
          fontSize: 14, lineHeight: 1, padding: '0 2px',
        }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', maxHeight: 320, overflowY: 'auto' }}>
        {typeof content === 'string' ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{content}</p>
        ) : Array.isArray(content) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {content.map((block, i) => (
              <div key={i}>
                {block.heading && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', marginBottom: 3, letterSpacing: '0.05em' }}>
                    {block.heading}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{block.text}</p>
              </div>
            ))}
          </div>
        ) : null}

        {tips && tips.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', letterSpacing: '0.08em', marginBottom: 6 }}>CONSEILS</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {tips.map((tip, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, paddingLeft: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: 'var(--accent-cyan)' }}>›</span>
                  {tip}
                </li>
              ))}
            </ul>
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
          width: 18, height: 18, borderRadius: '50%',
          border: `1px solid ${open ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.15)'}`,
          background: open ? 'rgba(34,211,238,0.12)' : 'transparent',
          fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-sans)',
          color: open ? 'var(--accent-cyan)' : 'var(--text-4)',
          cursor: 'pointer', marginLeft: 6,
          transition: 'all 0.15s', lineHeight: 1,
          flexShrink: 0,
        }}
        onMouseOver={e => { if (!open) { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)'; e.currentTarget.style.color = 'var(--text-2)'; } }}
        onMouseOut={e => { if (!open) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'var(--text-4)'; } }}
      >
        ?
      </button>
      {panel}
    </span>
  );
}
