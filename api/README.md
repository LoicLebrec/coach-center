# Coach Center API

Backend Node.js/Express pour Coach Center - gestion des comptes utilisateurs et intégration OAuth sécurisée avec les applications sportives.

🎯 **Restructuration 2026:** Architecture repensée avec gestion des comptes par utilisateur et connexions OAuth sécurisées (pas d'API keys partagées).

## Installation locale

```bash
cd api
npm install
cp .env.example .env        # Edit with your values
npm run dev
```

L'API démarre sur `http://localhost:3001`

⚠️ **Note:** Le backend a été restructurisé pour la production. Voir `BACKEND_DEPLOYMENT.md` pour le guide complet.

## Architecture

### 🔐 Sécurité (Nouveau)
- ✅ Tokens OAuth stockés server-side (jamais exposés au browser)
- ✅ CSRF protection via états de session temporaires (15 min expiry)
- ✅ Per-user token isolation (chaque user a ses propres tokens)
- ✅ JWT-based authentication (30 jours)

### 📊 Base de données
- `users` - Comptes utilisateurs
- `oauth_tokens` - Tokens par provider (Strava, Garmin, etc.)
- `oauth_sessions` - États temporaires pour OAuth (sécurité CSRF)
- `app_connections` - Cache metadata pour la UI

## Variables d'environnement (.env)

### Sécurité
- `JWT_SECRET` : Clé pour signer les JWT (générer une clé longue aléatoire en production)
- `JWT_EXPIRE` : Durée d'expiration des tokens (ex: '7d')

### Intervals.icu
1. Aller sur https://intervals.icu/settings
2. Developer Settings → créer une OAuth App
3. Copier `Client ID` et `Client Secret`
4. Callback URL: `https://votre-domain.vercel.app/api/auth/intervals/callback`

### Strava
1. Aller sur https://www.strava.com/settings/api
2. Créer une Application
3. Copier `Client ID` et `Client Secret`
4. Callback URL: `https://votre-domain.vercel.app/api/auth/strava/callback`

### Garmin
1. Developer portal: https://developer.garmin.com
2. Créer une OAuth App
3. Copier credentials
4. Callback URL: `https://votre-domain.vercel.app/api/auth/garmin/callback`

### Wahoo
1. Developer portal: https://developers.wahooligan.com
2. Créer une OAuth App
3. Copier credentials
4. Callback URL: `https://votre-domain.vercel.app/api/auth/wahoo/callback`

## API Endpoints

### Authentication

**POST** `/api/auth/register`
```json
{
  "email": "athlete@club.fr",
  "password": "securepass",
  "name": "Prénom Nom"
}
```
Response:
```json
{
  "userId": "uuid",
  "token": "jwt-token"
}
```

**POST** `/api/auth/login`
```json
{
  "email": "athlete@club.fr",
  "password": "securepass"
}
```
Response:
```json
{
  "userId": "uuid",
  "token": "jwt-token"
}
```

**GET** `/api/auth/me`
Headers: `Authorization: Bearer <token>`
Response:
```json
{
  "id": "uuid",
  "email": "athlete@club.fr",
  "name": "Prénom Nom"
}
```

### OAuth

**POST** `/api/providers/:provider/start` *(Nouveau. Protected)*
```bash
curl -X POST http://localhost:3001/api/providers/strava/start \
  -H "Authorization: Bearer <token>"
```
Response:
```json
{
  "authUrl": "https://www.strava.com/oauth/authorize?client_id=...&state=..."
}
```
Le frontend redirige vers cet URL. Backend valide le callback automatiquement.

**GET** `/api/auth/:provider/callback?code=...&state=...` *(Automatique)*
Utilisé par le provider pour retourner le code. Backend échange le code pour un token, puis redirige le frontend.

**GET** `/api/connections` *(Protected)* - ✨ Nouveau/Amélioré
```bash
curl http://localhost:3001/api/connections \
  -H "Authorization: Bearer <token>"
```
Response:
```json
{
  "strava": true,
  "garmin": false,
  "intervals": true,
  "wahoo": false
}
```

**GET** `/api/connections/:provider` *(Nouveau. Protected)*
Détails de la connexion (athlete ID, expiration, etc.)

**DELETE** `/api/connections/:provider` *(Nouveau. Protected)*
Déconnecter un provider

---

## ⚡ Changements 2026 - À NOTER

**Avant:** L'userId était passé comme paramètre `state` (INSECURISÉ)
```javascript
// ❌ ANCIEN
window.location.href = `${auth_url}&state=${userId}`;  // DANGER!
```

**Après:** Proper OAuth flow avec validation server-side
```javascript
// ✅ NOUVEAU
const res = await fetch('/api/providers/strava/start', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { authUrl } = await res.json();
window.location.href = authUrl; // state géré server-side
```

## 📚 Documentation

- **[BACKEND_DEPLOYMENT.md](../BACKEND_DEPLOYMENT.md)** - Guide complet de déploiement, architecture database, checklist production
- **[FRONTEND_INTEGRATION.md](../FRONTEND_INTEGRATION.md)** - Guide pour développeurs frontend, exemples de code
- **[BACKEND_CHANGES_SUMMARY.md](../BACKEND_CHANGES_SUMMARY.md)** - Résumé détaillé des changements d'architecture

## 🚀 Quick Deploy

```bash
# Vercel
npm install -g vercel
vercel deploy

# Render / Railway / Other platforms - set DATABASE_URL and oauth env vars
git push origin main
```


Redirect to frontend on success

**GET** `/api/auth/wahoo/callback?code=...&state=userId`
Redirect to frontend on success

### Data

**GET** `/api/connections`
Headers: `Authorization: Bearer <token>`
Response:
```json
{
  "intervals": true,
  "strava": false,
  "garmin": true,
  "wahoo": false
}
```

## Déployer sur Vercel

1. Push le code sur GitHub
2. Connecter Vercel au repo
3. Root Directory: `.` (ou `api/` si dans un sous-dossier)
4. Environment Variables: Ajouter toutes les variables de `.env.example`
5. Deploy

## Structure BD

- **users** : Comptes athlètes du club
- **oauth_tokens** : Tokens OAuth stockés (sécurisé)
- **athlete_data** : Cache des données athlètes
- **wellness** : CTL/ATL/HR/poids
- **activities** : Activités d'entraînement

## Sécurité

- ✅ Passwords hash avec bcrypt
- ✅ JWT pour les sessions
- ✅ CORS restrictif (frontend seulement)
- ✅ OAuth tokens stockés securely
- ✅ Token refresh automatique
- ✅ Expiration des tokens

## TODO

- [ ] Refresh token cron job
- [ ] Sync automatique des données (wellness, activities)
- [ ] Export CSV pour le club
- [ ] Dashboard coach (vue globale)
- [ ] Webhooks Intervals/Strava
