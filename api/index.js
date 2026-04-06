const express = require('express');
const cors = require('cors');
require('dotenv').config();

const {
    generateToken,
    authMiddleware,
    registerUser,
    loginUser,
    getUserById,
} = require('./auth');

const {
    handleIntervalsCallback,
    handleStravaCallback,
    handleGarminCallback,
    handleWahooCallback,
    getOAuthToken,
} = require('./oauth-handlers');

const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Authentication endpoints ─────────────────────────────────────────────

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const userId = await registerUser(email, password, name || email.split('@')[0]);
        const token = generateToken(userId);

        res.json({ userId, token, message: 'Registration successful' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await loginUser(email, password);
        const token = generateToken(user.id);

        res.json({ userId: user.id, token, message: 'Login successful' });
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await getUserById(req.userId);
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── OAuth callback endpoints ─────────────────────────────────────────────

// Intervals.icu callback
app.get('/api/auth/intervals/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code) return res.status(400).json({ error: 'No code provided' });

        // Decode state to get userId (in production, use proper state param)
        const userId = state || req.query.userId;
        if (!userId) return res.status(400).json({ error: 'No userId provided' });

        await handleIntervalsCallback(code, userId);

        // Redirect back to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}?provider=intervals&success=true`);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Strava callback
app.get('/api/auth/strava/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code) return res.status(400).json({ error: 'No code provided' });

        const userId = state || req.query.userId;
        if (!userId) return res.status(400).json({ error: 'No userId provided' });

        await handleStravaCallback(code, userId);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}?provider=strava&success=true`);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Garmin callback
app.get('/api/auth/garmin/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code) return res.status(400).json({ error: 'No code provided' });

        const userId = state || req.query.userId;
        if (!userId) return res.status(400).json({ error: 'No userId provided' });

        await handleGarminCallback(code, userId);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}?provider=garmin&success=true`);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Wahoo callback
app.get('/api/auth/wahoo/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code) return res.status(400).json({ error: 'No code provided' });

        const userId = state || req.query.userId;
        if (!userId) return res.status(400).json({ error: 'No userId provided' });

        await handleWahooCallback(code, userId);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}?provider=wahoo&success=true`);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─── Data endpoints ───────────────────────────────────────────────────────

// Get OAuth connections status
app.get('/api/connections', authMiddleware, async (req, res) => {
    try {
        const providers = ['intervals', 'strava', 'garmin', 'wahoo'];
        const connections = {};

        for (const provider of providers) {
            const token = await getOAuthToken(req.userId, provider);
            connections[provider] = !!token;
        }

        res.json(connections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Start server ─────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`\\n  🚀 Coach Center API running on port ${PORT}`);
    console.log(`  📍 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`  🔐 JWT expires in: ${process.env.JWT_EXPIRE || '7d'}\\n`);
});

module.exports = app;
