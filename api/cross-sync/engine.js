const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const garminClient = require('./garmin-client');
const corosClient = require('./coros-client');
const store = require('./store');

const EPOCH_START = 0;

// Push every Garmin activity not yet seen on Coros. Coros upload is unconfirmed
// (see coros-client.js), so this records 'unsupported' rather than failing the run.
const pushGarminToCoros = async (userId, gSession, cSession, sinceMs) => {
  const activities = await garminClient.listRecentActivities(gSession, sinceMs);
  for (const activity of activities) {
    const sourceId = String(activity.activityId);
    if (await store.wasAlreadySynced(userId, 'garmin', sourceId, 'coros')) continue;

    let filePath = null;
    try {
      filePath = await garminClient.downloadActivityFile(gSession, activity, 'fit');
      const buffer = fs.readFileSync(filePath);
      await corosClient.uploadActivityFile(cSession, buffer, 'fit');
      await store.recordSyncResult(userId, 'garmin', sourceId, 'coros', 'ok');
    } catch (err) {
      const status = err.code === 'COROS_UPLOAD_UNSUPPORTED' ? 'unsupported' : 'error';
      await store.recordSyncResult(userId, 'garmin', sourceId, 'coros', status, null, err.message);
    } finally {
      if (filePath) garminClient.cleanupFile(filePath);
    }
  }
  return activities.length;
};

const pushCorosToGarmin = async (userId, cSession, gSession, sinceMs) => {
  const activities = await corosClient.listRecentActivities(cSession, sinceMs);
  for (const activity of activities) {
    const sourceId = activity.labelId;
    if (await store.wasAlreadySynced(userId, 'coros', sourceId, 'garmin')) continue;

    let tmpFile = null;
    try {
      const buffer = await corosClient.downloadActivityFile(cSession, activity, 'fit');
      tmpFile = path.join(os.tmpdir(), `coros-${randomUUID()}.fit`);
      fs.writeFileSync(tmpFile, buffer);
      await garminClient.uploadActivityFile(gSession, tmpFile, 'fit');
      await store.recordSyncResult(userId, 'coros', sourceId, 'garmin', 'ok');
    } catch (err) {
      await store.recordSyncResult(userId, 'coros', sourceId, 'garmin', 'error', null, err.message);
    } finally {
      if (tmpFile) fs.rmSync(tmpFile, { force: true });
    }
  }
  return activities.length;
};

// Syncs one user's Garmin <-> Coros activities. Requires both providers configured.
const syncUser = async (userId) => {
  const creds = await store.getCredentialsForUser(userId);
  const { garmin, coros } = creds;

  if (!garmin || !coros) {
    return { skipped: true, reason: 'Connectez Garmin ET Coros pour activer la synchronisation croisée.' };
  }

  let gSession, cSession;
  try {
    gSession = await garminClient.login(garmin.email, garmin.password);
  } catch (err) {
    await store.updateSyncStatus(userId, 'garmin', 'error', `Login Garmin échoué : ${err.message}`);
    return { error: `Garmin login failed: ${err.message}` };
  }

  try {
    cSession = await corosClient.login(coros.email, coros.password);
  } catch (err) {
    await store.updateSyncStatus(userId, 'coros', 'error', `Login Coros échoué : ${err.message}`);
    return { error: `Coros login failed: ${err.message}` };
  }

  const garminSinceMs = garmin.last_sync_at ? new Date(garmin.last_sync_at).getTime() : EPOCH_START;
  const corosSinceMs = coros.last_sync_at ? new Date(coros.last_sync_at).getTime() : EPOCH_START;

  const garminPushed = await pushGarminToCoros(userId, gSession, cSession, garminSinceMs);
  const corosPushed = await pushCorosToGarmin(userId, cSession, gSession, corosSinceMs);

  await store.updateSyncStatus(userId, 'garmin', 'ok', null);
  await store.updateSyncStatus(userId, 'coros', 'ok', null);

  return { garminActivitiesSeen: garminPushed, corosActivitiesSeen: corosPushed };
};

const syncAllUsers = async () => {
  const userIds = await store.getAllUserIdsWithCredentials();
  const results = {};
  for (const userId of userIds) {
    try {
      results[userId] = await syncUser(userId);
    } catch (err) {
      results[userId] = { error: err.message };
    }
  }
  return results;
};

module.exports = { syncUser, syncAllUsers };
