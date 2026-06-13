const { buildWeeklyTrafficReport, saveAndSendTrafficReport } = require('./lib/site-traffic');

function reportAllowed(query) {
  const expected = process.env.SITE_TRAFFIC_REPORT_TOKEN || process.env.TRAFFIC_REPORT_TOKEN || '';
  if (!expected) return true;
  return query.token === expected;
}

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  if (!reportAllowed(query)) {
    return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Report token required.' };
  }

  const days = Math.max(1, Math.min(30, parseInt(query.days || '7', 10) || 7));
  const shouldSend = query.send === '1' || query.send === 'true';
  const report = shouldSend
    ? await saveAndSendTrafficReport({ days })
    : (await buildWeeklyTrafficReport({ days })).report;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    },
    body: report
  };
};
