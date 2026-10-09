import React, { useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';

/**
 * Inline ⓘ icon that shows a sourced tooltip on hover.
 *
 * Props:
 *   label       — metric abbreviation shown bold at top (e.g. "TSS")
 *   description — plain-language explanation
 *   formula     — optional formula string rendered in mono
 *   source      — data origin / literature reference
 */
export default function InfoTip({ label, description, formula, source }) {
  const [rect, setRect] = useState(null);
  const iconRef = useRef(null);

  const show = useCallback(() => {
    if (iconRef.current) setRect(iconRef.current.getBoundingClientRect());
  }, []);

  const hide = useCallback(() => setRect(null), []);

  const tooltip = rect ? ReactDOM.createPortal(
    <div
      onMouseEnter={show}
      onMouseLeave={hide}
      style={{
        position: 'fixed',
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
        transform: 'translate(-50%, -100%)',
        zIndex: 99999,
        background: 'var(--bg-1)',
        border: '1px solid var(--border-accent)',
        borderRadius: 10,
        padding: '10px 14px',
        maxWidth: 300,
        minWidth: 200,
        boxShadow: 'var(--shadow-lg)',
        pointerEvents: 'none',
      }}
    >
      {/* Arrow */}
      <div style={{
        position: 'absolute',
        bottom: -5,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: '5px solid var(--border-accent)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: -4,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: '4px solid var(--bg-1)',
      }} />

      {label && (
        <div style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--text-0)',
          marginBottom: 5,
        }}>
          {label}
        </div>
      )}
      {description && (
        <div style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--text-1)',
          lineHeight: 1.5,
          marginBottom: formula || source ? 7 : 0,
        }}>
          {description}
        </div>
      )}
      {formula && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          color: 'var(--text-2)',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 5,
          padding: '4px 8px',
          marginBottom: source ? 6 : 0,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {formula}
        </div>
      )}
      {source && (
        <div style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          color: 'var(--text-3)',
          borderTop: '1px solid var(--border)',
          paddingTop: 5,
          marginTop: formula || description ? 0 : 0,
        }}>
          {source}
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <span
        ref={iconRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 13,
          height: 13,
          borderRadius: '50%',
          border: '1px solid var(--border-accent)',
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'serif',
          color: 'var(--text-3)',
          cursor: 'help',
          marginLeft: 5,
          userSelect: 'none',
          transition: 'border-color 0.15s, color 0.15s',
          lineHeight: 1,
        }}
        onMouseOver={e => {
          e.currentTarget.style.borderColor = 'var(--pine)';
          e.currentTarget.style.color = 'var(--pine)';
        }}
        onMouseOut={e => {
          e.currentTarget.style.borderColor = 'var(--border-accent)';
          e.currentTarget.style.color = 'var(--text-3)';
        }}
      >
        i
      </span>
      {tooltip}
    </span>
  );
}
