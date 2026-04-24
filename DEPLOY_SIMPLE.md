# 🚀 Déploiement Complet: Guide Étape par Étape

## ⏱️ Temps Total: ~2-3 heures (première fois)

---

## PHASE 1: Préparation (30 min)

### 1️⃣ Créer une Database PostgreSQL (Neon)

```bash
# 1. Aller à: https://neon.tech
# 2. Sign up (free)
# 3. Créer un projet: "coach-center"
# 4. Créer une database: "coachcenter"
# 5. Copier la connection string (ressemble à ça):

# EXEMPLE:
DATABASE_URL=postgresql://neondb_owner:password@ep-cool-lake-123456.eu-west-1.neon.tech/coachcenter?sslmode=require

# ✅ Garder ce string pour plus tard!
```

### 2️⃣ Créer les OAuth Apps (pour chaque provider)

#### Google OAuth
```
1. Aller à: https://console.cloud.google.com/
2. Créer un nouveau projet: "Coach Center"
3. Enable "Google+ API"
4. Créer OAuth 2.0 credentials
5. Authorized redirect URI:
   https://coach-center.example.com/api/auth/google/callback
6. Copier: Client ID et Client Secret
```

#### Strava OAuth
```
1. Aller à: https://www.strava.com/settings/api
2. Create application
3. Authorization callback domain: coach-center.example.com
4. Copier: Client ID et Client Secret
```

#### Intervals.icu OAuth
```
1. Aller à: https://intervals.icu/
2. Settings → Developer → Create OAuth app
3. Callback URL: https://coach-center.example.com/api/auth/intervals/callback
4. Copier: Client ID et Client Secret
```

#### Wahoo OAuth
```
1. Aller à: https://developer.wahooligan.com/
2. Create application
3. Redirect URI: https://coach-center.example.com/api/auth/wahoo/callback
4. Copier: Client ID et Client Secret
```

---

## PHASE 2: Deploy Backend (Vercel recommandé - 30 min)

### Option A: Vercel (Recommended)

```bash
# 1. Installer Vercel CLI
npm install -g vercel

# 2. Aller à la racine du projet
cd /home/loiclebrec/Desktop/perso/coachproject/coach-center

# 3. Se connecter à Vercel
vercel login
# → Ouvre navigateur, login avec GitHub/Email

# 4. Configurer le project
vercel
# Répondre aux questions:
# - Set up and deploy? Yes
# - Which scope? Your personal account
# - Link to existing project? No
# - Project name? coach-center-api
# - Root directory? ./api

# 5. Déployer le backend
cd api
vercel deploy --prod
# → URL: https://coach-center-api.vercel.app (ou similaire)
# ✅ Garder ce URL!
```

### Ajouter les Variables d'Environnement dans Vercel

```bash
# Dans Vercel Dashboard:
# 1. Aller à: Settings → Environment Variables
# 2. Ajouter ces variables:

DATABASE_URL=postgresql://...  # From Neon
JWT_SECRET=<generate: openssl rand -base64 32>
JWT_EXPIRE=30d
NODE_ENV=production
FRONTEND_URL=https://coach-center.example.com

GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

STRAVA_CLIENT_ID=xxx
STRAVA_CLIENT_SECRET=xxx

INTERVALS_CLIENT_ID=xxx
INTERVALS_CLIENT_SECRET=xxx
INTERVALS_CALLBACK_URL=https://coach-center-api.vercel.app/api/auth/intervals/callback

WAHOO_CLIENT_ID=xxx
WAHOO_CLIENT_SECRET=xxx
WAHOO_CALLBACK_URL=https://coach-center-api.vercel.app/api/auth/wahoo/callback

# 3. Save
# 4. Redeploy: vercel deploy --prod
```

### Générer JWT_SECRET

```bash
# Terminal:
openssl rand -base64 32

# Output: Une string aléatoire
# abc123def456ghi789jkl012mno345pqr678stu901vwx234yz

# Copier ce string dans VERCEL_ENV
```

---

## PHASE 3: Deploy Frontend (Vercel - 20 min)

### Configurer le Frontend

```bash
# 1. Aller à racine du projet
cd /home/loiclebrec/Desktop/perso/coachproject/coach-center

# 2. Créer/vérifier .env
# Modifier:
REACT_APP_API_URL=https://coach-center-api.vercel.app/api

# 3. Build
npm run build
# → Crée dossier: build/

# 4. Deploy frontend
vercel deploy --prod
# → URL: https://coach-center.vercel.app (ou similaire)
```

### Ajouter Variables Frontend

```bash
# Dans Vercel Dashboard (Frontend project):
# Settings → Environment Variables

REACT_APP_API_URL=https://coach-center-api.vercel.app/api
```

---

## PHASE 4: Configurer les OAuth Callbacks (15 min)

Maintenant que tu as tes URLs:
- **Frontend:** https://coach-center.vercel.app
- **Backend:** https://coach-center-api.vercel.app

### Mettre à jour chaque provider:

#### Google Console
```
Authorized redirect URIs:
https://coach-center-api.vercel.app/api/auth/google/callback
```

#### Strava
```
Authorization callback domain:
coach-center.vercel.app
```

#### Intervals.icu
```
Callback URL:
https://coach-center-api.vercel.app/api/auth/intervals/callback
```

#### Wahoo
```
Redirect URI:
https://coach-center-api.vercel.app/api/auth/wahoo/callback
```

---

## PHASE 5: Test (30 min)

### 1️⃣ Test Backend Health

```bash
curl https://coach-center-api.vercel.app/api/health

# Résultat: {"status":"ok","timestamp":"2026-04-23T..."}
```

### 2️⃣ Test Registration

```bash
curl -X POST https://coach-center-api.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "name": "Test User"
  }'

# Résultat: {"userId": "uuid", "token": "jwt..."}
```

### 3️⃣ Test Login

```bash
curl -X POST https://coach-center-api.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'

# Résultat: {"userId": "uuid", "token": "jwt..."}
```

### 4️⃣ Test dans le Browser

```
1. Aller à: https://coach-center.vercel.app
2. Voir la page d'accueil ✅
3. Cliquer "Register"
4. Créer compte: test2@example.com ✅
5. Cliquer "Connect Strava" ✅
6. Voir la redirect Strava ✅
```

---

## Alternative: Railway / Render / Heroku

Si tu préfères pas Vercel:

### Railway (Je recommande après Vercel)

```bash
# 1. Aller à: https://railway.app
# 2. Sign up
# 3. Create project
# 4. Deploy from GitHub

# 2. Environment variables:
# DATABASE_URL, JWT_SECRET, etc (même que Vercel)

# Ton backend sera sur: https://coach-center-api.up.railway.app
```

### Render

```bash
# 1. Aller à: https://render.com
# 2. Sign up
# 3. Create Web Service
# 4. Connect GitHub repo

# URL sera: https://coach-center-api.render.com
```

### Heroku (très simple)

```bash
# 1. Installer Heroku CLI
npm install -g heroku

# 2. Login
heroku login

# 3. Créer une app
heroku create coach-center-api

# 4. Set environment variables
heroku config:set DATABASE_URL=postgresql://...
heroku config:set JWT_SECRET=abc123...
# (etc. pour tous les vars)

# 5. Deploy
git push heroku main

# 6. Voir les logs
heroku logs --tail

# URL: https://coach-center-api.herokuapp.com
```

---

## Checklist Finale

### Backend ✅
- [ ] Database Neon créée et URL copiée
- [ ] Backend déployé sur Vercel (ou autre)
- [ ] Environment variables ajoutées
- [ ] OAuth credentials de tous les 4 providers
- [ ] Callback URLs mises à jour dans chaque provider
- [ ] Health check répond ✅

### Frontend ✅
- [ ] .env `REACT_APP_API_URL` mis à jour
- [ ] Build local: `npm run build` fonctionne
- [ ] Frontend déployé sur Vercel (ou autre)
- [ ] Page charges correctement
- [ ] API calls fonctionnent

### OAuth Testing ✅
- [ ] Register fonctionne
- [ ] Login fonctionne
- [ ] "Connect Strava" button redirige
- [ ] Callback Strava fonctionne
- [ ] Connection status affiche correctement

---

## Troubleshooting

### "Database connection failed"
```bash
# 1. Vérifier DATABASE_URL dans Vercel
# 2. Tester la connection:
psql $DATABASE_URL

# 3. Si ça marche pas, créer nouvelle database Neon
```

### "OAuth redirect URI mismatch"
```bash
# 1. Vérifier dans CHAQUE provider console:
#    Google, Strava, Intervals, Wahoo
# 2. Callback URL doit être EXACTEMENT:
#    https://coach-center-api.vercel.app/api/auth/:provider/callback
#    (noter: Vercel peut changer le .app)
# 3. Re-deploy après changement
```

### "JWT token invalid"
```bash
# Si personne peut login:
# 1. Vérifier JWT_SECRET dans Vercel
# 2. Doit être long et random
# 3. Regenerate: openssl rand -base64 32
# 4. Update dans Vercel
# 5. Redeploy
```

### "No token provided"
```bash
# Frontend ne peut pas appeler /api/auth/me
# 1. Vérifier localStorage en dev tools
# 2. Vérifier token est stocké après login
# 3. Vérifier Authorization header est envoyé
```

---

## Après le Déploiement

### Monitoring

```bash
# Vercel:
# Aller à: https://vercel.com → Project → Analytics
# Voir: response times, errors, logs

# Backend logs:
# Vercel → Project → Logs (real-time)
```

### Maintenance

```bash
# Updates du code:
cd api
npm update      # Update dependencies
git add .
git commit -m "Update dependencies"
git push        # Auto-redeploy via Vercel

# Database backups:
# Neon: automatic (daily)
# Dashboard: https://console.neon.tech

# Cleanup expired sessions (opcional):
# Deployé dans: api/index.js
# Runs automatiquement
```

### Scaling

Si beaucoup d'utilisateurs:
- Neon: Upgrade à plan payant ($5-100/month)
- Vercel: Auto-scales (payant après X requests/month)
- Add caching layer si besoin

---

## Quick Summary

```bash
# 1. Create Database
https://neon.tech → Create project

# 2. Create OAuth Apps
Google, Strava, Intervals, Wahoo

# 3. Deploy Backend
vercel deploy --prod (api/)
Add env vars in Vercel

# 4. Deploy Frontend
vercel deploy --prod (root)
Update REACT_APP_API_URL

# 5. Update OAuth Callbacks
In each provider console

# 6. Test
curl + browser

# 🎉 LIVE!
```

---

**Besoin d'aide? Voir:**
- DEPLOYMENT_CHECKLIST.md
- BACKEND_DEPLOYMENT.md
- FRONTEND_INTEGRATION.md
