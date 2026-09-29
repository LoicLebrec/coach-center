const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { GarminConnect } = require('garmin-connect');

// Unofficial — Garmin has no personal-use public API. This drives the same
// session-based login the Garmin Connect web app uses (see garmin-connect npm
// package, itself modeled on github.com/matin/garth). Can break if Garmin
// changes their login flow; no SLA.

const login = async (email, password) => {
  const client = new GarminConnect({ username: email, password });
  await client.login();
  return client;
};

// Activities newer than `sinceMs` (epoch millis), oldest first.
const listRecentActivities = async (client, sinceMs, limit = 50) => {
  const activities = await client.getActivities(0, limit);
  return activities
    .filter(a => new Date(a.startTimeGMT + 'Z').getTime() > sinceMs)
    .sort((a, b) => new Date(a.startTimeGMT) - new Date(b.startTimeGMT));
};

// Downloads the activity's original file (FIT preferred) to a temp path. Returns the file path.
const downloadActivityFile = async (client, activity, format = 'fit') => {
  const dir = path.join(os.tmpdir(), `garmin-${randomUUID()}`);
  await client.downloadOriginalActivityData(activity, dir, format);
  return path.join(dir, `${activity.activityId}.${format}`);
};

// Uploads a FIT/TCX/GPX file as a new Garmin activity.
const uploadActivityFile = async (client, filePath, format = 'fit') => {
  const result = await client.uploadActivity(filePath, format);
  return result;
};

const cleanupFile = (filePath) => {
  try {
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  } catch { /* best effort */ }
};

module.exports = { login, listRecentActivities, downloadActivityFile, uploadActivityFile, cleanupFile };
