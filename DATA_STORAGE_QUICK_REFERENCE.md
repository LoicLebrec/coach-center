# 💾 Où Sont Stockées les Données? - Résumé Rapide

## 3 Endroits où les données vivent:

### 1️⃣ **Frontend (Browser)**
```
localStorage = {
  token: "JWT_TOKEN_HERE",
  userId: "uuid-1234"
}
```
✅ Sûr (pas de passwords, pas de OAuth tokens)
⏱️ Durée: 30 jours (JWT expiry)

---

### 2️⃣ **Backend (Server)**
```
process.env = {
  JWT_SECRET: "secret-key",
  DATABASE_URL: "postgresql://...",
  GOOGLE_CLIENT_SECRET: "xxx",
  STRAVA_CLIENT_SECRET: "xxx",
  GARMIN_CLIENT_SECRET: "xxx",
  INTERVALS_CLIENT_SECRET: "xxx",
  WAHOO_CLIENT_SECRET: "xxx"
}
```
🔒 Secrets Manager (Vercel, GitHub, etc.)
⏱️ Durée: Chargés au démarrage, jamais sauvegardés

---

### 3️⃣ **PostgreSQL Database (Neon Cloud)**

**Où exactement: 5 Tables**

#### **TABLE 1: `users`** - Comptes utilisateurs
```
Colonnes: id, email, password_hash, name, google_id, avatar_url, created_at

Exemple: Jean
├─ id: 550e8400-e29b-41d4-a716-446655440000
├─ email: jean@club.fr
├─ password_hash: $2b$10$xxxxxxxxxxx... (🔒 bcrypt)
├─ name: Jean Dupont
└─ created_at: 2026-04-23 10:30:00
```
📊 Données: ~5-10 KB par user × 10,000 users = 50-100 MB

---

#### **TABLE 2: `oauth_tokens`** - Tokens des providers
```
Colonnes: id, user_id, provider, access_token, refresh_token, expires_at, athlete_id

Exemple: Jean-Strava
├─ id: 770g8402-g41d-53f6-c828-668877662222
├─ user_id: 550e8400-e29b-41d4-a716-446655440000 (FK → users)
├─ provider: "strava"
├─ access_token: a4b945687g8h9i0jk1l2m3n4o5p6q7r8s9 (🔒)
├─ refresh_token: e2f3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9 (🔒)
├─ expires_at: 2026-05-23 16:35:00
└─ athlete_id: 123456
```
📊 Données: ~500 B par token × 30,000 tokens = 15 MB

---

#### **TABLE 3: `oauth_sessions`** - Sessions OAuth (temporaire)
```
Colonnes: state, user_id, provider, created_at, expires_at

Durée de vie: 15 minutes (AUTO-DELETE)

Quand créée: Utilisateur clique "Connect Strava"
Quand supprimée: 
  1. OAuth callback validé
  2. Ou après 15 minutes (auto-cleanup)

Exemple:
├─ state: 660f8401-f30c-42e5-b827-557766551111 (UUID CSRF token)
├─ user_id: 550e8400-e29b-41d4-a716-446655440000
├─ provider: "strava"
└─ expires_at: 2026-04-23 10:50:00
```
📊 Données: Toujours petit (100-1000 lignes)

---

#### **TABLE 4: `app_connections`** - Cache pour UI
```
Colonnes: id, user_id, provider, athlete_id, display_name, is_active, connected_at

Utilisé par: Frontend pour afficher rapidement "✓ Strava Connected"

Exemple: Jean-Strava
├─ id: 880h8403-h52e-64g7-d939-779988773333
├─ user_id: 550e8400-e29b-41d4-a716-446655440000
├─ provider: "strava"
├─ athlete_id: 123456
├─ display_name: "Jean Dupont"
├─ is_active: true
└─ connected_at: 2026-04-23 10:36:00
```
📊 Données: ~200 B par connexion × 30,000 = 6 MB

---

#### **TABLE 5: `athlete_data`** - Cache athlète (optionnel)
```
Colonnes: id, user_id, provider, data (JSON), cached_at

Exemple: Activités Strava en cache
├─ id: uuid
├─ user_id: 550e8400-e29b-41d4-a716-446655440000
├─ provider: "strava"
├─ data: {"activities": [...], "stats": {...}} (JSON)
└─ cached_at: 2026-04-23 10:00:00
```
📊 Données: Dépend du cache, peut aller jusqu'à 100 MB

---

## 📊 Total Stocké

```
Scenario: 10,000 users, chacun avec 3 providers connectés

users:           10,000 lignes × 5 KB   = 50 MB
oauth_tokens:    30,000 lignes × 0.5 KB = 15 MB
app_connections: 30,000 lignes × 0.2 KB = 6 MB
oauth_sessions:  100 lignes (petite)   = auto-cleanup
athlete_data:    optionnel             = 0-100 MB

TOTAL: ~70-170 MB

Neon free tier: 5 GB → 30-70x la capacité ✅
```

---

## 🔐 Sécurité: Qu'est-ce qui est Chiffré?

### ✅ Toujours Chiffré
```
□ Passwords          → bcrypt hash: $2b$10$...
□ OAuth Access Tokens → Stockados en BD (chiffrage optional)
□ OAuth Refresh Token → Stockados en BD (chiffrage optional)
□ JWT Token          → Signé avec JWT_SECRET
```

### ⚠️ Chiffrage en Transit
```
□ HTTPS/SSL       → Entre frontend ↔ backend
□ SSL/TLS         → Entre backend ↔ PostgreSQL
```

### ❌ jamais Chiffré
```
□ User IDs        → Public/benign (juste UUID)
□ Emails          → Non-sens, but queryable
□ Names           → Public display
□ Connection status → Public (which apps connected)
```

---

## 🔄 Exemples: Où vont les Données?

### Exemple 1: Register

```
Jean → Browser Form
└─ email: "jean@club.fr"
└─ password: "SecurePass123"
└─ name: "Jean Dupont"
   ↓ (HTTPS POST)
Backend
└─ Valide input
└─ Hash password: SecurePass123 → $2b$10$...
└─ Generate UUID: 550e8400-e29b-41d4-a716-446655440000
   ↓ (INSERT)
PostgreSQL users table
└─ id: 550e8400-e29b-41d4-a716-446655440000 ✅
└─ email: jean@club.fr ✅
└─ password_hash: $2b$10$... ✅
└─ name: Jean Dupont ✅
   ↓ (Retour)
Backend
└─ Generate JWT avec JWT_SECRET
└─ token: eyJhbGciOiJIUzI1NiJ9... (signé, 30j expiry)
   ↓ (Response)
Browser
└─ localStorage.token = eyJhbGciOiJIUzI1NiJ9... ✅
└─ localStorage.userId = 550e8400-e29b-41d4-a716-446655440000 ✅
```

---

### Exemple 2: Login

```
Jean → Browser: email + password
   ↓ (POST /api/auth/login)
Backend
└─ Query: SELECT password_hash FROM users WHERE email='jean@club.fr'
   ↓ (SELECT)
PostgreSQL users table
└─ Retourne: password_hash: $2b$10$... ✅
   ↓
Backend
└─ Compare: bcrypt.compare('SecurePass123', '$2b$10$...')
└─ Si match: Generate JWT
   ↓ (Response)
Browser
└─ localStorage updated ✅
└─ Redirect to dashboard
```

---

### Exemple 3: Connect Strava

```
Jean clique "Connect Strava"
   ↓
Frontend
└─ POST /api/providers/strava/start
└─ Header: Authorization: Bearer {JWT}
   ↓ (JWT validation)
Backend
└─ Decode JWT avec JWT_SECRET
└─ Récupère userId: 550e8400-e29b-41d4-a716-446655440000
└─ Generate state: 660f8401-f30c-42e5-b827-557766551111 (UUID random)
   ↓ (INSERT)
PostgreSQL oauth_sessions table
└─ state: 660f8401-... ✅
└─ user_id: 550e8400-... ✅
└─ expires_at: NOW() + 15 minutes ✅
   ↓ (Response)
Frontend
└─ Reçoit authUrl avec state dans paramètres
└─ Redirige Jean vers Strava
   ↓
Strava (External)
└─ Jean autorise
└─ Redirige: /api/auth/strava/callback?code=XXX&state=660f8401-...
   ↓ (Callback)
Backend
└─ Query: SELECT * FROM oauth_sessions WHERE state='660f8401-...'
└─ Valide: pas expiré, provider=strava ✅
└─ Récupère userId: 550e8400-...
└─ DELETE FROM oauth_sessions (nettoyage)
   ↓
PostgreSQL
└─ oauth_sessions row deleted ✅ (sécurité)
   ↓
Backend
└─ code → Strava endpoint → access_token
   ↓ (INSERT)
PostgreSQL oauth_tokens table
└─ user_id: 550e8400-... ✅
└─ provider: strava ✅
└─ access_token: a4b945... ✅ (stocké, jamais envoyé frontend)
└─ expires_at: NOW() + 6 heures ✅
   ↓ (INSERT)
PostgreSQL app_connections table
└─ user_id: 550e8400-... ✅
└─ provider: strava ✅
└─ is_active: true ✅
   ↓ (Redirect)
Frontend
└─ Détecte callback success
└─ GET /api/connections
   ↓ (Query)
PostgreSQL
└─ Récupère app_connections pour cet user
   ↓ (Response)
Frontend
└─ Affiche: ✓ Strava Connected ✅
```

---

## 📍 Localisation Exacte

| Donnée | Location | Sûr? |
|--------|----------|------|
| Password user | `users.password_hash` (BD) | ✅ bcrypt |
| JWT Token | Browser localStorage | ✅ signed |
| OAuth Access Token | `oauth_tokens.access_token` (BD) | ✅ server-only |
| OAuth State | `oauth_sessions.state` (BD, 15min) | ✅ temp |
| User ID | Partout (public) | ✅ no-risk |
| Email | `users.email` (BD) | ⚠️ queryable |
| Athlete ID | `oauth_tokens.athlete_id` (BD) | ✅ reference |

---

## 🚀 Production: Neon Setup

```bash
1. Créer compte: https://neon.tech
2. Créer projet: "coach-center"
3. Autoriser PostgreSQL database
4. Copier connection string:
   postgresql://user:pass@host/dbname?sslmode=require
5. Ajouter à .env:
   DATABASE_URL={connection-string}
6. Deploy (Vercel, Railway)
7. Tables auto-créées au premier démarrage ✅
8. Backups automatiques ✅
9. 5 GB free (plus que nécessaire) ✅
```

---

## 📚 Lire Pour Plus de Détails

- **Complet:** [DATA_STORAGE_GUIDE.md](DATA_STORAGE_GUIDE.md)
- **Exemples réels:** [DATA_EXAMPLES.md](DATA_EXAMPLES.md)
- **Diagrammes:** [DATA_STORAGE_VISUALIZATION.md](DATA_STORAGE_VISUALIZATION.md)

---

**TL;DR:** Tout est dans PostgreSQL (Neon) sauf le JWT token qui est en localStorage. Rien d'sensible ne sort du serveur. ✅
