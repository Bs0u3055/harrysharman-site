const { schedule } = require('@netlify/functions');
const { saveAndSendTrafficReport } = require('./lib/site-traffic');

exports.handler = schedule('10 8 * * 1', async () => {
  await saveAndSendTrafficReport();
  return { statusCode: 200, body: 'ok' };
});
