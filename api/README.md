# Coach Center API

Backend OAuth centralisé pour Coach Center. Gère l'authentification et les connexions OAuth pour Intervals.icu, Strava, Garmin et Wahoo.

## Installation locale

```bash
cd api
npm install
cp .env.example .env
npm run dev
```

L'API démarre sur `http://localhost:3001`

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

**GET** `/api/auth/intervals/callback?code=...&state=userId`
Redirect to frontend on success

**GET** `/api/auth/strava/callback?code=...&state=userId`
Redirect to frontend on success

**GET** `/api/auth/garmin/callback?code=...&state=userId`
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
