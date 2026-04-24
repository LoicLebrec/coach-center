# 🚀 Checklist de Déploiement Production

## Phase 1: Préparation (1-2 heures)

### Infrastructure

- [ ] **Database**
  - [ ] Créer compte Neon PostgreSQL (free tier: https://neon.tech)
  - [ ] Copier `DATABASE_URL`
  - [ ] Tester la connexion: `psql $DATABASE_URL -c "SELECT 1"`

- [ ] **Secrets Management**
  - [ ] Générer JWT_SECRET: `openssl rand -base64 32`
  - [ ] Stocker dans gestionnaire de secrets (GitHub, Vercel, etc.)

### OAuth Providers Setup

Pour chaque provider, créer une app OAuth:

#### Google
- [ ] https://console.cloud.google.com/
- [ ] Créer nouveau projet
- [ ] Enable Google+ API
- [ ] OAuth 2.0 Credentials → Create app
- [ ] Authorized redirect: `https://your-domain.com/api/auth/google/callback`
- [ ] Copier Client ID et Secret

#### Strava
- [ ] https://www.strava.com/settings/api
- [ ] Create app
- [ ] Authorization callback domain: `your-domain.com`
- [ ] Copier Client ID et Secret

#### Intervals.icu
- [ ] https://intervals.icu/
- [ ] Settings → Developer → Create OAuth app
- [ ] Callback URL: `https://your-domain.com/api/auth/intervals/callback`
- [ ] Copier credentials

#### Garmin (optionnel - via Intervals.icu)
- [ ] Laisser vide initialement
- [ ] Users connectent Garmin via Intervals.icu

#### Wahoo
- [ ] https://developer.wahooligan.com/
- [ ] Create app
- [ ] Callback: `https://your-domain.com/api/auth/wahoo/callback`
- [ ] Copier credentials

## Phase 2: Configuration Backend (30 min)

### Environment Variables

Dans votre plateforme de déploiement (Vercel, Railway, etc.):

```bash
# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=<generated-secret>
JWT_EXPIRE=30d

# Frontend
FRONTEND_URL=https://your-domain.com

# Google
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Strava
STRAVA_CLIENT_ID=xxx
STRAVA_CLIENT_SECRET=xxx

# Intervals.icu
INTERVALS_CLIENT_ID=xxx
INTERVALS_CLIENT_SECRET=xxx
INTERVALS_CALLBACK_URL=https://your-domain.com/api/auth/intervals/callback

# Wahoo
WAHOO_CLIENT_ID=xxx
WAHOO_CLIENT_SECRET=xxx
WAHOO_CALLBACK_URL=https://your-domain.com/api/auth/wahoo/callback

# Optional
NODE_ENV=production
PORT=3001
```

### Frontend Configuration

- [ ] Mettre à jour `REACT_APP_API_URL=https://your-domain.com/api` dans `.env`
- [ ] Rebuild frontend: `npm run build`

## Phase 3: Déploiement (15-30 min)

### Option A: Vercel (Recommended)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy backend
cd api
vercel deploy --prod

# 3. Deploy frontend
cd ..
vercel deploy --prod

# 4. Verify
curl https://your-api-domain.vercel.app/api/health
```

### Option B: Railway / Render / Heroku

```bash
# 1. Connect your Git repo
# 2. Set environment variables
# 3. Deploy
git push heroku main
```

## Phase 4: Post-Deployment Testing (30 min)

### Basic Health Checks

```bash
# Health endpoint
curl https://your-backend-domain.vercel.app/api/health

# Register test user
curl -X POST https://your-backend-domain.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "name": "Test User"
  }'

# Should return:
# {
#   "userId": "uuid",
#   "token": "jwt-token"
# }
```

### OAuth Flow Testing

- [ ] Test Google OAuth login
- [ ] Test Strava connection
- [ ] Test Intervals.icu connection
- [ ] Test Wahoo connection
- [ ] Verify tokens stored in database

### Database Verification

```bash
# Connect to your Neon database
psql $DATABASE_URL

# Check tables created
\dt

# Look for: users, oauth_tokens, oauth_sessions, app_connections

# Check test user
SELECT id, email, name FROM users WHERE email = 'test@example.com';
```

## Phase 5: Production Optimization (Optional)

### Security Hardening

- [ ] Enable HTTPS (automatic with Vercel/Railway)
- [ ] Set up CORS whitelist (frontend domain only)
- [ ] Add rate limiting (via middleware)
- [ ] Configure security headers (helmet)
- [ ] Set up monitoring/logging

```javascript
// In api/index.js production
if (process.env.NODE_ENV === 'production') {
  const helmet = require('helmet');
  const rateLimit = require('express-rate-limit');
  
  app.use(helmet());
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
}
```

### Monitoring

- [ ] Set up error tracking (Sentry, LogRocket)
- [ ] Monitor database performance
- [ ] Set up alerts for failed OAuth attempts
- [ ] Monitor rate limits / blocked requests

### Database Maintenance

- [ ] Set up automated backups (Neon does this automatically)
- [ ] Monitor connection pool usage
- [ ] Schedule cleanup of expired sessions

```javascript
// In api/index.js - cleanup job
const { cleanExpiredSessions } = require('./oauth-sessions');
setInterval(cleanExpiredSessions, 3600000); // 1 hour
```

## Phase 6: Documentation & Handoff (30 min)

- [ ] Document all environment variables used
- [ ] Document provider callback URLs
- [ ] Add to team wiki/documentation
- [ ] Create runbook for common issues
- [ ] Share database credentials securely

## Rollback Plan

If something goes wrong:

1. **Database**: Neon has automatic backups, can restore
2. **Backend**: Vercel keeps previous deployments, can revert
3. **Frontend**: Same as backend
4. **OAuth Keys**: Keep old ones until confirmed working

## Post-Deployment Monitoring

### First 24 Hours

- [ ] Monitor error logs
- [ ] Test user registrations
- [ ] Test OAuth flows
- [ ] Check database connections
- [ ] Monitor API response times

### First Week

- [ ] Watch for edge cases / bugs
- [ ] Monitor failed login attempts
- [ ] Collect user feedback
- [ ] Make minor adjustments if needed

### Ongoing

- [ ] Weekly: Check logs for errors
- [ ] Monthly: Review database size
- [ ] Quarterly: Security audit
- [ ] Yearly: Performance optimization

## Common Issues & Fixes

### "Database connection timed out"
```bash
# Check DATABASE_URL in environment
# Verify Neon connection string includes ?sslmode=require
# Restart application
```

### "OAuth redirect URI mismatch"
```bash
# Verify in each provider's console:
# Google, Strava, Intervals, Wahoo
# Must exactly match: https://your-domain.com/api/auth/:provider/callback
```

### "JWT token invalid"
```bash
# Check JWT_SECRET hasn't changed
# Regenerate with: openssl rand -base64 32
# Update in environment
```

### "SSL certificate error"
```bash
# Vercel handles this automatically
# For other platforms: use Let's Encrypt (free)
# Re-check DATABASE_URL sslmode setting
```

## Contact & Support

- **Backend Issues**: Check `BACKEND_DEPLOYMENT.md`
- **Frontend Issues**: Check `FRONTEND_INTEGRATION.md`
- **Database Issues**: Neon support documentation
- **OAuth Issues**: Individual provider support pages

---

**Estimated Total Time:** 4-6 hours for first deployment

**Next Phase:** Monitor, optimize, add features (team management, etc.)
