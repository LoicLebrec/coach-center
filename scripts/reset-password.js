#!/usr/bin/env node
// Sets a new password for an existing account (no email flow exists).
// Usage: node scripts/reset-password.js <email> <new-password>
// Works for Google-created accounts too: they gain a password login.
const path = require('path');
require(path.join(__dirname, '../api/node_modules/dotenv')).config({ path: path.join(__dirname, '../api/.env') });
const bcrypt = require(path.join(__dirname, '../api/node_modules/bcryptjs'));
const { pool, get, run } = require('../api/db');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node scripts/reset-password.js <email> <new-password>');
    process.exit(1);
  }
  const user = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (!user) {
    console.error(`No account for ${email} — register it from the login page instead.`);
    process.exit(1);
  }
  await run('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [await bcrypt.hash(password, 10), user.id]);
  console.log(`Password updated for ${email}.`);
  await pool.end();
  process.exit(0);
})().catch((err) => { console.error(err.message); process.exit(1); });
