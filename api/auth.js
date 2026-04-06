const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { run, get } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

// Middleware: verify JWT
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.userId = decoded.userId;
  next();
};

// Register new user
const registerUser = async (email, password, name) => {
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  
  await run(
    `INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)`,
    [id, email, passwordHash, name]
  );
  
  return id;
};

// Login user
const loginUser = async (email, password) => {
  const user = await get(
    `SELECT * FROM users WHERE email = ?`,
    [email]
  );
  
  if (!user) throw new Error('User not found');
  if (!user.password_hash) throw new Error('No password set');
  
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new Error('Invalid password');
  
  return user;
};

// Get user by ID
const getUserById = async (userId) => {
  return get(
    `SELECT id, email, name, created_at FROM users WHERE id = ?`,
    [userId]
  );
};

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  registerUser,
  loginUser,
  getUserById,
};
