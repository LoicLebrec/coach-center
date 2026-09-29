const { randomUUID } = require('crypto');
const { run, get, all } = require('../db');
const { encrypt, decrypt } = require('../crypto');

const PROVIDERS = ['garmin', 'coros'];

const saveCredentials = (userId, provider, email, password) =>
  run(
    `INSERT INTO device_credentials (id, user_id, provider, email, enc_password)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       email = EXCLUDED.email,
       enc_password = EXCLUDED.enc_password,
       last_sync_status = NULL,
       last_sync_error = NULL,
       updated_at = NOW()`,
    [randomUUID(), userId, provider, email, encrypt(password)]
  );

const deleteCredentials = (userId, provider) =>
  run('DELETE FROM device_credentials WHERE user_id = ? AND provider = ?', [userId, provider]);

const getCredential = async (userId, provider) => {
  const row = await get('SELECT * FROM device_credentials WHERE user_id = ? AND provider = ?', [userId, provider]);
  if (!row) return null;
  return { ...row, password: decrypt(row.enc_password) };
};

const getCredentialsForUser = async (userId) => {
  const result = {};
  for (const provider of PROVIDERS) {
    result[provider] = await getCredential(userId, provider);
  }
  return result;
};

const getAllUserIdsWithCredentials = async () => {
  const rows = await all('SELECT DISTINCT user_id FROM device_credentials', []);
  return rows.map(r => r.user_id);
};

const updateSyncStatus = (userId, provider, status, error = null) =>
  run(
    `UPDATE device_credentials SET last_sync_at = NOW(), last_sync_status = ?, last_sync_error = ?
     WHERE user_id = ? AND provider = ?`,
    [status, error, userId, provider]
  );

const getStatusForUser = async (userId) => {
  const result = {};
  for (const provider of PROVIDERS) {
    const row = await get(
      `SELECT email, last_sync_at, last_sync_status, last_sync_error FROM device_credentials
       WHERE user_id = ? AND provider = ?`,
      [userId, provider]
    );
    result[provider] = row
      ? { configured: true, email: row.email, lastSyncAt: row.last_sync_at, lastSyncStatus: row.last_sync_status, lastSyncError: row.last_sync_error }
      : { configured: false };
  }
  return result;
};

const wasAlreadySynced = async (userId, sourceProvider, sourceActivityId, targetProvider) => {
  const row = await get(
    `SELECT id FROM synced_activities
     WHERE user_id = ? AND source_provider = ? AND source_activity_id = ? AND target_provider = ?`,
    [userId, sourceProvider, sourceActivityId, targetProvider]
  );
  return !!row;
};

const recordSyncResult = (userId, sourceProvider, sourceActivityId, targetProvider, status, targetActivityId = null, error = null) =>
  run(
    `INSERT INTO synced_activities (id, user_id, source_provider, source_activity_id, target_provider, target_activity_id, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, source_provider, source_activity_id, target_provider) DO UPDATE SET
       status = EXCLUDED.status, target_activity_id = EXCLUDED.target_activity_id, error = EXCLUDED.error`,
    [randomUUID(), userId, sourceProvider, sourceActivityId, targetProvider, targetActivityId, status, error]
  );

const getRecentSyncLog = (userId, limit = 20) =>
  all(
    `SELECT source_provider, source_activity_id, target_provider, status, error, created_at
     FROM synced_activities WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit]
  );

module.exports = {
  PROVIDERS,
  saveCredentials,
  deleteCredentials,
  getCredential,
  getCredentialsForUser,
  getAllUserIdsWithCredentials,
  updateSyncStatus,
  getStatusForUser,
  wasAlreadySynced,
  recordSyncResult,
  getRecentSyncLog,
};
