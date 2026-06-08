const { getConfig } = require('./sven/lib/config');
const { connectStorage } = require('./sven/lib/storage');
const { buildWeeklyTrafficReport, saveAndSendTrafficReport } = require('./sven/lib/site-traffic');

function requireAdmin(config, token) {
  return Boolean(config.adminToken && token && token === config.adminToken);
}

exports.handler = async (event) => {
  connectStorage(event);
  const config = getConfig();
  const query = event.queryStringParameters || {};
  if (!requireAdmin(config, query.token || '')) {
    return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Admin token required.' };
  }

  const days = Math.max(1, Math.min(30, parseInt(query.days || '7', 10) || 7));
  const shouldSend = query.send === '1' || query.send === 'true';
  const report = shouldSend
    ? await saveAndSendTrafficReport(config, { days })
    : (await buildWeeklyTrafficReport({ days })).report;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: report
  };
};
