import React, { useState } from 'react';
import { RACE_TYPES, WEAKNESSES, SEASON_PHASES, saveProfile } from '../services/athlete-profile';
import Picto from './Pictos';

export default function AthleteProfileSetup({ onComplete, initialProfile = null }) {
  const [step, setStep] = useState(1);
  const [raceType, setRaceType]     = useState(initialProfile?.raceType || null);
  const [weaknesses, setWeaknesses] = useState(initialProfile?.weaknesses || []);
  const [strengths, setStrengths]   = useState(initialProfile?.strengths || []);
  const [phase, setPhase]           = useState(initialProfile?.phase || 'build');
  const [goal, setGoal]             = useState(initialProfile?.goal || '');

  const toggleItem = (list, setList, key) => {
    setList(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const canContinue = () => {
    if (step === 1) return !!raceType;
    if (step === 2) return weaknesses.length > 0;
    if (step === 3) return !!phase;
    return true;
  };

  const finish = () => {
    const profile = { raceType, weaknesses, strengths, phase, goal, completedAt: new Date().toISOString() };
    saveProfile(profile);
    onComplete(profile);
  };

  const cardStyle = (active) => ({
    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent-orange)' : 'var(--border)'}`,
    background: active ? 'rgba(249,115,22,0.1)' : 'var(--bg-2)',
    transition: 'all 0.15s',
    marginBottom: 8,
  });

  const badgeStyle = (active) => ({
    padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
    fontFamily: 'var(--font-mono)', fontWeight: 600,
    border: `1px solid ${active ? 'var(--accent-orange)' : 'var(--border)'}`,
    background: active ? 'rgba(249,115,22,0.12)' : 'var(--bg-3)',
    color: active ? 'var(--accent-orange)' : 'var(--text-3)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-orange)', letterSpacing: '0.1em' }}>
              PROFIL COUREUR — ÉTAPE {step}/4
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1,2,3,4].map(s => (
                <div key={s} style={{ width: 28, height: 3, borderRadius: 2, background: s <= step ? 'var(--accent-orange)' : 'var(--border)' }} />
              ))}
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-0)' }}>
            {step === 1 && 'Quel type de coureur es-tu ?'}
            {step === 2 && 'Tes points à améliorer ?'}
            {step === 3 && 'Où en es-tu dans ta saison ?'}
            {step === 4 && 'Ton objectif principal ?'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            {step === 1 && 'Le type de course détermine complètement la structure de ta préparation.'}
            {step === 2 && 'On entraîne d\'abord les faiblesses. Choisis ce que tu veux développer.'}
            {step === 3 && 'La phase détermine le ratio volume/intensité de la semaine.'}
            {step === 4 && 'Optionnel — aide à personnaliser les suggestions à long terme.'}
          </div>
        </div>

        {/* Step 1: Race type */}
        {step === 1 && (
          <div>
            {Object.entries(RACE_TYPES).map(([key, rt]) => (
              <div key={key} style={cardStyle(raceType === key)} onClick={() => setRaceType(key)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)', marginBottom: 2 }}>{rt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{rt.description}</div>
                  </div>
                  {rt.weeklyRaces && (
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 10, background: 'rgba(249,115,22,0.15)', color: 'var(--accent-orange)', border: '1px solid rgba(249,115,22,0.3)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                      Courses hebdo
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Weaknesses */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>Sélectionne 1 à 3 points à travailler en priorité</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {Object.entries(WEAKNESSES).map(([key, w]) => (
                <button key={key} onClick={() => toggleItem(weaknesses, setWeaknesses, key)} style={badgeStyle(weaknesses.includes(key))}>
                  <Picto name={w.icon} size={16} className="picto-inline" /> {w.label}
                </button>
              ))}
            </div>
            {weaknesses.length > 0 && (
              <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '12px 14px', borderLeft: '3px solid var(--accent-orange)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-orange)', marginBottom: 8 }}>FOCUS ENTRAÎNEMENT</div>
                {weaknesses.map(w => (
                  <div key={w} style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 4 }}>
                    <strong style={{ color: 'var(--text-1)' }}><Picto name={WEAKNESSES[w]?.icon} size={15} className="picto-inline" /> {WEAKNESSES[w]?.label}</strong> → {WEAKNESSES[w]?.focus}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Season phase */}
        {step === 3 && (
          <div>
            {Object.entries(SEASON_PHASES).map(([key, ph]) => (
              <div key={key} style={cardStyle(phase === key)} onClick={() => setPhase(key)}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)', marginBottom: 2 }}>{ph.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{ph.description}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${ph.intensity * 100}%`, height: '100%', background: 'var(--accent-orange)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>{Math.round(ph.intensity * 100)}% intensité</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 4: Goal */}
        {step === 4 && (
          <div>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="Ex : finir la Marmotte sous 6h, gagner en critérium d'ici juin, améliorer mon FTP de 20W..."
              style={{
                width: '100%', minHeight: 100, boxSizing: 'border-box',
                background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10,
                color: 'var(--text-0)', fontSize: 13, padding: '12px 14px',
                fontFamily: 'var(--font-sans)', resize: 'vertical', outline: 'none',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
              Cet objectif sera mentionné dans les justifications des séances proposées.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {step > 1 && (
            <button className="btn" style={{ flex: 1 }} onClick={() => setStep(s => s - 1)}>← Retour</button>
          )}
          {step < 4 ? (
            <button
              className="btn btn-primary" style={{ flex: 2 }}
              disabled={!canContinue()}
              onClick={() => setStep(s => s + 1)}
            >
              Continuer →
            </button>
          ) : (
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={finish}>
              Enregistrer mon profil
            </button>
          )}
        </div>

        {step === 4 && (
          <button style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)' }}
            onClick={finish}>
            Passer cette étape
          </button>
        )}
      </div>
    </div>
  );
}
