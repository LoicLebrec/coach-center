const { randomUUID } = require('crypto');
const { run, get } = require('./db');

/**
 * OAuth Sessions Management
 * 
 * Temporary OAuth state tracking for security:
 * 1. Generate a secure state token before redirecting user
 * 2. Validate state token on callback before processing
 * 3. Auto-expire after 15 minutes for security
 */

const createOAuthSession = async (userId, provider) => {
    const state = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

    await run(
        `INSERT INTO oauth_sessions (state, user_id, provider, expires_at)
     VALUES (?, ?, ?, ?)`,
        [state, userId, provider, expiresAt]
    );

    return state;
};

const validateOAuthSession = async (state, provider) => {
    const session = await get(
        `SELECT * FROM oauth_sessions 
     WHERE state = ? AND provider = ? AND expires_at > NOW()`,
        [state, provider]
    );

    if (!session) {
        throw new Error('Invalid or expired OAuth session. Please try again.');
    }

    // Clean up after validation
    await run(
        'DELETE FROM oauth_sessions WHERE state = ?',
        [state]
    );

    return session;
};

const cleanExpiredSessions = async () => {
    await run('DELETE FROM oauth_sessions WHERE expires_at < NOW()');
};

module.exports = {
    createOAuthSession,
    validateOAuthSession,
    cleanExpiredSessions,
};
