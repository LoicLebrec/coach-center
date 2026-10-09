import React from 'react';

/** App mark: a pass at sunrise with the road climbing to it. Same drawing as public/logo.svg. */
export default function Logo({ size = 36, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs><clipPath id="logo-clip"><rect width="48" height="48" rx="12" /></clipPath></defs>
      <g clipPath="url(#logo-clip)">
        <rect width="48" height="48" fill="#24402e" />
        <circle cx="33" cy="15" r="6" fill="#f0663a" />
        <polygon points="2,42 18,17 26,28 30,23 46,42" fill="#8db255" />
        <polygon points="18,17 15.2,21.5 18,20.4 20.8,21.8" fill="#f3f6e4" />
        <path d="M0 48 V35 L12 28 L22 34 L31 29 L48 37 V48Z" fill="#c9e08f" />
        <path d="M17 49 C26 44 15 39 23 35 S21 30 25 28" fill="none" stroke="#f3f6e4" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}
