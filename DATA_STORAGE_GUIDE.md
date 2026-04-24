# 💾 Stockage & Enregistrement des Données

## 🏗️ Infrastructure de Stockage

### Localisation: PostgreSQL (Neon)

```
┌─────────────────────────────────────────┐
│        NEON PostgreSQL Database         │
│   (Cloud-hosted Postgres - Free)        │
│                                         │
│  📊 5 tables                            │
│  🔐 Chiffrage SSL                       │
│  💾 Backups automatiques                │
│  🌍 Accessible via connection string    │
└─────────────────────────────────────────┘
```

**Configuration:**
```bash
# .env
DATABASE_URL=postgresql://user:password@hostname:5432/coachcenter?sslmode=require

# Exemple (Neon):
DATABASE_URL=postgresql://user_id:password@ep-cool-lake-123456.eu-west-1.neon.tech/neondb
```

---

## 📋 Schéma: Où sont enregistrées les données?

### 1️⃣ **Table `users`** - Comptes utilisateurs

```sql
CREATE TABLE users (
  id           TEXT PRIMARY KEY,           -- UUID unique
  email        TEXT UNIQUE NOT NULL,       -- user@example.com
  password_hash TEXT,                      -- bcrypt(password) - jamais le password en clair
  name         TEXT,                       -- "Jean Dupont"
  google_id    TEXT UNIQUE,                -- ID Google si OAuth
  avatar_url   TEXT,                       -- https://...
  club_id      TEXT,                       -- Pour groupes (futur)
  created_at   TIMESTAMPTZ,                -- 2026-04-23 10:30:00+00
  updated_at   TIMESTAMPTZ                 -- Quand modifié
)
```

**Exemples de données stockées:**
```
id          | email                | password_hash           | name         | created_at
------------|----------------------|-------------------------|--------------|-------------------
uuid-1234   | jean@club.fr         | $2b$10$... (bcrypt)    | Jean Dupont  | 2026-04-23 10:30
uuid-5678   | marie@gmail.com      | NULL                    | Marie Smith  | 2026-04-20 14:15
```

**Comment c'est enregistré:**
```javascript
// À la registration:
const registerUser = async (email, password, name) => {
  const id = randomUUID();  // uuid-1234
  const passwordHash = await bcrypt.hash(password, 10);  // Hachage du mot de passe
  
  await run(
    'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
    [id, email, passwordHash, name]
  );
  // ✅ Enregistré dans PostgreSQL
};
```

---

### 2️⃣ **Table `oauth_tokens`** - Tokens des providers

```sql
CREATE TABLE oauth_tokens (
  id            TEXT PRIMARY KEY,           -- ID unique du token
  user_id       TEXT NOT NULL,             -- FK → users(id)
  provider      TEXT NOT NULL,             -- 'strava' | 'garmin' | 'intervals' | 'wahoo'
  access_token  TEXT NOT NULL,             -- Token d'accès pour appels API
  refresh_token TEXT,                      -- Pour renouveler le token
  expires_at    TIMESTAMPTZ,               -- Quand le token expire
  athlete_id    TEXT,                      -- ID athlète chez le provider
  created_at    TIMESTAMPTZ,               -- Quand connecté
  updated_at    TIMESTAMPTZ                -- Dernière mise à jour du token
  
  UNIQUE(user_id, provider)  -- Un seul token Strava par user!
)
```

**Exemple: Connexion Strava stockée**
```
id          | user_id    | provider | access_token        | expires_at           | athlete_id
------------|------------|----------|---------------------|----------------------|----------
uuid-9999   | uuid-1234  | strava   | a1b2c3d4e5f6...    | 2026-05-23 10:00:00 | 123456
```

**Comment c'est enregistré:**
```javascript
// Quand l'utilisateur connecte Strava:
const handleStravaCallback = async (code, state) => {
  // 1. Valider la session
  const session = await validateOAuthSession(state, 'strava');
  const userId = session.user_id;  // ← On a l'user ID de la BD session
  
  // 2. Échanger le code pour un token avec Strava
  const { access_token, refresh_token, expires_at, athlete } = await axios.post(...);
  
  // 3. Enregistrer dans la BD
  await upsertToken(
    userId,
    'strava',
    access_token,        // ← Stocké chiffré en prod
    refresh_token,       // ← Pour renouveler plus tard
    expires_at,
    athlete.id
  );
  // ✅ Token sauvegardé dans PostgreSQL
};
```

**Où ils sont utilisés:**
```javascript
// Plus tard, pour appeler l'API Strava:
const token = await getOAuthToken(userId, 'strava');
// ← Récupère le token.access_token depuis la BD

const activities = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
  headers: { 'Authorization': `Bearer ${token.access_token}` }
});
```

---

### 3️⃣ **Table `oauth_sessions`** - Sessions temporaires (CSRF Protection)

```sql
CREATE TABLE oauth_sessions (
  state       TEXT PRIMARY KEY,           -- Token unique aléatoire
  user_id     TEXT NOT NULL,             -- FK → users(id)
  provider    TEXT NOT NULL,             -- Quel provider (strava, garmin, etc)
  created_at  TIMESTAMPTZ,               -- Quand créé
  expires_at  TIMESTAMPTZ                -- 15 minutes après création
)
```

**Exemple: Durant le flux OAuth**
```
state                                  | user_id    | provider | expires_at
----------------------------------------|------------|----------|-------------------
550e8400-e29b-41d4-a716-446655440000  | uuid-1234  | strava   | 2026-04-23 10:45
```

**Flux temporaire:**
```
1. User clique "Connect Strava"
   → Backend crée session: state=random-uuid, user_id=uuid-1234, provider=strava
   → Enregistré ~2 secondes dans oauth_sessions
   
2. Backend retourne { authUrl: "https://strava.com?state=random-uuid" }
   
3. User redirigé vers Strava (autorise l'accès)
   
4. Strava redirige: /api/auth/strava/callback?code=xxx&state=random-uuid
   
5. Backend valide le state:
   SELECT * FROM oauth_sessions WHERE state='random-uuid'
   → Trouve user_id=uuid-1234 ✅
   
6. Session SUPPRIMÉE (auto-nettoyage)
   (ou expire après 15 min si jamais utilisée)
```

---

### 4️⃣ **Table `app_connections`** - Cache pour UI

```sql
CREATE TABLE app_connections (
  id          TEXT PRIMARY KEY,           -- UUID unique
  user_id     TEXT NOT NULL,             -- FK → users(id)
  provider    TEXT NOT NULL,             -- 'strava' | 'garmin' | etc
  athlete_id  TEXT,                      -- Athlete ID du provider
  display_name TEXT,                     -- "Jean Dupont" ou "Strava Profile"
  is_active   BOOLEAN DEFAULT true,      -- Actuellement connecté?
  connected_at TIMESTAMPTZ               -- Quand connecté
  
  UNIQUE(user_id, provider)
)
```

**Exemple:**
```
id       | user_id    | provider  | display_name    | is_active | connected_at
---------|------------|-----------|-----------------|-----------|-------------------
uuid-11  | uuid-1234  | strava    | Jean Dupont     | true      | 2026-04-20 14:30
uuid-22  | uuid-1234  | garmin    | Garmin Connect  | true      | 2026-04-21 09:00
uuid-33  | uuid-1234  | intervals | Intervals.icu   | false     | 2026-04-19 11:20
```

**Utilité:** Affichage rapide sur le frontend sans joindre oauth_tokens
```javascript
// Frontend affiche:
GET /api/connections
Response:
{
  "strava": true,    // ← Provient de: is_active=true dans app_connections
  "garmin": true,
  "intervals": false,
  "wahoo": false
}
```

---

### 5️⃣ **Table `athlete_data`** - Cache des données (futur)

```sql
CREATE TABLE athlete_data (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,             -- FK → users(id)
  provider   TEXT NOT NULL,             -- 'strava' | 'garmin' | etc
  data       TEXT NOT NULL,             -- JSON des activités, stats, etc
  cached_at  TIMESTAMPTZ
)
```

**Exemple: Données d'athlète Strava en cache**
```json
{
  "id": "uuid-cache-1",
  "user_id": "uuid-1234",
  "provider": "strava",
  "data": "{\"activities\": [...], \"stats\": {...}}",
  "cached_at": "2026-04-23 10:30:00"
}
```

---

## 🔄 Flux Complet: Comment les données circulent

### Exemple 1: Création de Compte

```
User Input (Frontend)
    ↓
    "email": "jean@example.com"
    "password": "SecurePass123"
    "name": "Jean Dupont"
    ↓
POST /api/auth/register
    ↓
Backend (auth.js):
  1. Valider email/password
  2. id = randomUUID()  → "abc-123-def"
  3. passwordHash = bcrypt.hash(password)  → "$2b$10$..."
  4. INSERT INTO users
     VALUES ('abc-123-def', 'jean@example.com', '$2b$10$...', 'Jean')
    ↓
PostgreSQL:
  ✅ Enregistré dans table users
    ↓
Response:
  {
    "userId": "abc-123-def",
    "token": "eyJhbGciOiJIUzI1NiJ9..."  ← JWT signé avec JWT_SECRET
  }
    ↓
Frontend:
  localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiJ9...')
  localStorage.setItem('userId', 'abc-123-def')
```

---

### Exemple 2: Connexion Strava

```
User clique "Connect Strava" (Frontend)
    ↓
POST /api/providers/strava/start (authenticated)
  Headers: Authorization: Bearer {JWT}
    ↓
Backend (index.js):
  1. Valider le JWT → récupère userId = "abc-123-def"
  2. state = randomUUID()  → "xyz-789-uvw"
  3. INSERT INTO oauth_sessions
     VALUES ('xyz-789-uvw', 'abc-123-def', 'strava', NOW(), NOW() + 15min)
       ↓
       PostgreSQL: oauth_sessions table ✅ créée
  4. Retourner:
     {
       "authUrl": "https://www.strava.com/oauth/authorize?client_id=...&state=xyz-789-uvw"
     }
    ↓
Frontend:
  window.location.href = "https://www.strava.com/oauth/authorize?..."
    ↓
Strava (External):
  User authorizes → Strava redirects to:
  https://coach-center.com/api/auth/strava/callback?code=AUTH_CODE&state=xyz-789-uvw
    ↓
Backend (oauth-handlers.js):
  1. Reçoit code="AUTH_CODE", state="xyz-789-uvw"
  2. Valide: SELECT * FROM oauth_sessions WHERE state='xyz-789-uvw'
     → Trouve user_id='abc-123-def' ✅
  3. DELETE FROM oauth_sessions WHERE state='xyz-789-uvw'
     → Session temporaire supprimée
  4. code → Strava OAuth token endpoint → access_token
  5. INSERT INTO oauth_tokens
     VALUES (
       id='uuid-9999',
       user_id='abc-123-def',
       provider='strava',
       access_token='STRAVA_TOKEN_12345',
       expires_at='2026-05-23 10:00:00'
     )
       ↓
       PostgreSQL: oauth_tokens table ✅ créée
  6. INSERT INTO app_connections
     VALUES (
       id='uuid-11',
       user_id='abc-123-def',
       provider='strava',
       display_name='Jean Dupont',
       is_active=true
     )
       ↓
       PostgreSQL: app_connections table ✅ créée
    ↓
Backend retourne:
  Redirect: https://coach-center.com?provider=strava&success=true
    ↓
Frontend détecte callback:
  GET /api/connections
  Response: { "strava": true, "garmin": false, ... }
  ✅ UI mise à jour: "✓ Strava Connected"
```

---

## 🗄️ Résumé: Où est quoi?

| Données | Table | Durée | Chiffrage | Accès |
|---------|-------|-------|-----------|-------|
| Compte user | `users` | Permanent | Password hashé | Frontend via JWT |
| OAuth tokens | `oauth_tokens` | Permanent (renouvellable) | À faire en prod | Backend seulement |
| Sessions OAuth | `oauth_sessions` | 15 minutes (auto-expire) | Non | Backend seulement |
| Connexions UI | `app_connections` | Permanent | Non | Frontend + Backend |
| Données athlète | `athlete_data` | Selon besoin | JSON | Backend |

---

## 🔐 Sécurité: Comment c'est Protégé

### Passwords
```javascript
// ❌ JAMAIS en clair:
INSERT INTO users VALUES (..., 'SecurePass123', ...)  // ← NO!

// ✅ Toujours hashé:
const hash = await bcrypt.hash('SecurePass123', 10);
// Result: $2b$10$fpIdlNH03s0JM7rL8xp0QeZt/CjYb5nJQ5pxK4LeSdM1...
INSERT INTO users VALUES (..., hash, ...)
```

### OAuth Access Tokens
```javascript
// ❌ Jamais envoyés au frontend:
response.json({ accessToken: 'strava_token_12345' })  // ← NO!

// ✅ Stockés server-side, jamais exposés:
INSERT INTO oauth_tokens VALUES (
  ...,
  access_token='strava_token_12345',  // ← Privé en BD
  ...
)
// Frontend ne sait pas le token existe!
```

### State Tokens (OAuth)
```javascript
// ✅ Utilisé pour CSRF protection:
// Impossible de deviner (UUID aléatoire)
// Lié à l'user et provider spécifique
// Auto-expire après 15 minutes
```

---

## 📊 Visualisation: Architecture Données

```
┌─────────────────────────────────────────────────────┐
│            Frontend (React Browser)                 │
│  localStorage:                                      │
│  - token (JWT)                                      │
│  - userId                                           │
└────────────────────┬────────────────────────────────┘
                     │ HTTP + JWT
                     ↓
┌─────────────────────────────────────────────────────┐
│          Backend (Express.js Server)                │
│  ENV:                                               │
│  - JWT_SECRET                                       │
│  - DATABASE_URL                                     │
│  - OAuth credentials                                │
└────────────────────┬────────────────────────────────┘
                     │ Connection Pool (5)
                     ↓
    ┌────────────────────────────────────────┐
    │     PostgreSQL Database (Neon)         │
    │                                        │
    │  users (permanent):                    │
    │  ├─ id, email, password_hash           │
    │  ├─ google_id, avatar_url              │
    │  └─ created_at, updated_at             │
    │                                        │
    │  oauth_tokens (permanent):             │
    │  ├─ id, user_id, provider              │
    │  ├─ access_token, refresh_token        │
    │  ├─ expires_at, athlete_id             │
    │  └─ created_at, updated_at             │
    │                                        │
    │  oauth_sessions (15 min expiry):       │
    │  ├─ state (UUID)                       │
    │  ├─ user_id, provider                  │
    │  └─ expires_at                         │
    │                                        │
    │  app_connections (cache):              │
    │  ├─ id, user_id, provider              │
    │  ├─ athlete_id, display_name           │
    │  └─ is_active, connected_at            │
    │                                        │
    │  athlete_data (optionnel):             │
    │  ├─ id, user_id, provider              │
    │  ├─ data (JSON cache)                  │
    │  └─ cached_at                          │
    └────────────────────────────────────────┘
```

---

## 💾 Production Setup: Neon (Recommandé)

### Free Plan Neon:
- ✅ 5 GB storage
- ✅ Connection pooling
- ✅ Automatic backups
- ✅ SSL encryption
- ✅ Multi-region

**Setup:**
```bash
# 1. Créer compte: https://neon.tech
# 2. Créer projet: "coach-center"
# 3. Copier connection string:
#    postgresql://neon_user:password@ep-cool-lake-abc123.eu-west-1.neon.tech/coachcenter

# 4. Ajouter à .env:
DATABASE_URL=postgresql://...?sslmode=require

# 5. Déployer (Vercel, Railway, etc.) - tables auto-créées!
```

---

**TL;DR: Tout est dans PostgreSQL (Neon), jamais exposé au frontend, tokens chiffrés, sessions auto-expiry 15min** ✅
