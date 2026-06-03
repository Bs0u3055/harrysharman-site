const { getConfig } = require('./sven/lib/config');
const { processTelegramUpdate } = require('./sven/lib/engine');

exports.handler = async (event) => {
  const config = getConfig();
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const suppliedSecret = (event.queryStringParameters || {}).secret || '';
  if (!config.webhookSecretPath || suppliedSecret !== config.webhookSecretPath) {
    return { statusCode: 404, body: 'Not found' };
  }
  try {
    const update = JSON.parse(event.body || '{}');
    await processTelegramUpdate(config, update);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('sven-telegram error', error);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false }) };
  }
};

