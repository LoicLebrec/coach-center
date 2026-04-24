# Frontend Integration Guide - OAuth & Account Management

## Overview

The Coach Center backend has been reorganized to:
- ✅ Separate user accounts from OAuth provider connections
- ✅ Use secure sessions for OAuth flow (CSRF protection)
- ✅ Store all OAuth tokens server-side (secure)
- ✅ Support account creation via email/password and Google OAuth

---

## Changes from Previous Architecture

### ❌ OLD (Insecure)
```javascript
// Before: Passing userId through URL as state parameter
function connectStrava() {
  const userId = getUserId();
  // state parameter contained userId (SECURITY ISSUE!)
  window.location.href = `...&state=${userId}`;
}
```

### ✅ NEW (Secure)
```javascript
// After: Proper OAuth flow with backend session management
async function connectStrava() {
  // 1. Request session token from backend
  const response = await fetch('/api/providers/strava/start', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { authUrl } = await response.json();
  
  // 2. Redirect user to provider
  window.location.href = authUrl;
  
  // 3. Backend validates callback, stores tokens
  // 4. User returns to app
}
```

---

## Setup Instructions

### 1. Update Authentication Flow

#### Registration (Email/Password)
```javascript
async function register(email, password, name) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });
  
  const { userId, token } = await res.json();
  
  // Store token
  localStorage.setItem('token', token);
  localStorage.setItem('userId', userId);
  
  return { userId, token };
}
```

#### Login (Email/Password)
```javascript
async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const { userId, token, name, avatarUrl } = await res.json();
  
  localStorage.setItem('token', token);
  localStorage.setItem('userId', userId);
  
  return { userId, token, name, avatarUrl };
}
```

### 2. OAuth Provider Connection

#### Connect to Provider (Strava example)
```javascript
async function connectProvider(provider) {
  const token = localStorage.getItem('token');
  
  // Step 1: Get secure OAuth URL from backend
  const res = await fetch(`/api/providers/${provider}/start`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error);
  }
  
  const { authUrl } = await res.json();
  
  // Step 2: Redirect user (they authorize on provider's site)
  window.location.href = authUrl;
  
  // Step 3: Browser redirects back to /api/auth/:provider/callback
  // Backend handles validation and token storage
  // Frontend detects return and refreshes connections list
}

// Usage:
// connectProvider('strava')
// connectProvider('garmin')
// connectProvider('wahoo')
// connectProvider('intervals')
```

### 3. Display Connection Status

```javascript
async function getConnections() {
  const token = localStorage.getItem('token');
  
  const res = await fetch('/api/connections', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return await res.json();
  
  // Returns:
  // {
  //   "strava": true,
  //   "garmin": false,
  //   "intervals": true,
  //   "wahoo": false
  // }
}
```

### 4. Disconnect Provider

```javascript
async function disconnectProvider(provider) {
  const token = localStorage.getItem('token');
  
  const res = await fetch(`/api/connections/${provider}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const result = await res.json();
  return result.success;
}
```

---

## React Component Examples

### Login/Register Component
```javascript
import React, { useState } from 'react';

function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' 
        ? { email, password }
        : { email, password, name };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      
      const { userId, token } = await res.json();
      
      localStorage.setItem('token', token);
      localStorage.setItem('userId', userId);
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <h1>{mode === 'login' ? 'Login' : 'Create Account'}</h1>
      
      {error && <div className="error">{error}</div>}
      
      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        
        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : mode === 'login' ? 'Login' : 'Register'}
        </button>
      </form>
      
      <p>
        {mode === 'login' ? 'Need account? ' : 'Have account? '}
        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Register' : 'Login'}
        </button>
      </p>
    </div>
  );
}

export default AuthPage;
```

### Provider Connections Component
```javascript
import React, { useState, useEffect } from 'react';

function ProviderConnections() {
  const [connections, setConnections] = useState({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    const token = localStorage.getItem('token');
    
    const res = await fetch('/api/connections', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await res.json();
    setConnections(data);
    setLoading(false);
  };

  const handleConnect = async (provider) => {
    setConnecting(provider);
    try {
      const token = localStorage.getItem('token');
      
      const res = await fetch(`/api/providers/${provider}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const { authUrl } = await res.json();
      
      // Redirect to provider
      window.location.href = authUrl;
      
      // After OAuth callback and redirect, refresh
      setTimeout(loadConnections, 1000);
    } catch (err) {
      console.error(`Failed to connect ${provider}:`, err);
      setConnecting(null);
    }
  };

  const handleDisconnect = async (provider) => {
    const token = localStorage.getItem('token');
    
    await fetch(`/api/connections/${provider}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    loadConnections();
  };

  if (loading) return <div>Loading connections...</div>;

  const providers = [
    { id: 'strava', name: 'Strava', icon: '🏃' },
    { id: 'garmin', name: 'Garmin', icon: '⌚' },
    { id: 'wahoo', name: 'Wahoo', icon: '📱' },
    { id: 'intervals', name: 'Intervals.icu', icon: '📊' }
  ];

  return (
    <div className="provider-connections">
      <h2>Connected Apps</h2>
      
      <div className="providers-grid">
        {providers.map(provider => (
          <div key={provider.id} className="provider-card">
            <div className="provider-header">
              <span className="icon">{provider.icon}</span>
              <span className="name">{provider.name}</span>
            </div>
            
            {connections[provider.id] ? (
              <button
                className="btn-disconnect"
                onClick={() => handleDisconnect(provider.id)}
              >
                ✓ Disconnect
              </button>
            ) : (
              <button
                className="btn-connect"
                onClick={() => handleConnect(provider.id)}
                disabled={connecting === provider.id}
              >
                {connecting === provider.id ? 'Connecting...' : 'Connect'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProviderConnections;
```

---

## Handling OAuth Callbacks

The backend automatically handles OAuth callbacks, but detect when the user returns:

```javascript
// In your main App/Router component
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  
  // Check if returning from OAuth callback
  if (params.get('provider') && params.get('success') === 'true') {
    // Show success message
    console.log(`Successfully connected ${params.get('provider')}`);
    
    // Clean up URL
    window.history.replaceState({}, document.title, '/dashboard');
    
    // Refresh connections
    loadConnections();
  } else if (params.get('provider') && params.get('error')) {
    // Show error message
    console.error('Connection failed:', params.get('error'));
    
    // Clean up URL
    window.history.replaceState({}, document.title, '/dashboard');
  }
}, []);
```

---

## API Reference

### Authentication Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth/register` | ❌ | Create new account |
| POST | `/api/auth/login` | ❌ | Login with email/password |
| GET | `/api/auth/me` | ✅ | Get current user info |
| GET | `/api/auth/google/start` | ❌ | Start Google OAuth |
| GET | `/api/auth/google/callback` | ❌ | Google OAuth redirect (auto) |

### Provider Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/providers/:provider/start` | ✅ | Start OAuth flow |
| GET | `/api/auth/:provider/callback` | ❌ | Provider callback (auto) |
| GET | `/api/connections` | ✅ | List connections |
| GET | `/api/connections/:provider` | ✅ | Get connection details |
| DELETE | `/api/connections/:provider` | ✅ | Disconnect provider |

**Auth symbols:** ✅ = Requires JWT | ❌ = Public

---

## Error Handling

```javascript
async function safeApiCall(endpoint, options = {}) {
  try {
    const token = localStorage.getItem('token');
    const headers = options.headers || {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(endpoint, { ...options, headers });
    
    if (res.status === 401) {
      // Token expired - redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
      return;
    }
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    
    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}
```

---

## Testing Locally

1. **Start backend**
   ```bash
   cd api
   npm install
   npm run dev
   ```

2. **Start frontend**
   ```bash
   npm start
   # Runs on http://localhost:3000
   ```

3. **Test account creation**
   ```bash
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "testpass123",
       "name": "Test User"
     }'
   ```

4. **Test OAuth flow**
   - Use test OAuth credentials from provider consoles
   - Use `http://localhost:3001/api/auth/provider/callback` as redirect URI
   - Test complete flow in browser

---

## Next Steps

- [ ] Add password reset flow
- [ ] Implement 2FA (optional)
- [ ] Add team/group management
- [ ] Role-based access control (RBAC)
- [ ] Account settings page
- [ ] Export user data
- [ ] Delete account functionality
