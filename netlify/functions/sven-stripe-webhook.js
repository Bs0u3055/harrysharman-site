const { getConfig } = require('./sven/lib/config');
const { handleStripeWebhook } = require('./sven/lib/billing');

exports.handler = async (event) => {
  const config = getConfig();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const result = await handleStripeWebhook(config, event);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, result }) };
  } catch (error) {
    console.error('stripe webhook error', error);
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: error.message }) };
  }
};

