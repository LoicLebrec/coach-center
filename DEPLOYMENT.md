# Coach Center - Plateforme d'Analyse de Performance Cycliste

Application web complète pour entraîner et analyser la performance cycliste. Intégration Intervals.icu, Strava, Garmin, Wahoo.

> **Prêt pour déploiement au club** ✅

---

## 🎯 Features

### Dashboard
- **PMC Chart** (Performance Management Chart) - CTL/ATL/TSB
- **Form Predictor** - Projection 8 semaines des états de forme
- **Weekly Load** - Volume d'entraînement par semaine
- **Activity Heatmap** - Visualisation de l'activité récente

### Planification
- **Suggested Week** - Génération automatique de microcycles
- **Calendar** - Calendrier d'entraînement avec drag-and-drop
- **Workout Builder** - Composition de séances structurées
- **Route Builder** - GPX generator (Garmin + COROS)
- **Race Calendar** - Calendrier FFC/FSGT/UFOLEP/FFCT

### Analyse
- **Activities** - Liste filtrables des séances
- **Athlete Profile** - Profil avec recommandations
- **Workout Analysis** - Décorticage des performances

### IA
- **APEX Coach** - Assistant d'entraînement (Claude/Groq)
- **Plan Upload** - Analyse d'un plan d'entraînement par l'IA

---

## 🚀 Déploiement (Checklist)

### 1️⃣ Configuration OAuth (15 minutes par service)

#### Intervals.icu
```
👉 https://intervals.icu/settings → Developer Settings
1. Create OAuth App
2. Copier Client ID + Secret
3. Callback URL: https://your-domain.vercel.app/api/auth/intervals/callback
```

#### Strava
```
👉 https://www.strava.com/settings/api
1. Create Application
2. Copier Client ID + Secret
3. Callback URL: https://your-domain.vercel.app/api/auth/strava/callback
4. OAuth Scopes: activity:read_all
```

#### Garmin
```
👉 https://developer.garmin.com
1. Create OAuth App
2. Copier Client ID + Secret
3. Callback URL: https://your-domain.vercel.app/api/auth/garmin/callback
```

#### Wahoo
```
👉 https://developers.wahooligan.com
1. Create Application
2. Copier Client ID + Secret
3. Callback URL: https://your-domain.vercel.app/api/auth/wahoo/callback
```

### 2️⃣ Déployer sur Vercel (5 minutes)

```bash
# Push le code sur GitHub
git add .
git commit -m "feat: add oauth backend + login"
git push origin main
```

1. Connecter Vercel au repo GitHub
2. Import Project → sélectionner le repo
3. Framework: Next.js / React
4. Environment Variables → Ajouter TOUTES les variables:

```
FRONTEND_URL=https://your-vercel-domain.vercel.app
JWT_SECRET=<générer un token aléatoire long>
INTERVALS_CLIENT_ID=<value>
INTERVALS_CLIENT_SECRET=<value>
STRAVA_CLIENT_ID=<value>
STRAVA_CLIENT_SECRET=<value>
GARMIN_CLIENT_ID=<value>
GARMIN_CLIENT_SECRET=<value>
WAHOO_CLIENT_ID=<value>
WAHOO_CLIENT_SECRET=<value>
```

5. Deploy!

### 3️⃣ Test de connexion (2 minutes)

```
Ouvrir: https://your-domain.vercel.app
1. S'inscrire (email/password)
2. Settings → Connexion Intervals.icu
3. Vérifier que les données se chargent
```

---

## 👥 Utilisation au Club

### Pour les athlètes

**Première connexion:**
```
1. Aller sur https://your-domain.vercel.app
2. S'inscrire (email + mot de passe)
3. Aller dans Settings
4. "Connect Intervals.icu" → Autoriser
5. Données se chargent automatiquement
```

**Tous les jours:**
- ✅ Voir mon PMC (forme, fatigue, TSB)
- ✅ Consulter les séances suggérées
- ✅ Ajouter/modifier mon calendrier
- ✅ Analyser mes performances

### Pour le coach

**Vue d'ensemble du groupe** (en cours d'implémentation)
```
Dashboard coach → voir tous les athlètes
- PMC de chacun
- Compliance avec le plan
- Signaux de surmenage
- Export CSV pour rapports
```

**Générer des plans:**
```
1. Calendar → AI Plan Generator
2. Sélectionner objectif + durée + charge
3. Générer → ajouter aux calendriers des athlètes
```

---

## 🏗️ Architecture

```
coach-center/
├── src/                    # Frontend React
│   ├── components/         # UI components
│   ├── services/           # API clients
│   └── styles/             # CSS
├── api/                    # Backend Node.js/Express
│   ├── index.js            # Server principal
│   ├── auth.js             # Auth + JWT
│   ├── oauth-handlers.js   # OAuth callbacks
│   ├── db.js               # SQLite DB
│   └── README.md           # API docs
├── public/                 # Static assets
├── build/                  # Production build
└── vercel.json             # Vercel config
```

### Frontend
- React 18
- Recharts (visualisations)
- React Router
- Responsive design

### Backend
- Node.js + Express
- SQLite3 (données stockées)
- JWT (authentification)
- OAuth 2.0 (Intervals, Strava, Garmin, Wahoo)

### Base de données
```sql
users              -- Comptes des athlètes
oauth_tokens       -- Tokens sécurisés
athlete_data       -- Cache des profils
wellness           -- CTL/ATL historique
activities         -- Séances d'entraînement
```

---

## 🔐 Sécurité

- ✅ Passwords hashés (bcrypt)
- ✅ JWT pour sessions
- ✅ CORS restrictif (frontend seulement)
- ✅ OAuth tokens stockés sécurely
- ✅ Expiration des tokens
- ✅ HTTPS mandatory (Vercel)

---

## 📊 Données

Toutes les données sont centralisées sur le serveur Vercel:
- ✅ Données des athlètes
- ✅ Historique wellness/activities
- ✅ Profils entraîneurs
- ✅ Calendriers partagés

Aucune donnée n'est visible entre athlètes.

---

## 🛠️ Maintenance

### Sync automatique
Le backend sync périodiquement:
```
- Chaque heure: activités récentes
- Chaque jour: wellness + CTL/ATL
- À la demande: via Settings → "Sync now"
```

### Backup
SQLite file `/tmp/coach-center.db` (Vercel)
→ À exporter régulièrement vers cloud (Google Drive, etc)

### Logs
Vercel Logs → realtime monitoring des erreurs

---

## 🎓 Formation club

### Athlètes (15 min)
1. **Login** et première connexion OAuth
2. **Dashboard** - comprendre PMC, form state, suggestions
3. **Calendar** - planification simple
4. **Settings** - gérer connexions services

### Coaches (30 min)
1. **Athlete Profile** - avis personnalisés
2. **AI Coach** - générer plans avec IA
3. **Export data** - rapports pour analyses
4. **Troubleshooting** - connexion, caching, refresh

---

## 🐛 Troubleshooting

### "Données ne se chargent pas"
```
✓ Vérifier connexion Intervals.icu dans Settings
✓ Cliquer "Sync now" dans Settings
✓ F5 pour recharger la page
```

### "Erreur OAuth"
```
✓ Vérifier Client ID/Secret dans .env
✓ Vérifier Redirect URI exacte dans provider
✓ Voir logs Vercel
```

### "CTL toujours à 0"
```
✓ Verifier que Intervals sync is actif (Settings)
✓ Cliquer "Repair history" dans Settings
✓ Attendre 1-2 minutes
```

---

## 📧 Support

- Questions OAuth → Lire api/README.md
- Questions frontend → Lire code comments
- Bugs → Créer issue sur GitHub

---

## ✨ Next Steps

- [ ] Dashboard coach (vue club)
- [ ] Export CSV pour rapports
- [ ] Webhooks auto-sync
- [ ] Mobile app (PWA)
- [ ] Notifications (Slack/Discord)
- [ ] Analytics avancées

---

**Ready to deploy? Start with Step 1 above! 🚀**
