const { schedule } = require('@netlify/functions');
const { getConfig } = require('./sven/lib/config');
const { connectStorage } = require('./sven/lib/storage');
const { saveAndSendTrafficReport } = require('./sven/lib/site-traffic');

exports.handler = schedule('10 8 * * 1', async (event) => {
  connectStorage(event);
  await saveAndSendTrafficReport(getConfig());
  return { statusCode: 200, body: 'ok' };
});
