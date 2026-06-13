const { getConfig } = require('./sven/lib/config');
const { setWebhook } = require('./sven/lib/telegram');

exports.handler = async (event) => {
  const config = getConfig();
  const token = (event.queryStringParameters || {}).token || '';
  if (!config.adminToken || token !== config.adminToken) {
    return { statusCode: 403, body: 'Forbidden' };
  }
  const result = await setWebhook(config);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
};

