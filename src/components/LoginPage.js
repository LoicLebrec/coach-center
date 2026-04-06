import React, { useState } from 'react';
import { backendService } from '../services/backend-api';

export default function LoginPage() {
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
      
      // Redirect to app
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Coach Center</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
            {isLogin ? 'Se connecter à votre compte' : 'Créer un compte'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <input
              className="form-input"
              type="text"
              placeholder="Prénom Nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ marginBottom: 12 }}
            />
          )}

          <input
            className="form-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ marginBottom: 12 }}
          />

          <input
            className="form-input"
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ marginBottom: 12 }}
          />

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                padding: '10px 12px',
                borderRadius: 6,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginBottom: 12 }}
          >
            {loading ? 'Chargement...' : isLogin ? 'Se connecter' : 'S\'inscrire'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
          {isLogin ? "Pas encore de compte ? " : "Déjà inscrit ? "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-blue)',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              font: 'inherit',
            }}
          >
            {isLogin ? 'S\'inscrire' : 'Se connecter'}
          </button>
        </div>
      </div>

      <style>{`
        .auth-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--bg-0);
          padding: 20px;
        }
        .auth-card {
          background: var(--bg-1);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 32px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
}
