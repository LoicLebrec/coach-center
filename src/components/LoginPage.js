import React, { useState } from 'react';
import { backendService } from '../services/backend-api';

// Google "G" logo SVG — no external dependency needed
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: 'block', flexShrink: 0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.705A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.705V4.963H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 7.295C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

export default function LoginPage({ onSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await backendService.login(email, password);
      } else {
        await backendService.register(email, password, name);
      }
      if (onSuccess) onSuccess();
      else window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    // Redirect to backend Google OAuth — token returned in URL after callback
    window.location.href = '/api/auth/google/start';
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-0)', padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '36px 32px', width: '100%', maxWidth: 380,
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}>

        {/* Logo */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 14,
            background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
            fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 18,
            color: 'var(--accent-cyan)', marginBottom: 14,
          }}>CC</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-0)', marginBottom: 4 }}>
            Coach Center
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {isLogin ? 'Se connecter à votre compte' : 'Créer votre compte'}
          </div>
        </div>

        {/* Google button */}
        <button
          type="button"
          onClick={handleGoogle}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '11px 16px', borderRadius: 10,
            background: '#fff', border: '1px solid #dadce0',
            fontSize: 14, fontWeight: 600, color: '#3c4043',
            cursor: 'pointer', marginBottom: 16, transition: 'box-shadow 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.2)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
        >
          <GoogleIcon />
          Continuer avec Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.08em' }}>
            OU
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Email / password form */}
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <input
              style={inputStyle}
              type="text"
              placeholder="Prénom Nom"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          )}

          <input
            style={inputStyle}
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <input
            style={inputStyle}
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', padding: '10px 12px', borderRadius: 8,
              fontSize: 13, marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 11, borderRadius: 10,
              background: 'var(--accent-cyan)', color: '#000',
              border: 'none', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
              marginBottom: 4,
            }}
          >
            {loading ? 'Chargement…' : isLogin ? 'Se connecter' : "S'inscrire"}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', marginTop: 14 }}>
          {isLogin ? 'Pas encore de compte ? ' : 'Déjà inscrit ? '}
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            style={{
              background: 'none', border: 'none', color: 'var(--accent-cyan)',
              cursor: 'pointer', textDecoration: 'underline', padding: 0, font: 'inherit',
            }}
          >
            {isLogin ? "S'inscrire" : 'Se connecter'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '10px 14px', marginBottom: 12,
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-0)', fontSize: 14,
  fontFamily: 'var(--font-sans)', outline: 'none',
};
