# 🔐 Configuration Complète des OAuth Providers

Tu dois créer une app pour chaque provider et récupérer les credentials. C'est requis avant le déploiement Vercel.

---

## 1️⃣ Google OAuth

### Étape 1: Créer un Google Cloud Project

```
1. Aller à: https://console.cloud.google.com/
2. Cliquer sur la dropdown en haut (où c'est écrit "Select a project")
3. Cliquer "NEW PROJECT"
4. Nom: "Coach Center"
5. Cliquer "CREATE"
6. Attendre 1-2 minutes que le projet soit créé
```

### Étape 2: Activer Google+ API

```
1. Dans la barre de recherche: taper "Google+ API"
2. Cliquer sur le premier résultat
3. Cliquer "ENABLE"
```

### Étape 3: Créer les credentials OAuth

```
1. Aller à: Credentials (menu gauche)
2. Cliquer "CREATE CREDENTIALS"
3. Choisir "OAuth 2.0 Client IDs"
4. Si tu vois un warning "Configure OAuth consent screen first":
   - Cliquer "CONFIGURE CONSENT SCREEN"
   - Choisir "External"
   - Cliquer "CREATE"
   - Remplir:
     * App name: Coach Center
     * User support email: ton@email.com
     * Developer contact: ton@email.com
   - Cliquer "SAVE AND CONTINUE"
   - Laisser les scopes par défaut
   - Cliquer "SAVE AND CONTINUE"
   - Ajouter toi-même comme test user
   - Cliquer "SAVE AND CONTINUE"
   - Cliquer "BACK TO DASHBOARD"

5. Retourner à Credentials
6. Cliquer "CREATE CREDENTIALS" → "OAuth 2.0 Client IDs" → "Web application"
7. Nom: "Coach Center Web"
8. Authorized redirect URIs - Ajouter:
   - http://localhost:3001/api/auth/google/callback (DEV)
9. Cliquer "CREATE"

10. Une popup s'affiche avec:
    - CLIENT_ID (copier!)
    - CLIENT_SECRET (copier!)
```

### Credentials à garder:
```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

---

## 2️⃣ Strava OAuth

### Étape 1: Créer une Strava App

```
1. Avoir un compte Strava (gratuit à https://www.strava.com/)
2. Aller à: https://www.strava.com/settings/api
3. Cliquer "Create an application"
4. Remplir le formulaire:
   - Application Name: Coach Center
   - Website: http://localhost:3000
   - Authorization callback domain: localhost:3001
   - Description: Coach training analytics platform
5. Accepter les terms
6. Cliquer "Create"

7. Tu vois maintenant:
   - Client ID (copier!)
   - Client Secret (copier!)
```

### Credentials à garder:
```
STRAVA_CLIENT_ID=xxx
STRAVA_CLIENT_SECRET=xxx
```

---

## 3️⃣ Intervals.icu OAuth

### Étape 1: Créer Intervals OAuth App

```
1. Avoir un compte Intervals.icu (gratuit à https://intervals.icu/)
2. Aller à: https://intervals.icu/settings/api
3. Onglet "OAuth"
4. Cliquer "New OAuth Application"

5. Remplir:
   - Name: Coach Center
   - Redirect URL: http://localhost:3001/api/auth/intervals/callback
   
6. Cliquer "Save"

7. Tu vois:
   - Client ID (copier!)
   - Client Secret (copier!)
```

### Credentials à garder:
```
INTERVALS_CLIENT_ID=xxx
INTERVALS_CLIENT_SECRET=xxx
```

---

## 4️⃣ Wahoo (Cycling Computer)

### Étape 1: Créer Wahoo App

```
1. Aller à: https://developer.wahooligan.com/
2. Login avec ton account Wahoo (ou créer)
3. Cliquer "Create application"
4. Remplir:
   - Name: Coach Center
   - Callback URL: http://localhost:3001/api/auth/wahoo/callback
   - Description: Coach training analytics

5. Cliquer "Create"

6. Tu vois:
   - Client ID (copier!)
   - Client Secret (copier!)
```

### Credentials à garder:
```
WAHOO_CLIENT_ID=xxx
WAHOO_CLIENT_SECRET=xxx
```

---

## Mettre à jour api/.env

Une fois que tu as TOUS les credentials, édite `/api/.env`:

```bash
# Ouvre api/.env et remplace les "dev_xxx" par les vrais credentials:

DATABASE_URL=postgresql://...  # Garde le même
JWT_SECRET=coach_center_dev_secret_2026  # Garde le même
JWT_EXPIRE=30d
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

GOOGLE_CLIENT_ID=12345.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxx

STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abcdef123456

INTERVALS_CLIENT_ID=xxx
INTERVALS_CLIENT_SECRET=xxx

WAHOO_CLIENT_ID=xxx
WAHOO_CLIENT_SECRET=xxx
WAHOO_CALLBACK_URL=http://localhost:3001/api/auth/wahoo/callback
```

---

## Tester Localement

Une fois les credentials dans `.env`:

```bash
# 1. Redémarrer le backend
# Kill le serveur (CTRL+C)
# Puis relancer:
cd /home/loiclebrec/Desktop/perso/coachproject/coach-center/api
node index.js

# 2. Brain test OAuth
TOKEN="<ton_token_depuis_login>"

# Test Google
curl -X POST http://localhost:3001/api/providers/google/start \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test Strava
curl -X POST http://localhost:3001/api/providers/strava/start \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test Intervals
curl -X POST http://localhost:3001/api/providers/intervals/start \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test Wahoo
curl -X POST http://localhost:3001/api/providers/wahoo/start \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Chaque endpoint va retourner un `authUrl` que tu peux tester dans le browser.

---

## Checklist

- [ ] Google: Client ID + Secret copiés
- [ ] Strava: Client ID + Secret copiés
- [ ] Intervals: Client ID + Secret copiés
- [ ] Wahoo: Client ID + Secret copiés
- [ ] api/.env mis à jour avec tous les credentials
- [ ] Backend redémarré
- [ ] Tests locaux passed

Quand tu as tout ça, dis-moi et on passe au déploiement Vercel! 🚀
