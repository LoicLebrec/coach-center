const crypto = require('crypto');

// Garmin/Coros have no token-based API for personal accounts, so we store the
// raw account password (encrypted at rest) to re-login on every sync run.
// Key is derived from CREDENTIALS_ENC_KEY (or JWT_SECRET as a fallback so this
// works without extra env setup) via SHA-256 to always get 32 bytes for AES-256.
const SECRET = process.env.CREDENTIALS_ENC_KEY || process.env.JWT_SECRET || 'dev-secret-change-in-production';
const KEY = crypto.createHash('sha256').update(SECRET).digest();

const encrypt = (plainText) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map(b => b.toString('base64')).join('.');
};

const decrypt = (payload) => {
  const [ivB64, authTagB64, encryptedB64] = payload.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

module.exports = { encrypt, decrypt };
