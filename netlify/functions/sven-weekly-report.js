const { schedule } = require('@netlify/functions');
const { getConfig } = require('./sven/lib/config');
const { saveAndSendWeeklyReport } = require('./sven/lib/reports');

exports.handler = schedule('0 8 * * 1', async () => {
  const config = getConfig();
  await saveAndSendWeeklyReport(config);
  return { statusCode: 200, body: 'ok' };
});

