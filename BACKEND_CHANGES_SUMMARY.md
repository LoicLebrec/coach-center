# Backend Reorganization - Summary of Changes

## ✅ Completed: Account & Connection System Restructuring

### Problem Statement
- Need to organize backend for production deployment
- Priority: Individual user accounts + app connections (not API keys)
- Must securely integrate with Strava, Garmin, Wahoo, Intervals.icu

---

## Architecture Changes

### 1. Database Schema Enhancements ✅

**New Tables Added:**

#### `oauth_sessions` (CSRF Protection)
- Temporary state tokens for OAuth flows
- Auto-expire after 15 minutes
- Validated on callback before processing

#### `app_connections` (UI Cache)
- Display-friendly connection metadata
- Track athlete ID and display name
- Support for quick connection status checks

### 2. Authentication Module Updates ✅

**File:** `api/auth.js` (unchanged - working well)
- Email/password registration & login ✓
- Google OAuth integration ✓
- User profiles stored in `users` table ✓

### 3. New Module: OAuth Sessions ✅

**File:** `api/oauth-sessions.js` (NEW)
```javascript
// Manages temporary OAuth state for security
- createOAuthSession(userId, provider) → state token
- validateOAuthSession(state, provider) → userId
- cleanExpiredSessions() → cleanup job
```

### 4. OAuth Handlers Refactored ✅

**File:** `api/oauth-handlers.js` (MAJOR CHANGES)

**What Changed:**
- Each handler now takes `(code, state)` instead of `(code, userId)`
- `state` parameter validated against secure `oauth_sessions` table
- Only valid sessions can process OAuth callbacks
- Added `upsertConnection()` to store connection metadata

**New Security Pattern:**
```javascript
const handleStravaCallback = async (code, state) => {
  // Validate state first (throws if invalid/expired)
  const session = await validateOAuthSession(state, 'strava');
  const userId = session.user_id;  // Now we know real user
  
  // Continue with token exchange...
}
```

### 5. Express API Reorganized ✅

**File:** `api/index.js` (MAJOR CHANGES)

**New Endpoints Added:**

1. **POST `/api/providers/:provider/start`** (Protected)
   - User initiates OAuth connection
   - Backend generates secure state token
   - Returns OAuth URL for frontend to redirect to
   - Usage:
     ```javascript
     POST /api/providers/strava/start
     Authorization: Bearer {jwt}
     Response: { authUrl: "https://..." }
     ```

2. **GET `/api/connections/:provider`** (Protected)
   - Get details about specific provider connection
   - Returns: athleteId, expiresAt, connectedSince

3. **DELETE `/api/connections/:provider`** (Protected)
   - Disconnect a provider
   - Marks connection as inactive

**Improved Endpoints:**

- **GET `/api/connections`** - Enhanced documentation
- **OAuth callbacks** - Now validate `state` properly

---

## Security Improvements

### 🔒 CSRF Protection
- ❌ **Before:** `state` parameter contained userId (INSECURE)
- ✅ **After:** `state` is random UUID, validated against `oauth_sessions` table

### 🔐 Server-Side Token Storage
- ❌ **Before:** OAuth tokens sent to frontend (RISKY)
- ✅ **After:** Tokens stored server-side, never exposed to browser

### 📋 Per-User Isolation
- ❌ **Before:** Unclear token ownership
- ✅ **After:** Each token scoped to single user via `user_id` FK

### ⏱️ Session Expiration
- ❌ **Before:** No session cleanup
- ✅ **After:** OAuth sessions auto-expire after 15 minutes

---

## Migration Path (Frontend)

### Old Flow (Insecure) ❌
```javascript
// Step 1: Embed userId in URL as "state"
window.location.href = 
  `${STRAVA_AUTH}?client_id=...&state=${userId}`;

// Step 2: On callback, read userId from state
const userId = getUrlParam('state');  // WRONG!
```

### New Flow (Secure) ✅
```javascript
// Step 1: Request session from backend
const res = await fetch('/api/providers/strava/start', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { authUrl } = await res.json();

// Step 2: Redirect to auth URL (state is handled server-side)
window.location.href = authUrl;

// Step 3: Backend validates state on callback
// Frontend detects callback and refreshes
```

---

## Files Modified

### **Backend:**
| File | Change | Status |
|------|--------|--------|
| `api/db.js` | Added `oauth_sessions` & `app_connections` tables | ✅ Done |
| `api/oauth-sessions.js` | NEW module for session management | ✅ Created |
| `api/oauth-handlers.js` | Refactored all handlers to use state | ✅ Updated |
| `api/index.js` | Added `/api/providers/:provider/start` endpoint | ✅ Updated |
| | Enhanced connection management endpoints | ✅ Updated |

### **Documentation:**
| File | Purpose |
|------|---------|
| `BACKEND_DEPLOYMENT.md` | Complete deployment guide + checklist |
| `FRONTEND_INTEGRATION.md` | Frontend developers guide + code samples |
| `api/.env.example` | Backend environment variables template |

---

## Database Migration Steps

### For Production Deployment:

1. **If database already exists:**
   ```bash
   # Run the new CREATE TABLE statements from db.js
   # Tables created with IF NOT EXISTS, so safe to run multiple times
   ```

2. **If starting fresh:**
   ```javascript
   npm run dev
   // Tables auto-created on startup
   ```

---

## Environment Variables Required

See `BACKEND_DEPLOYMENT.md` section "Pre-requisites" for complete list.

**Critical ones:**
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - For token signing
- `FRONTEND_URL` - For CORS and OAuth redirects
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`
- `GARMIN_CLIENT_ID` / `GARMIN_CLIENT_SECRET`
- `INTERVALS_CLIENT_ID` / `INTERVALS_CLIENT_SECRET`
- `WAHOO_CLIENT_ID` / `WAHOO_CLIENT_SECRET`

---

## Testing Checklist

- [ ] Email/password registration works
- [ ] Email/password login works
- [ ] Google OAuth login works
- [ ] POST `/api/providers/strava/start` returns authUrl
- [ ] OAuth callbacks properly validate state
- [ ] GET `/api/connections` shows connected providers
- [ ] DELETE `/api/connections/:provider` disconnects provider
- [ ] Tokens properly stored in database
- [ ] Sessions expire after 15 minutes
- [ ] Multiple users can't see each other's connections

---

## What's NOT Included (Future Work)

- 🔜 **Token Encryption** - Store tokens encrypted at rest
- 🔜 **Token Refresh** - Auto-refresh tokens before expiry
- 🔜 **Rate Limiting** - Prevent brute force attacks
- 🔜 **Audit Logs** - Track OAuth connection events
- 🔜 **2FA** - Two-factor authentication
- 🔜 **Team Management** - User roles & permissions
- 🔜 **Password Reset** - Email-based password recovery

---

## Deployment Checklist Summary

1. ✅ Database schema updated
2. ✅ OAuth security hardened
3. ✅ Per-user token isolation
4. ✅ Session CSRF protection
5. ⏳ Deploy to production server
6. ⏳ Configure OAuth provider callbacks
7. ⏳ Test end-to-end flow
8. ⏳ Monitor for errors

---

## Quick Start

**For Developers:**
1. Read `BACKEND_DEPLOYMENT.md` for architecture overview
2. Read `FRONTEND_INTEGRATION.md` for usage examples
3. Set up `.env` using `api/.env.example` template
4. Run `npm install && npm run dev` in `api/` directory
5. Test endpoints with provided curl examples

**For DevOps:**
1. Provision PostgreSQL database (Neon recommended)
2. Generate JWT_SECRET
3. Register OAuth apps with all providers
4. Update callback URIs to production domain
5. Set environment variables
6. Deploy backend to production

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React)                       │
│  - Shows connection status                              │
│  - Redirects to OAuth URLs                              │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│                  Backend (Express)                       │
│                                                          │
│  ┌─ POST /api/providers/:provider/start                 │
│  │  → Validates JWT                                     │
│  │  → Creates oauth_session                             │
│  │  → Returns authUrl with state                        │
│  │                                                      │
│  ├─ GET /api/auth/:provider/callback                    │
│  │  → Receives (code, state)                           │
│  │  → Validates state against oauth_sessions           │
│  │  → Exchanges code for token                          │
│  │  → Stores in oauth_tokens table                      │
│  │                                                      │
│  └─ GET/DELETE /api/connections/:provider              │
│     → Manage user's provider connections                │
│                                                          │
└──────────────────────────────────────────────────────────┘
              ↓                    ↓
    ┌─────────────────┐  ┌─────────────────┐
    │   PostgreSQL    │  │ OAuth Providers │
    │                 │  │  (Strava, etc)  │
    │ - users         │  └─────────────────┘
    │ - oauth_tokens  │
    │ - oauth_sessions│
    │ - connections   │
    └─────────────────┘
```

---

## Questions & Support

For implementation questions, refer to:
- Backend setup: `BACKEND_DEPLOYMENT.md`
- Frontend usage: `FRONTEND_INTEGRATION.md`
- Code examples: See `.md` files + inline code comments
- Environment variables: `api/.env.example`
