const axios = require('axios');
const crypto = require('crypto');

// Unofficial — Coros has no public API at all. Endpoints below are reverse
// engineered from the Coros Training Hub web app (https://t.coros.com), the
// same ones used by the open-source export tool github.com/xballoy/coros-api.
// Read endpoints (login/query/download) are confirmed working. There is NO
// confirmed endpoint for uploading/importing an activity into Coros — the web
// app supports manual FIT import at t.coros.com (Activity List → Import Data)
// but the underlying request hasn't been captured. See uploadActivityFile().

const REGION_HOSTS = {
  eu: 'https://teameuapi.coros.com',
  us: 'https://teamapi.coros.com',
  cn: 'https://teamcnapi.coros.com',
};

const FILE_TYPE = { fit: '4', tcx: '3', gpx: '1', kml: '2', csv: '0' };
const SPORT_TYPE_ALL = '0';

class CorosUploadUnsupportedError extends Error {
  constructor() {
    super(
      'Coros upload endpoint is not reverse-engineered yet. Manually import the FIT file at ' +
      't.coros.com (Activity List -> Import Data), capture the network request in DevTools, ' +
      'and wire it into coros-client.js uploadActivityFile().'
    );
    this.name = 'CorosUploadUnsupportedError';
    this.code = 'COROS_UPLOAD_UNSUPPORTED';
  }
}

const login = async (email, password, region = 'eu') => {
  const baseUrl = REGION_HOSTS[region] || REGION_HOSTS.eu;
  const pwd = crypto.createHash('md5').update(password).digest('hex');
  const { data } = await axios.post(`${baseUrl}/account/login`, {
    account: email,
    accountType: 2,
    pwd,
  });
  if (data.result !== '0000') throw new Error(`Coros login failed: ${data.message}`);
  return { baseUrl, accessToken: data.data.accessToken };
};

// Activities newer than `sinceMs` (epoch millis), oldest first.
const listRecentActivities = async (session, sinceMs, pageSize = 50) => {
  const { baseUrl, accessToken } = session;
  const { data } = await axios.get(`${baseUrl}/activity/query`, {
    params: { size: pageSize, pageNumber: 1, modeList: SPORT_TYPE_ALL },
    headers: { accessToken },
  });
  if (data.result !== '0000') throw new Error(`Coros query failed: ${data.message}`);
  const list = data.data.dataList || [];
  return list
    .map(a => ({ ...a, dateMs: a.date > 1e12 ? a.date : a.date * 1000 }))
    .filter(a => a.dateMs > sinceMs)
    .sort((a, b) => a.dateMs - b.dateMs);
};

// Downloads the activity's FIT file. Returns a Buffer.
const downloadActivityFile = async (session, activity, format = 'fit') => {
  const { baseUrl, accessToken } = session;
  const { data } = await axios.post(
    `${baseUrl}/activity/detail/download`,
    undefined,
    {
      params: { labelId: activity.labelId, sportType: activity.sportType, fileType: FILE_TYPE[format] },
      headers: { accessToken },
    }
  );
  if (data.result !== '0000') throw new Error(`Coros download failed: ${data.message}`);
  const fileRes = await axios.get(data.data.fileUrl, { responseType: 'arraybuffer' });
  return Buffer.from(fileRes.data);
};

// eslint-disable-next-line no-unused-vars
const uploadActivityFile = async (session, fileBuffer, format = 'fit') => {
  throw new CorosUploadUnsupportedError();
};

module.exports = {
  login,
  listRecentActivities,
  downloadActivityFile,
  uploadActivityFile,
  CorosUploadUnsupportedError,
};
