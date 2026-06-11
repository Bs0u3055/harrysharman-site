const { getConfig } = require('./sven/lib/config');
const db = require('./sven/lib/db');
const { createCheckoutSession } = require('./sven/lib/billing');
const { connectStorage } = require('./sven/lib/storage');
const { messagePage } = require('./sven/lib/html');

exports.handler = async (event) => {
  connectStorage(event);
  const config = getConfig();
  if (!config.enablePrepaidCredits) {
    return messagePage('Prepaid credits disabled', 'For this beta, Sven uses each tester’s own OpenAI API key.', 400);
  }
  const query = event.queryStringParameters || {};
  const token = query.token || '';
  const pack = query.pack || 'starter';
  const row = await db.getSetupToken(token);
  if (!db.tokenIsValid(row)) return messagePage('Setup link expired', 'Ask Sven for /setup again.', 400);
  try {
    const url = await createCheckoutSession(config, row.telegram_chat_id, pack);
    return { statusCode: 303, headers: { Location: url }, body: '' };
  } catch (error) {
    return messagePage('Billing unavailable', error.message, 400);
  }
};
