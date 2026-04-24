const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { run, get } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRE  = process.env.JWT_EXPIRE  || '30d';

// ── JWT ───────────────────────────────────────────────────────────────────────

const generateToken = (userId) =>
  jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });

const verifyToken = (token) => {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
};

// ── Middleware ────────────────────────────────────────────────────────────────

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });
  req.userId = decoded.userId;
  next();
};

// ── Email / password ──────────────────────────────────────────────────────────

const registerUser = async (email, password, name) => {
  const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw new Error('Email already registered');

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  await run(
    'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
    [id, email, passwordHash, name || email.split('@')[0]]
  );
  return id;
};

const loginUser = async (email, password) => {
  const user = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) throw new Error('Email ou mot de passe incorrect');
  if (!user.password_hash) throw new Error('Ce compte utilise la connexion Google — cliquez "Continuer avec Google"');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Email ou mot de passe incorrect');
  return user;
};

const getUserById = async (id) => {
  const user = await get('SELECT id, email, name, avatar_url, club_id, created_at FROM users WHERE id = ?', [id]);
  if (!user) throw new Error('User not found');
  return user;
};

// ── Google OAuth ──────────────────────────────────────────────────────────────

/**
 * Find or create a user from a Google profile.
 * Priority: match by google_id → match by email (and link) → create new user.
 */
const findOrCreateGoogleUser = async ({ googleId, email, name, avatarUrl }) => {
  // 1. Already linked to Google
  let user = await get('SELECT * FROM users WHERE google_id = ?', [googleId]);
  if (user) {
    // Keep avatar fresh
    await run('UPDATE users SET avatar_url = ?, updated_at = NOW() WHERE id = ?', [avatarUrl, user.id]);
    return user;
  }

  // 2. Account exists with same email → link it
  user = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (user) {
    await run(
      'UPDATE users SET google_id = ?, avatar_url = ?, updated_at = NOW() WHERE id = ?',
      [googleId, avatarUrl, user.id]
    );
    return { ...user, google_id: googleId, avatar_url: avatarUrl };
  }

  // 3. New user
  const id = randomUUID();
  await run(
    'INSERT INTO users (id, email, name, google_id, avatar_url) VALUES (?, ?, ?, ?, ?)',
    [id, email, name, googleId, avatarUrl]
  );
  return { id, email, name, google_id: googleId, avatar_url: avatarUrl };
};

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  registerUser,
  loginUser,
  getUserById,
  findOrCreateGoogleUser,
};
