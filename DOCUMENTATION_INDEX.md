# Coach Center - Documentation Index

## 📚 Guides de Déploiement & Architecture

### 0. **[OAUTH_SETUP.md](OAUTH_SETUP.md)** START HERE - CONFIGURE PROVIDERS
**Destiné à:** Tous (configuration API keys)  
**Contient:**
- Setup Google OAuth (Cloud Console)
- Setup Strava OAuth (API)
- Setup Intervals.icu OAuth
- Setup Wahoo OAuth (Cycling)
- Comment récupérer Client ID + Secret
- Mettre à jour api/.env
- Tests locaux des OAuth flows

**Lire d'abord si:** Vous n'avez pas encore les OAuth credentials

---

### 1. **[DEPLOY_SIMPLE.md](DEPLOY_SIMPLE.md)** 🚀 DEPLOY IN 30 MIN
**Destiné à:** Tous (déploiement rapide)  
**Contient:**
- Guide étape par étape complet
- Commandes exactes à copier-coller
- Setup Neon PostgreSQL (5 min)
- Deploy backend Vercel (10 min)
- Deploy frontend Vercel (10 min)
- Test endpoints (5 min)
- Troubleshooting rapide

**Lire après:** OAUTH_SETUP.md (une fois OAuth configured)

---

### 2. **[BACKEND_DEPLOYMENT.md](BACKEND_DEPLOYMENT.md)** ⭐ DETAILED REFERENCE
**Destiné à:** DevOps, Backend Developers  
**Contient:**
- Architecture complète du backend
- Schema de base de données (postgresql)
- Description détaillée de tous les endpoints API
- Checklist de déploiement
- Variables d'environnement requises
- Exemples de curl pour tester

**Lire d'abord si:** Vous déployez en production et voulez comprendre les détails

---

### 3. **[FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md)**
**Destiné à:** Frontend Developers  
**Contient:**
- Setup instructions for OAuth flow
- React component examples (login, connections)
- API reference and error handling
- How to integrate with backend
- Breaking changes from old architecture

**Lire d'abord si:** Vous développez le frontend React

---

### 4. **[BACKEND_CHANGES_SUMMARY.md](BACKEND_CHANGES_SUMMARY.md)**
**Destiné à:** Tech Leads, Architects  
**Contient:**
- Résumé des changements apportés
- Avant/après comparaison
- Niveaux de sécurité améliorés
- Liste des fichiers modifiés
- Architecture diagram

**Lire pour:** Comprendre la restructuration complète

---

### 5. **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** 🚀
**Destiné à:** DevOps Engineers, Deployment  
**Contient:**
- Checklist étape par étape
- Setup d'OAuth providers
- Configuration des variables d'environnement
- Commands de test post-déploiement
- Rollback plan
- Troubleshooting guide

**Utiliser pour:** Préparer le déploiement production

---

### 6. **[api/README.md](api/README.md)**
**Destiné à:** Backend developers (local dev)  
**Contient:**
- Quick start local (Docker, npm)
- Installation instructions
- Étapes de configuration
- API endpoints quick reference
- Common issues

**Utiliser pour:** Démarrer le backend localement

---

### 7. **[DATA_STORAGE_GUIDE.md](DATA_STORAGE_GUIDE.md)** 💾 NEW!
**Destiné à:** Tous (comprendre où les données vivent)  
**Contient:**
- Infrastructure PostgreSQL (Neon)
- Schéma complet des 5 tables
- Comment les données circulent
- Exemples de SQL
- Sécurité: chiffrage, hashage
- Production setup

**Utiliser pour:** Comprendre qui stocke quoi

---

### 8. **[DATA_EXAMPLES.md](DATA_EXAMPLES.md)** 📊 NEW!
**Destiné à:** Développeurs, Ops  
**Contient:**
- Scénario complet: Jean s'inscrit → connecte Strava
- État de la BD à chaque étape
- Données exactes qui sont enregistrées
- Timeline complète (10:30:00 → 10:50:00)
- Exemples SQL réels
- Lifecycle et data sensitivity

**Utiliser pour:** Voir concrètement ce qui se passe

---

### 9. **[DATA_STORAGE_VISUALIZATION.md](DATA_STORAGE_VISUALIZATION.md)** 🗺️ NEW!
**Destiné à:** Tous (comprendre l'architecture)  
**Contient:**
- Architecture complète avec diagrammes
- 3 zones: Frontend, Backend, Database
- Flux de données détaillé
- Tables PostgreSQL 
- Data flow diagram
- Checklist de localisation

**Utiliser pour:** Visualisation de l'infrastructure

---

## 🔧 Configuration

### Backend Environment (`.env.backend` at root or `api/.env`)
See: `api/.env.example`

Required variables:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - Token signing key
- `FRONTEND_URL` - Frontend domain
- OAuth credentials for each provider

### Frontend Environment (`.env` at root)
Already configured in `.env.example`

---

## 📊 Architecture Overview

```
┌─────────────────────┐
│  Frontend (React)   │
│  localhost:3000     │
└──────────┬──────────┘
           │ HTTP/CORS
           ↓
┌─────────────────────────────────────┐
│   Backend (Express/Node)            │
│   localhost:3001                    │
│                                     │
│  - Auth (email/password, Google)   │
│  - OAuth handlers (Strava, etc)    │
│  - Session management              │
│  - Connection endpoints            │
└──────────┬──────────────────────────┘
           │
        ┌──┴──────────────────────────────────┐
        │                                     │
        ↓                                     ↓
   ┌─────────────┐                  ┌──────────────────┐
   │  PostgreSQL │                  │ OAuth Providers  │
   │  (Neon)     │                  │ - Strava         │
   │             │                  │ - Garmin         │
   │ - users     │                  │ - Intervals      │
   │ - tokens    │                  │ - Wahoo          │
   │ - sessions  │                  └──────────────────┘
   │ - connections│
   └─────────────┘
```

---

## 🎯 Quick Navigation

### I want to...

**Deploy to production**
→ Read `DEPLOYMENT_CHECKLIST.md` then `BACKEND_DEPLOYMENT.md`

**Integrate frontend with backend**
→ Read `FRONTEND_INTEGRATION.md`

**Understand the architecture changes**
→ Read `BACKEND_CHANGES_SUMMARY.md`

**Start local development**
→ Read `api/README.md` then run `npm run dev`

**Fix an issue in production**
→ Check "Troubleshooting" in `BACKEND_DEPLOYMENT.md`

**Understand the database schema**
→ See section 2 in `BACKEND_DEPLOYMENT.md`

**See all API endpoints**
→ See section 3 in `BACKEND_DEPLOYMENT.md`

**Update OAuth provider settings**
→ See `DEPLOYMENT_CHECKLIST.md` Phase 1

**Understand where data is stored**
→ Read `DATA_STORAGE_GUIDE.md` or `DATA_STORAGE_VISUALIZATION.md`

**See a complete real example**
→ Read `DATA_EXAMPLES.md` (Jean's signup + Strava connection)

**Understand the data flow**
→ See "Flux Complét" section in `DATA_EXAMPLES.md`

---

## 🔒 Data Storage & Security

All data storage is documented in three files:

- **[DATA_STORAGE_GUIDE.md](DATA_STORAGE_GUIDE.md)** - Where & how data is stored
- **[DATA_EXAMPLES.md](DATA_EXAMPLES.md)** - Real example with actual data
- **[DATA_STORAGE_VISUALIZATION.md](DATA_STORAGE_VISUALIZATION.md)** - Architecture & diagrams

### Storage Summary

```
Frontend (Browser)     → JWT token + userId in localStorage
Backend (Server Mem)   → Environment variables (no data retention)
PostgreSQL (Neon)      → All persistent data
  ├─ users table              (passwords hashed)
  ├─ oauth_tokens table       (access tokens encrypted)
  ├─ oauth_sessions table     (15 min auto-expire)
  ├─ app_connections table    (UI cache)
  └─ athlete_data table       (optional cache)
```

---

## 🔐 Data Storage & Security

### ✅ What Changed
- Secure OAuth state validation (was: passing userId unsafely)
- Server-side token storage (was: exposed to browser)
- CSRF protection via temporary sessions
- Per-user token isolation
- Session auto-expiration (15 min)

### ✅ What's Protected
- JWT-based authentication (30-day tokens)
- CORS limited to FRONTEND_URL
- OAuth callbacks validated
- Database tokens encrypted in production

### 🔜 Future Improvements
- Token encryption at rest
- 2FA support
- Audit logging
- Rate limiting
- Team/role management

---

## 📞 Support

### For questions about...

**Backend Architecture** → See `BACKEND_DEPLOYMENT.md` or `BACKEND_CHANGES_SUMMARY.md`

**Frontend Integration** → See `FRONTEND_INTEGRATION.md`

**Deployment** → See `DEPLOYMENT_CHECKLIST.md`

**Local Development** → See `api/README.md`

**Environment Variables** → See `api/.env.example`

---

## 🚀 Deployment Timeline

- **Phase 1:** Infrastructure setup (1-2 hours)
  - Neon PostgreSQL
  - OAuth provider registration

- **Phase 2:** Configuration (30 min)
  - Environment variables
  - OAuth credentials

- **Phase 3:** Deployment (15-30 min)
  - Deploy backend
  - Deploy frontend

- **Phase 4:** Testing (30 min)
  - OAuth flows
  - Database verification

- **Phase 5:** Optimization (1-2 hours, optional)
  - Security hardening
  - Monitoring setup
  - Performance tuning

**Total: 4-6 hours for production deployment**

---

## 📋 Files Structure

```
coach-center/
├── BACKEND_DEPLOYMENT.md        # ⭐ Architecture & deployment guide
├── BACKEND_CHANGES_SUMMARY.md   # Changes overview
├── FRONTEND_INTEGRATION.md      # Frontend developer guide
├── DEPLOYMENT_CHECKLIST.md      # Step-by-step deployment
├── README.md                    # (existing project readme)
├── .env.example                 # Frontend env template
│
├── api/
│   ├── README.md               # Backend local setup
│   ├── .env.example            # Backend env template
│   ├── index.js                # Main Express app
│   ├── auth.js                 # Auth logic
│   ├── db.js                   # Database setup
│   ├── oauth-handlers.js       # OAuth provider handlers
│   ├── oauth-sessions.js       # Session management (NEW)
│   ├── package.json
│   └── package-lock.json
│
├── src/
│   ├── App.js
│   ├── components/
│   ├── services/
│   └── styles/
└── ... (other files)
```

---

## ✨ Key Features

- ✅ Individual user accounts (email/password + Google OAuth)
- ✅ OAuth connections to Strava, Garmin, Intervals.icu, Wahoo
- ✅ Per-user token management
- ✅ CSRF protection for OAuth flows
- ✅ Secure JWT-based sessions
- ✅ Server-side token storage
- ✅ Automatic session cleanup
- ✅ Connection status display

---

## 🤝 Contributing

When making changes:

1. Update relevant `.md` documentation
2. Follow security practices (no exposed tokens)
3. Test locally with `npm run dev`
4. Deploy via provided checklist
5. Update BACKEND_CHANGES_SUMMARY.md

---

**Last Updated:** April 2026 - Architecture Reorganization v1.0
