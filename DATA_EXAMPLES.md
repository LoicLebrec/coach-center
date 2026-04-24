# 🗂️ Exemples Concrets de Données Stockées

## Scénario: Jean s'inscrit et connecte Strava

### 1️⃣ Jean crée un compte

**Action:** Jean remplit le formulaire
```
Email: jean@club.fr
Password: MySecurePass2026
Name: Jean Dupont
```

**Ce qui arrive dans PostgreSQL:**

#### Avant:
```
users table:
(vide)
```

#### Après registration:
```sql
SELECT * FROM users;

id                                  | email       | password_hash                          | name         | google_id | created_at
------------------------------------|-------------|----------------------------------------|--------------|-----------|-------------------
550e8400-e29b-41d4-a716-446655440000 | jean@club.fr | $2b$10$xxxxxxxxxxxxxxxxxxx... | Jean Dupont  | NULL      | 2026-04-23 10:30
```

**Backend c'est fait:**
```javascript
// 1. UUID généré: 550e8400-e29b-41d4-a716-446655440000
// 2. Password hasché: MySecurePass2026 → $2b$10$xxxxx...
// 3. Inséré dans PostgreSQL
```

**Frontend reçoit:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAifQ...."
}
```

**Frontend stocke:**
```javascript
// localStorage (navigateur)
{
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  userId: "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 2️⃣ Jean clique "Connect Strava"

**Action:** Jean clique le bouton

**Ce qui arrive:**

```javascript
// Frontend envoie:
POST /api/providers/strava/start
Headers: {
  Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Backend valide le JWT:**
```javascript
// Décrypte le token JWT:
// → userId: 550e8400-e29b-41d4-a716-446655440000
```

**Créé une session OAuth temporaire:**

#### Avant:
```
oauth_sessions table:
(vide)
```

#### Après:
```sql
SELECT * FROM oauth_sessions;

state                                | user_id                              | provider | created_at          | expires_at
-------------------------------------|--------------------------------------|----------|---------------------|-------------------
660f8401-f30c-42e5-b827-557766551111 | 550e8400-e29b-41d4-a716-446655440000 | strava   | 2026-04-23 10:35:00 | 2026-04-23 10:50:00
```

**Frontend reçoit:**
```json
{
  "authUrl": "https://www.strava.com/oauth/authorize?client_id=12345&redirect_uri=...&response_type=code&scope=read,activity:read_all&state=660f8401-f30c-42e5-b827-557766551111"
}
```

**Frontend redirige Jean:**
```javascript
window.location.href = "https://www.strava.com/oauth/authorize?..."
```

**Jean voit la page Strava** → Autorise l'accès

---

### 3️⃣ Strava redirige vers le callback

**Strava redirige:**
```
GET http://coach-center.com/api/auth/strava/callback?
    code=4c3b1c3b1c3b1c3b1c3b1c3b1c3b1c3b&
    state=660f8401-f30c-42e5-b827-557766551111
```

**Backend:**

1. **Valide le state:**
```sql
SELECT * FROM oauth_sessions 
WHERE state='660f8401-f30c-42e5-b827-557766551111'

-- Résultat:
state | user_id | provider | expires_at
------|---------|----------|-------------------
660f...| 550e8...| strava   | 2026-04-23 10:50:00 ✅ (pas expiré)
```

2. **Échange le code contre un token:**
```javascript
// POST https://www.strava.com/oauth/token
{
  code: "4c3b1c3b1c3b1c3b1c3b1c3b1c3b1c3b",
  client_id: "12345",
  client_secret: "secret_key_xxx",
  grant_type: "authorization_code"
}

// Strava retourne:
{
  access_token: "a4b945687g8h9i0jk1l2m3n4o5p6q7r8s9",
  refresh_token: "e2f3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9",
  expires_in: 21600,  // 6 heures
  athlete: { id: 123456, firstname: "Jean", lastname: "Dupont" }
}
```

3. **Stocke le token dans la BD:**

#### Avant:
```
oauth_tokens table:
(vide)
```

#### Après:
```sql
SELECT * FROM oauth_tokens
WHERE user_id='550e8400-e29b-41d4-a716-446655440000';

id                                  | user_id                              | provider | access_token                          | refresh_token                         | expires_at          | athlete_id
------------------------------------|--------------------------------------|----------|---------------------------------------|---------------------------------------|---------------------|----------
770g8402-g41d-53f6-c828-668877662222 | 550e8400-e29b-41d4-a716-446655440000 | strava   | a4b945687g8h9i0jk1l2m3n4o5p6q7r8s9   | e2f3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9 | 2026-04-23 16:35:00 | 123456
```

4. **Crée une entrée dans app_connections (cache UI):**

#### Après:
```sql
SELECT * FROM app_connections
WHERE user_id='550e8400-e29b-41d4-a716-446655440000';

id                                  | user_id                              | provider | athlete_id | display_name | is_active | connected_at
------------------------------------|--------------------------------------|----------|------------|--------------|-----------|-------------------
880h8403-h52e-64g7-d939-779988773333 | 550e8400-e29b-41d4-a716-446655440000 | strava   | 123456     | Jean Dupont  | true      | 2026-04-23 10:36:00
```

5. **Supprime la session OAuth (nettoyage):**

#### Avant cleanup:
```sql
SELECT * FROM oauth_sessions;
660f8401-... | 550e8400-... | strava | ...
```

#### Après cleanup:
```sql
SELECT * FROM oauth_sessions;
(vide)
```

6. **Redirige Jean:**
```
Redirect: https://coach-center.com?provider=strava&success=true
```

---

### 4️⃣ Frontend affiche "Connected ✓"

**Frontend détecte le callback:**
```javascript
// Détecte dans l'URL: provider=strava&success=true
// Appelle:
GET /api/connections
Headers: Authorization: Bearer {token}

// Backend retourne:
{
  "strava": true,     ← ✅ Connecté!
  "garmin": false,
  "intervals": false,
  "wahoo": false
}

// UI affiche: ✓ Strava Connected
```

---

## 📊 État Final de la Base de Données

### Après tout ça, voici l'état complet:

```sql
-- 1. Jean enregistré
SELECT * FROM users;
┌─────────────────────┬──────────────┬───────────────────────┐
│ id (UUID)           │ email        │ password_hash         │
├─────────────────────┼──────────────┼───────────────────────┤
│ 550e8400-e29b-41d4  │ jean@club.fr │ $2b$10$xxxxxxxxxxxxx  │
└─────────────────────┴──────────────┴───────────────────────┘

-- 2. Token Strava stocké
SELECT * FROM oauth_tokens;
┌──────────────────┬─────────────┬──────────┬──────────────────────────┐
│ id (UUID)        │ user_id     │ provider │ access_token             │
├──────────────────┼─────────────┼──────────┼──────────────────────────┤
│ 770g8402-g41d... │ 550e8400... │ strava   │ a4b945687g8h9i0jk1l2m... │
└──────────────────┴─────────────┴──────────┴──────────────────────────┘

-- 3. Connexion en cache (pour UI)
SELECT * FROM app_connections;
┌──────────────────┬─────────────┬──────────┬──────────────┐
│ id (UUID)        │ user_id     │ provider │ display_name │
├──────────────────┼─────────────┼──────────┼──────────────┤
│ 880h8403-h52e... │ 550e8400... │ strava   │ Jean Dupont  │
└──────────────────┴─────────────┴──────────┴──────────────┘

-- 4. Sessions OAuth (vide = nettoyées)
SELECT * FROM oauth_sessions;
(vide)
```

---

## 🔄 Lifecycle Complét: Timeline

```
10:30:00 → Jean s'inscrit
           ✅ users table: +1 ligne
           ✅ Frontend: token + userId en localStorage

10:35:00 → Jean clique "Connect Strava"
           ✅ oauth_sessions table: +1 ligne (temporary)

10:35:05 → Strava redirige le callback
           ✅ oauth_sessions: validée, puis supprimée
           ✅ oauth_tokens table: +1 ligne (access_token)
           ✅ app_connections table: +1 ligne (cache)
           ← Frontend: "✓ Strava Connected"

10:50:00 → Session OAuth a expiré (si jamais utilisée)
           ✅ Auto-cleanup job: supprime la session


[Quelques jours plus tard]

Besoin d'appeler Strava pour récupérer activités:
1. Frontend: userId in localStorage
2. Backend: SELECT access_token FROM oauth_tokens 
            WHERE user_id=? AND provider='strava'
3. API Strava: GET /athlete/activities 
               Authorization: Bearer a4b945687g8h9i0...
4. Strava: Retourne les activités
5. Frontend: Affiche les données
```

---

## 🔐 Données Sensibles: Comment c'est Protégé

### Password Hash
```
Input: "MySecurePass2026"
Process: bcrypt(password, 10)
Result: "$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

- ✅ Impossible de retrouver le password
- ✅ Impossible de créer 2 hashes identiques
- ✅ Chaque hash est unique même pour même password
- ✅ Même si BD leakée, passwords sûrs
```

### Access Tokens
```
Stocké: "a4b945687g8h9i0jk1l2m3n4o5p6q7r8s9"

- ✅ Jamais envoyé au frontend
- ✅ Backend seul peut le voir
- ✅ Frontend ne peut jamais l'accéder
- ✅ Utilisé uniquement server-side
- ✅ Expire automatiquement (6h)
- ✅ Peut être chiffré dans production
```

### JWT Token (Frontend)
```
Token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

- ✅ Signé avec JWT_SECRET
- ✅ Expire après 30 jours
- ✅ Impossible de forger sans secret
- ✅ Stocké en localStorage (pas de cookie = pas de CSRF simple)
```

---

## 📈 Scaling: Quand beaucoup d'utilisateurs

Si vous avez 10,000 comptes et chacun 3 providers connectés:

```
users:           10,000 lignes (≈ 100 KB)
oauth_tokens:    30,000 lignes (≈ 3 MB)
app_connections: 30,000 lignes (≈ 1 MB)
oauth_sessions:  ~100 lignes (auto-cleanup, toujours petite)
athlete_data:    Dépend du cache

Total: ≈ 5-10 MB sur Neon free tier ✅
```

**Neon free tier:** 5 GB → 500-1000x la capacité! 🚀

---

## 🎯 Résumé: Les 3 Endroits où sont les Données

### 1. **Frontend (Browser)**
```
localStorage = {
  token: "JWT token",
  userId: "UUID"
}
```
→ Stocke le minimum (identification uniquement)

### 2. **Backend (Express Server Memory)**
```
ENV = {
  JWT_SECRET: "secret pour signer",
  DATABASE_URL: "connection string",
  OAuth credentials: "clés des providers"
}
```
→ Temporaire, rechargé au démarrage

### 3. **PostgreSQL Database (Neon - Persistent)**
```
users, oauth_tokens, app_connections, etc.
```
→ Permanent, sauvegardé automatiquement

**La règle d'or:** 
- 🔴 Jamais: Passwords, OAuth tokens en frontend/log
- 🟡 Quelques jours: JWT tokens (30j expiry)
- 🟢 Permanent: Hashed passwords, connection metadata
