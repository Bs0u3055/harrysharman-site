const { connectStorage } = require('./sven/lib/storage');
const { recordPageview } = require('./sven/lib/site-traffic');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  connectStorage(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'POST required' });
  if (process.env.SITE_TRAFFIC_DISABLED === '1') return json(200, { ok: true, tracked: false });

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON' });
  }

  try {
    const result = await recordPageview(payload, event);
    return json(200, { ok: true, tracked: result.tracked });
  } catch (error) {
    console.error('traffic-track error', error);
    return json(500, { ok: false, error: 'Could not record pageview' });
  }
};
