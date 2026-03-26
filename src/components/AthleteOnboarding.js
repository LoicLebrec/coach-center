import React, { useState } from 'react';

const STEPS = [
  {
    field: 'primarySport',
    question: 'What is your primary sport?',
    type: 'single',
    options: ['Cycling', 'Triathlon', 'Running', 'Duathlon', 'Other endurance'],
  },
  {
    field: 'seasonGoal',
    question: 'What is your main goal this season?',
    type: 'single',
    options: [
      'Peak performance at A-race',
      'Build aerobic base (no race target)',
      'Improve threshold / race pace',
      'Stay healthy and consistent',
      'Return from injury / time off',
    ],
  },
  {
    field: 'eventTimeline',
    question: 'When is your next target event?',
    type: 'single',
    options: [
      'Racing in < 4 weeks',
      'Racing in 4–8 weeks',
      'Racing in 8–16 weeks',
      'Racing in 16+ weeks',
      'No target race',
    ],
  },
  {
    field: 'weeklyHours',
    question: 'How many hours per week can you train?',
    type: 'single',
    options: ['< 5 hours', '5–8 hours', '8–12 hours', '12–16 hours', '16+ hours'],
  },
  {
    field: 'weaknesses',
    question: 'What are your main weaknesses? Select all that apply.',
    type: 'multi',
    options: [
      'Aerobic base / Z2 durability',
      'VO2max / short power',
      'FTP / threshold',
      'Sprint / neuromuscular power',
      'Climbing',
      'Recovery management',
      'Training consistency',
    ],
  },
  {
    field: 'trainingApproach',
    question: 'Which training approach do you follow?',
    type: 'single',
    options: [
      'Polarized (80% easy, 20% hard)',
      'Pyramidal (mostly easy with some threshold)',
      'Sweet spot / threshold-heavy',
      'By feel / heart rate',
      'Not sure — build me one',
    ],
  },
  {
    field: 'injuryHistory',
    question: 'Do you have any injury history or physical limiters?',
    type: 'single',
    options: [
      'None — fully healthy',
      'Minor issues (managed)',
      'Recurring problem I work around',
      'Recent injury (< 3 months)',
    ],
  },
  {
    field: 'coachStyle',
    question: 'How do you want APEX to coach you?',
    type: 'single',
    options: [
      'Brutal honesty — no mercy',
      'Direct and analytical — data first',
      'Demanding but constructive',
      'Push me harder than I push myself',
    ],
  },
];

export default function AthleteOnboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({});

  const current = STEPS[step];
  const value = profile[current.field];

  const isMulti = current.type === 'multi';
  const selectedSet = isMulti ? new Set(value || []) : null;

  const canProceed = isMulti
    ? (value?.length || 0) > 0
    : !!value;

  const handleSingleSelect = (option) => {
    setProfile(p => ({ ...p, [current.field]: option }));
  };

  const handleMultiToggle = (option) => {
    setProfile(p => {
      const prev = new Set(p[current.field] || []);
      if (prev.has(option)) {
        prev.delete(option);
      } else {
        prev.add(option);
      }
      return { ...p, [current.field]: Array.from(prev) };
    });
  };

  const handleNext = () => {
    if (!canProceed) return;
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      onComplete(profile);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const handleSkip = () => {
    onComplete({});
  };

  return (
    <div className="onboarding-wrapper">
      <div className="onboarding-terminal">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-title">[⚡ APEX] — PLAYER SETUP</div>
          <div className="onboarding-progress">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`progress-segment ${i <= step ? 'done' : ''}`}
              />
            ))}
          </div>
          <div className="onboarding-step-counter">
            STEP {step + 1} / {STEPS.length}
          </div>
        </div>

        {/* Question */}
        <div className="onboarding-question">{current.question}</div>

        {/* Options */}
        <div className={`onboarding-options${isMulti ? ' multi' : ''}`}>
          {current.options.map((option) => {
            const isSelected = isMulti
              ? selectedSet.has(option)
              : value === option;
            return (
              <button
                key={option}
                className={`option-btn${isSelected ? ' selected' : ''}`}
                onClick={() =>
                  isMulti ? handleMultiToggle(option) : handleSingleSelect(option)
                }
              >
                {isMulti && (
                  <span className="option-checkbox">
                    {isSelected ? '[X]' : '[ ]'}
                  </span>
                )}
                {option}
              </button>
            );
          })}
        </div>

        {/* Navigation */}
        <div className="onboarding-nav">
          <button
            className="onboarding-skip"
            onClick={handleSkip}
            title="Skip setup and go straight to chat"
          >
            SKIP SETUP
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="onboarding-nav-btn onboarding-back-btn" onClick={handleBack}>
                ◄ BACK
              </button>
            )}
            <button
              className="onboarding-nav-btn onboarding-next-btn"
              onClick={handleNext}
              disabled={!canProceed}
            >
              {step === STEPS.length - 1 ? 'ACTIVATE APEX ►' : 'NEXT ►'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
