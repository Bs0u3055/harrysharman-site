const querystring = require('querystring');
const { getConfig, stripeConfigured } = require('./sven/lib/config');
const db = require('./sven/lib/db');
const { encryptText } = require('./sven/lib/crypto');
const { validateOpenAIKey } = require('./sven/lib/openai');
const { escapeHTML, htmlResponse, messagePage } = require('./sven/lib/html');

function setupPage(token, config) {
  const prepaid = stripeConfigured(config)
    ? `<div class="card">
        <h2>Option 2: buy prepaid credits</h2>
        <p>Sven uses Harry's central model key, but your credit balance is capped. When credits run out, Sven stops.</p>
        <p><a class="button" href="/api/sven-billing?token=${escapeHTML(token)}&pack=starter">Buy starter credits</a></p>
        <p><a class="button secondary" href="/api/sven-billing?token=${escapeHTML(token)}&pack=standard">Buy standard credits</a></p>
      </div>`
    : `<div class="card">
        <h2>Beta mode</h2>
        <p>For this beta, Sven is a coaching harness around your own OpenAI account. Add your own API key so usage and costs stay with you.</p>
      </div>`;

  return htmlResponse(200, 'Set up Sven', `<h1>Set up Sven</h1>
    <p>Connect your own OpenAI API key. Do not paste API keys into Telegram.</p>
    <p>After setup, Sven can reply to text, Telegram voice notes, food photos, and screenshots of workout, sleep, recovery, or health data.</p>
    <div class="grid">
      <div class="card">
        <h2>Use your own OpenAI key</h2>
        <p>You pay OpenAI directly. Sven stores the key encrypted and uses it only for your chat.</p>
        <form method="post" action="/api/sven-setup">
          <input type="hidden" name="token" value="${escapeHTML(token)}">
          <label for="model">Model</label>
          <input id="model" name="model" value="${escapeHTML(config.openaiDefaultModel)}">
          <label for="api_key">OpenAI API key</label>
          <input id="api_key" name="api_key" type="password" autocomplete="off" required>
          <button type="submit">Save API key</button>
        </form>
      </div>
      ${prepaid}
    </div>`);
}

exports.handler = async (event) => {
  const config = getConfig();
  if (event.httpMethod === 'GET') {
    const token = (event.queryStringParameters || {}).token || '';
    const row = await db.getSetupToken(token);
    if (!db.tokenIsValid(row)) return messagePage('Setup link expired', 'Ask Sven for /setup again.', 400);
    return setupPage(token, config);
  }
  if (event.httpMethod !== 'POST') return messagePage('Method not allowed', 'Use the setup form.', 405);
  const body = querystring.parse(event.body || '');
  const token = String(body.token || '');
  const apiKey = String(body.api_key || '').trim();
  const model = String(body.model || config.openaiDefaultModel).trim() || config.openaiDefaultModel;
  if (!config.svenSecret) return messagePage('Setup problem', 'SVEN_SECRET is not configured.', 500);
  const row = await db.getSetupToken(token);
  if (!db.tokenIsValid(row)) return messagePage('Setup link expired', 'Ask Sven for /setup again.', 400);
  if (!config.skipKeyValidation) {
    try {
      await validateOpenAIKey(apiKey);
    } catch (error) {
      return messagePage('Key rejected', error.message, 400);
    }
  }
  await db.saveApiKey(row.telegram_chat_id, {
    provider: 'openai',
    model,
    key_ciphertext: encryptText(config.svenSecret, apiKey),
    key_last4: apiKey.slice(-4),
    created_at: db.nowISO(),
    updated_at: db.nowISO()
  });
  await db.markSetupTokenUsed(token);
  return messagePage('Connected', 'Return to Telegram and send /status.');
};
