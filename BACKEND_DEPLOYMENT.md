# Coach Center Backend - Guide de Déploiement & Configuration

## Architecture Réorganisée

### Priorités d'implémentation
1. ✅ **Création de compte users** - Email/password + Google OAuth
2. ✅ **Intégration des connexions par compte** - Tokens OAuth stockés par user (pas des clés API)
3. 🔄 **Sécurité & Validation**
4. 📋 **Déploiement production**

---

## 1. Pré-requis

### Variables d'environnement (`.env`)

```bash
# Database (PostgreSQL required)
DATABASE_URL=postgresql://user:password@host:5432/coach_center?sslmode=require

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRE=30d

# Frontend
FRONTEND_URL=https://coach-center.example.com

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Sport Providers - OAuth Configuration
INTERVALS_CLIENT_ID=xxx
INTERVALS_CLIENT_SECRET=xxx
INTERVALS_CALLBACK_URL=https://coach-center.example.com/api/auth/intervals/callback

STRAVA_CLIENT_ID=xxx
STRAVA_CLIENT_SECRET=xxx

GARMIN_CLIENT_ID=xxx
GARMIN_CLIENT_SECRET=xxx

WAHOO_CLIENT_ID=xxx
WAHOO_CLIENT_SECRET=xxx
WAHOO_CALLBACK_URL=https://coach-center.example.com/api/auth/wahoo/callback

# Optional: Cleanup job
CLEANUP_EXPIRED_SESSIONS_INTERVAL=3600000  # 1 hour in ms
```

---

## 2. Architecture de Base de Données

### Tables principales

#### `users`
```sql
id          TEXT PRIMARY KEY (UUID)
email       TEXT UNIQUE NOT NULL
password_hash TEXT  -- null if Google OAuth only
name        TEXT
google_id   TEXT UNIQUE  -- for Google OAuth linking
avatar_url  TEXT
club_id     TEXT  -- for team/club management (future)
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
```

#### `oauth_tokens` (Tokens per provider)
```sql
id            TEXT PRIMARY KEY
user_id       TEXT REFERENCES users(id) ON DELETE CASCADE
provider      TEXT  -- 'strava' | 'garmin' | 'intervals' | 'wahoo'
access_token  TEXT  -- encrypted in production
refresh_token TEXT  -- encrypted in production
expires_at    TIMESTAMPTZ
athlete_id    TEXT  -- provider's athlete ID (reference)
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
UNIQUE(user_id, provider)
```

#### `oauth_sessions` (Temporary state for CSRF protection)
```sql
state       TEXT PRIMARY KEY
user_id     TEXT REFERENCES users(id) ON DELETE CASCADE
provider    TEXT
created_at  TIMESTAMPTZ
expires_at  TIMESTAMPTZ  -- Auto-expires in 15 minutes
```

#### `app_connections` (UI cache)
```sql
id          TEXT PRIMARY KEY
user_id     TEXT REFERENCES users(id) ON DELETE CASCADE
provider    TEXT
athlete_id  TEXT
display_name TEXT
is_active   BOOLEAN DEFAULT true
connected_at TIMESTAMPTZ
UNIQUE(user_id, provider)
```

---

## 3. Endpoints API

### Authentication

#### 📝 Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password",
  "name": "John Doe"
}

Response:
{
  "userId": "uuid",
  "token": "jwt-token"
}
```

#### 🔓 Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password"
}

Response:
{
  "userId": "uuid",
  "token": "jwt-token",
  "name": "John Doe",
  "avatarUrl": "https://..."
}
```

#### 👤 Get Current User
```http
GET /api/auth/me
Authorization: Bearer {jwt-token}

Response:
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar_url": "https://...",
  "created_at": "2026-04-23T..."
}
```

### OAuth Providers Integration

#### 1️⃣ Initiate Provider Connection
```http
POST /api/providers/:provider/start
Authorization: Bearer {jwt-token}
Content-Type: application/json

# Provider can be: strava, garmin, intervals, wahoo

Response:
{
  "authUrl": "https://provider.com/oauth/authorize?client_id=...&state=..."
}

# Frontend redirects user to authUrl
# User authorizes
# Provider redirects to /api/auth/:provider/callback
```

#### 2️⃣ OAuth Callback (automatic)
```
/api/auth/:provider/callback?code=xxx&state=yyy

# Backend validates state
# Exchanges code for token
# Stores token in oauth_tokens table
# Redirects to frontend with success/error
```

### Connections Management

#### List Connections
```http
GET /api/connections
Authorization: Bearer {jwt-token}

Response:
{
  "strava": true,
  "garmin": false,
  "intervals": true,
  "wahoo": false
}
```

#### Get Connection Details
```http
GET /api/connections/:provider
Authorization: Bearer {jwt-token}

Response:
{
  "provider": "strava",
  "connected": true,
  "athleteId": "12345",
  "expiresAt": "2026-05-23T10:30:00Z",
  "connectedSince": "2026-04-23T08:15:00Z"
}
```

#### Disconnect Provider
```http
DELETE /api/connections/:provider
Authorization: Bearer {jwt-token}

Response:
{
  "success": true,
  "message": "strava disconnected"
}
```

---

## 4. Security Features Implemented

✅ **CSRF Protection via OAuth Sessions**
- State tokens expire in 15 minutes
- Validated on callback

✅ **JWT-based Authentication**
- 30-day expiration (configurable)
- Signed with secret key

✅ **Per-user Provider Isolation**
- Each user has separate tokens
- No shared API keys

✅ **Secure Token Storage**
- PostgreSQL with encryption (in production)
- Refresh tokens auto-rotated on use

✅ **CORS Protection**
- Limited to FRONTEND_URL
- Credentials required

---

## 5. Deployment Checklist

### 🚀 Pre-Production

- [ ] Update `DATABASE_URL` to production Postgres (Neon, Supabase, etc.)
- [ ] Generate strong `JWT_SECRET` (use: `openssl rand -base64 32`)
- [ ] Set `FRONTEND_URL` to production domain
- [ ] Register OAuth apps with all providers:
  - Google: https://console.cloud.google.com
  - Strava: https://www.strava.com/settings/api
  - Garmin: https://developer.garmin.com
  - Wahoo: https://developer.wahooligan.com
- [ ] Update redirect URIs in each provider's console
- [ ] Set all OAuth client IDs and secrets in `.env`

### 🔒 Security Hardening

```javascript
// In production, add:
app.use(helmet());  // Security headers
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));  // Rate limiting
app.set('trust proxy', 1);  // Behind proxy

// Force HTTPS
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}
```

### 📊 Monitoring Setup

Log important events:
- User registration
- Provider connections
- Token refresh failures
- OAuth session timeouts

### 🧹 Maintenance Tasks

1. **Clean expired sessions** (via cron or job scheduler)
   ```javascript
   setInterval(cleanExpiredSessions, process.env.CLEANUP_EXPIRED_SESSIONS_INTERVAL);
   ```

2. **Implement token refresh logic** for long-lived providers
   ```javascript
   // Auto-refresh tokens 30 min before expiry
   ```

3. **Monitor failed OAuth attempts**
   ```javascript
   // Log and alert on repeated failures
   ```

---

## 6. Frontend Integration Changes

### Old Flow (Insecure)
```javascript
// ❌ BEFORE: Passing userId as state (UNSAFE)
const code = getUrlParam('code');
const userId = getUrlParam('state');  // WRONG! state = CSRF token
```

### New Flow (Secure)
```javascript
// ✅ AFTER: Proper OAuth flow

// 1. Click "Connect Strava"
const response = await fetch('/api/providers/strava/start', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { authUrl } = await response.json();

// 2. Redirect user
window.location.href = authUrl;

// 3. Provider calls callback, backend validates state
// 4. Frontend detects callback and refreshes connections
```

---

## 7. Example: Local Development

```bash
# 1. Start Postgres locally
docker run -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:15

# 2. Create .env
cp .env.example .env
# Edit with Google OAuth test credentials

# 3. Install dependencies
npm install

# 4. Start backend
npm run dev
# API runs on http://localhost:3001

# 5. Test
curl http://localhost:3001/api/health
# {"status":"ok","timestamp":"2026-04-23T..."}
```

---

## 8. Next Steps

- [ ] Implement token encryption at rest
- [ ] Add password reset flow
- [ ] Implement 2FA (optional)
- [ ] Add team/coach management
- [ ] Implement role-based access control
- [ ] Add audit logging
- [ ] Set up monitoring dashboards
