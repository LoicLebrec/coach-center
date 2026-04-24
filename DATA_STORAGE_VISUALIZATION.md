# 🗺️ Visualisation: Où sont Stockées les Données

## 🌐 Architecture Complète

```
┌──────────────────────────────────────────────────────────────────────┐
│                    INTERNET / UTILISATEUR                            │
│                                                                      │
│  Jean accède à coach-center.com                                     │
│  ↓                                                                   │
│  Son navigateur (Chrome, Firefox, Safari)                           │
│  ├─ localStorage: token + userId                                    │
│  ├─ localStorage: pas de passwords ✅                               │
│  ├─ localStorage: pas de OAuth tokens ✅                            │
│  └─ localStorage: rien de sensible ✅                               │
│                                                                      │
└────────────────────────┬───────────────────────────────────────────┘
                         │ HTTP/HTTPS + JWT Token
                         │
        ┌────────────────────────────────────┐
        │     BACKEND (Express.js Server)    │
        │     https://api.coach-center.com   │
        │                                    │
        │  ├─ auth.js - Auth logic           │
        │  ├─ oauth-handlers.js - OAuth      │
        │  ├─ db.js - Database connection    │
        │  ├─ oauth-sessions.js - Sessions   │
        │  └─ index.js - Express app         │
        │                                    │
        │  Environment (process.env):        │
        │  ├─ JWT_SECRET                     │
        │  ├─ DATABASE_URL                   │
        │  └─ OAuth credentials              │
        │     (Google, Strava, Garmin...)    │
        │                                    │
        └────────────────────────┬───────────┘
                 ↓
    ┌──────────────────────────────────────────┐
    │   PostgreSQL Database (Neon Cloud)       │
    │   "postgresql://...@neon.tech/..."       │
    │                                          │
    │  5 TABLES (Stockage permanent):          │
    │                                          │
    │  1. users                                │
    │     ├─ id (UUID unique)                  │
    │     ├─ email (unique)                    │
    │     ├─ password_hash (bcrypt) 🔒        │
    │     ├─ name                              │
    │     ├─ google_id (si OAuth Google)       │
    │     └─ created_at, updated_at            │
    │                                          │
    │  2. oauth_tokens                         │
    │     ├─ id (UUID)                         │
    │     ├─ user_id → users.id (FK)          │
    │     ├─ provider (strava|garmin|...)      │
    │     ├─ access_token 🔒 (API key)        │
    │     ├─ refresh_token 🔒                  │
    │     ├─ expires_at                        │
    │     └─ athlete_id                        │
    │                                          │
    │  3. oauth_sessions (temporary)           │
    │     ├─ state (UUID, CSRF token)         │
    │     ├─ user_id → users.id (FK)          │
    │     ├─ provider                          │
    │     └─ expires_at (auto-delete 15min)    │
    │                                          │
    │  4. app_connections (cache UI)           │
    │     ├─ id (UUID)                         │
    │     ├─ user_id → users.id (FK)          │
    │     ├─ provider                          │
    │     ├─ athlete_id                        │
    │     ├─ display_name                      │
    │     └─ is_active                         │
    │                                          │
    │  5. athlete_data (performance cache)     │
    │     ├─ id (UUID)                         │
    │     ├─ user_id → users.id (FK)          │
    │     ├─ provider                          │
    │     ├─ data (JSON)                       │
    │     └─ cached_at                         │
    │                                          │
    │  🔐 Chiffrage SSL/TLS en transit         │
    │  🔐 Backups automatiques (Neon)          │
    │  🔐 Connection pooling                   │
    │  🔐 Credentials jamais en public         │
    │                                          │
    └────────────────────────────────────────┘
```

---

## 📍 Localisation des Données: 3 Zones

### Zone 1: Frontend (Browser)
```
┌─────────────────────────────────────────┐
│         Jean's Browser                  │
│  (Chrome, Firefox, Safari sur PC/phone) │
│                                         │
│  localStorage {                         │
│    ✅ token: "JWT_TOKEN_HERE"          │
│    ✅ userId: "uuid-1234"              │
│  }                                      │
│                                         │
│  ❌ Jamais: passwords                  │
│  ❌ Jamais: OAuth tokens               │
│  ❌ Jamais: API keys                   │
│                                         │
│  Durée: Jusqu'à logout (or 30 days)   │
└─────────────────────────────────────────┘
```

### Zone 2: Backend Server (Memory + Env)
```
┌──────────────────────────────────────────────┐
│  Backend Express.js Service                  │
│  peut: https://api.coach-center.com          │
│                                              │
│  process.env {                               │
│    JWT_SECRET: "abc123def456ghi789..."      │
│    DATABASE_URL: "postgresql://..."         │
│    GOOGLE_CLIENT_SECRET: "..."              │
│    STRAVA_CLIENT_SECRET: "..."              │
│    GARMIN_CLIENT_SECRET: "..."              │
│  }                                           │
│                                              │
│  Variables de runtime:                       │
│  - Tokens déchiffrés momentanément          │
│  - Cookies de session (si utilisés)         │
│  - Logs (contrôlez la verbosité!)          │
│                                              │
│  🏥 Health check: /api/health               │
│  TOUS les secrets = Secrets manager!        │
└──────────────────────────────────────────────┘
```

### Zone 3: Database (Cloud - Neon)
```
┌──────────────────────────────────────────────────┐
│  PostgreSQL Database (Neon - eu-west-1)          │
│  Hébergé: https://neon.tech (gratuit/payant)    │
│                                                  │
│  Données Permanentes:                            │
│                                                  │
│  users table:                                    │
│    Jean → email:jean@club.fr, password_hash:... │
│    Marie → email:marie@club.fr, password_hash:..│
│    (20,000+ autres users)                       │
│                                                  │
│  oauth_tokens table:                             │
│    Jean-Strava → access_token:a1b2c3...(🔒)    │
│    Jean-Garmin → access_token:d4e5f6...(🔒)    │
│    Marie-Strava → access_token:g7h8i9...(🔒)   │
│    (60,000+ tokens)                             │
│                                                  │
│  oauth_sessions table: (auto-cleanup)            │
│    [temporary states, expire après 15min]       │
│                                                  │
│  app_connections table: (cache pour UI rapide)   │
│    Jean-Strava → connected: 2026-04-20 14:30   │
│    Jean-Garmin → connected: 2026-04-21 09:00   │
│    Marie-Wahoo → disconnected: 2026-04-19      │
│                                                  │
│  🔐 SSL/TLS (chiffrage en transit)             │
│  🔐 Backups quotidiens (Neon handle)            │
│  🔐 Isolation par database                      │
│  🔐 Connection pool (5 max)                     │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 🔄 Flux de Données: Jean se Connecte

```
1. Jean ouvre coach-center.com
   ↓
   Frontend charge app React
   ├─ Vérifie localStorage pour token
   ├─ Si pas de token: show login form
   
2. Jean entre email + password
   ↓
   Browser envoie POST /api/auth/login
   ├─ Données: { email: "jean@club.fr", password: "..." }
   ├─ 🌐 Traverse internet (HTTPS = chiffré)
   
3. Backend reçoit la requête
   ├─ Valide email/password
   ├─ Query BD: SELECT * FROM users WHERE email=?
   ├─ BD retourne: password_hash: $2b$10$..., id: uuid
   ├─ Compare: bcrypt.compare(password_input, password_hash) → true ✅
   
4. Backend génère JWT token
   ├─ JWT = jwt.sign({ userId: uuid }, JWT_SECRET)
   ├─ Retourne: { userId: uuid, token: JWT_TOKEN }
   
5. Frontend reçoit réponse
   ├─ localStorage.setItem('token', JWT_TOKEN)
   ├─ localStorage.setItem('userId', uuid)
   ├─ Redirect to dashboard
   
6. Prochaines requêtes:
   ├─ Frontend inclut: Authorization: Bearer JWT_TOKEN
   ├─ Backend valide JWT avec JWT_SECRET
   ├─ Si valide: traite la requête
   ├─ Si expiré (30j): ask login again

7. Jean clique "Connect Strava"
   ├─ Frontend: POST /api/providers/strava/start
   ├─ Header: Authorization: Bearer JWT_TOKEN
   
8. Backend valide JWT → récupère userId
   ├─ Génère state = randomUUID()
   ├─ INSERT INTO oauth_sessions VALUES (state, userId, 'strava', ...)
   ├─ BD enregistre (temporaire, 15min expiry)
   ├─ Retourne authUrl avec state
   
9. Frontend redirige vers Strava
   
10. Jean autorise l'accès
    ← Strava redirige: /api/auth/strava/callback?code=XXX&state=YYY
    
11. Backend:
    ├─ Query: SELECT * FROM oauth_sessions WHERE state=?
    ├─ Valide que state existe et pas expiré
    ├─ Récupère userId from state row
    ├─ DELETE FROM oauth_sessions (nettoyage)
    ├─ Échange code avec Strava → access_token
    ├─ INSERT INTO oauth_tokens VALUES (uuid, userId, 'strava', token, ...)
    ├─ INSERT INTO app_connections VALUES (uuid, userId, 'strava', ...)
    ├─ Redirect to frontend?success=true
    
12. Frontend détecte le callback
    ├─ Appelle GET /api/connections
    ├─ Backend retourne: { strava: true, garmin: false, ... }
    ├─ UI affiche: ✓ Strava Connected
```

---

## 💾 Détail: Où Chaque Donnée est Stockée

| Donnée | Frontend | Backend Env | Backend RAM | PostgreSQL | Chiffrage |
|--------|----------|------------|-------------|------------|-----------|
| Password user | ❌ | ❌ | ❌ | ✅ (hashé) | 🔒 bcrypt |
| JWT Token | ✅ | ❌ | ❌ | ❌ | 🔒 HMAC |
| OAuth Access Token | ❌ | ❌ | ⚠️ temp | ✅ | 🔒 prod |
| OAuth Refresh Token | ❌ | ❌ | ❌ | ✅ | 🔒 prod |
| User ID | ✅ | ❌ | ✅ memory | ✅ | ❌ |
| User Email | ❌ | ❌ | ❌ | ✅ | ❌ |
| User Name | ❌ | ❌ | ❌ | ✅ | ❌ |
| Google ID | ❌ | ❌ | ❌ | ✅ | ❌ |
| OAuth State | ❌ | ❌ | ❌ | ✅ temp | ❌ |
| Athlete ID | ❌ | ❌ | ❌ | ✅ | ❌ |
| Connection Status | ❌ | ❌ | ❌ | ✅ cache | ❌ |
| API Logs | ❌ | ⚠️ logs | ✅ | ❌ optionnel | ❌ |

**Légende:** ✅ = Oui | ⚠️ = Temporaire | ❌ = Non | 🔒 = Chiffré

---

## 🗂️ Structure Fichier du Disque (Backend)

Si vous déployez sur Vercel/Railway/Heroku:

```
/app (Container)
├─ /api
│  ├─ index.js (main app)
│  ├─ auth.js (auth logic)
│  ├─ db.js (BD connection)
│  ├─ oauth-handlers.js
│  ├─ oauth-sessions.js
│  ├─ package.json
│  └─ node_modules/ (dependencies)
│
├─ .env (SECRET - never in git)
│  ├─ DATABASE_URL
│  ├─ JWT_SECRET
│  ├─ OAuth credentials
│  └─ API_PORT
│
└─ (other files not needed for runtime)
```

**Important:** .env n'est jamais commité en git! Stocké via Secrets Manager (GitHub, Vercel, etc.)

---

## 🚀 Déploiement: Flux de Données

```
LOCAL DEVELOPMENT
    ↓
    npm run dev
    ├─ Database: localhost:5432 (local PostgreSQL)
    ├─ Backend: localhost:3001
    ├─ Frontend: localhost:3000
    └─ .env: file system
    
              ↓↓↓ READY FOR PRODUCTION ↓↓↓
    
PRODUCTION (Vercel)
    ↓
    vercel deploy
    ├─ Frontend: https://coach-center.vercel.app
    ├─ Backend: https://api-coach-center.vercel.app
    ├─ Database: Neon PostgreSQL (eu-west-1)
    ├─ .env: Vercel Secrets (encrypted at rest)
    └─ Backups: Neon automatic
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ USER BROWSER                                                    │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ localStorage                                               │  │
│ │ token = "eyJhbGciOiJIUzI1NiJ9..."                         │  │
│ │ userId = "550e8400-e29b-41d4-a716-446655440000"           │  │
│ └────────────────────────────────────────────────────────────┘  │
│                          ↕ HTTP + JWT                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
    ┌──────────────────────────────────────────────────────────┐
    │ EXPRESS.JS BACKEND                                       │
    │                                                          │
    │ ┌──────────────────────────────────────────────────────┐ │
    │ │ process.env (from .env file or Secrets Manager)      │ │
    │ │ JWT_SECRET = "abc123def456"                          │ │
    │ │ DATABASE_URL = "postgresql://..."                    │ │
    │ │ STRAVA_CLIENT_SECRET = "xxx"                         │ │
    │ └──────────────────────────────────────────────────────┘ │
    │                                                          │
    │ ┌──────────────────────────────────────────────────────┐ │
    │ │ Routes & Logic                                       │ │
    │ │ POST /api/auth/register                              │ │
    │ │ POST /api/auth/login                                 │ │
    │ │ POST /api/providers/:provider/start                  │ │
    │ │ GET /api/auth/:provider/callback                     │ │
    │ │ GET /api/connections                                 │ │
    │ └──────────────────────────────────────────────────────┘ │
    │                          ↕ SQL queries                     │
    └──────────────────────────────────────────────────────────┘
                            ↓
    ┌──────────────────────────────────────────────────────────┐
    │ POSTGRESQL DATABASE (Neon)                               │
    │                                                          │
    │ ┌──────────────────────────────────────────────────────┐ │
    │ │ users table:                                         │ │
    │ │  id | email | password_hash | google_id | ...       │ │
    │ └──────────────────────────────────────────────────────┘ │
    │                                                          │
    │ ┌──────────────────────────────────────────────────────┐ │
    │ │ oauth_tokens table:                                  │ │
    │ │  id | user_id | provider | access_token | ...       │ │
    │ └──────────────────────────────────────────────────────┘ │
    │                                                          │
    │ ┌──────────────────────────────────────────────────────┐ │
    │ │ oauth_sessions table:                                │ │
    │ │  state | user_id | provider | expires_at            │ │
    │ └──────────────────────────────────────────────────────┘ │
    │                                                          │
    │ ┌──────────────────────────────────────────────────────┐ │
    │ │ app_connections & athlete_data tables                │ │
    │ └──────────────────────────────────────────────────────┘ │
    │                                                          │
    │ 🔐 SSL/TLS Connection                                  │
    │ 🔐 Automatic backups                                   │
    │ 🔐 5 GB free available                                 │
    └──────────────────────────────────────────────────────────┘
```

---

## ✅ Checklist: Où trouver chaque donnée

- [ ] **User password:**
  - Location: PostgreSQL `users.password_hash`
  - Format: bcrypt hashé ($2b$10$...)
  - Access: Backend seulement

- [ ] **User email:**
  - Location: PostgreSQL `users.email`
  - Format: Text (jean@club.fr)
  - Access: Backend via query

- [ ] **JWT Token:**
  - Location: Browser localStorage
  - Format: eyJhbGciOiJIUzI1NiJ9...
  - Access: Frontend + sent in Authorization header

- [ ] **OAuth Access Token (Strava, etc):**
  - Location: PostgreSQL `oauth_tokens.access_token`
  - Format: Strava token string
  - Access: Backend seulement (never to frontend)

- [ ] **OAuth Refresh Token:**
  - Location: PostgreSQL `oauth_tokens.refresh_token`
  - Format: Token string
  - Access: Backend seulement

- [ ] **Session State (during OAuth):**
  - Location: PostgreSQL `oauth_sessions.state`
  - Format: UUID
  - Duration: 15 minutes (auto-expire)
  - Access: Backend validation

- [ ] **Connection Status:**
  - Location: PostgreSQL `app_connections` (cache)
  - Format: Boolean is_active
  - Access: Frontend via GET /api/connections

**Règle d'or:** Si c'est sensible (password, tokens) → Backend only. Si c'est pour UI → Frontend can query.
