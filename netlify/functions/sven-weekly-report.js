const { schedule } = require('@netlify/functions');
const { getConfig } = require('./sven/lib/config');
const { saveAndSendWeeklyReport } = require('./sven/lib/reports');
const { connectStorage } = require('./sven/lib/storage');

exports.handler = schedule('0 8 * * 1', async (event) => {
  connectStorage(event);
  const config = getConfig();
  await saveAndSendWeeklyReport(config);
  return { statusCode: 200, body: 'ok' };
});
