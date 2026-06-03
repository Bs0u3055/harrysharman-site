const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');

process.env.SVEN_SECRET = 'test-secret';
process.env.SVEN_ADMIN_TOKEN = 'admin-token';
process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
process.env.SVEN_PUBLIC_BASE_URL = 'https://example.com';
process.env.SVEN_WEBHOOK_SECRET_PATH = 'secret-path';
process.env.SVEN_SKIP_KEY_VALIDATION = '1';

const storageDir = path.join(process.cwd(), '.sven-data');

async function resetStorage() {
  await fs.rm(storageDir, { recursive: true, force: true });
}

async function testPromptTrimming() {
  const { buildChatPrompt } = require('../netlify/functions/sven/lib/prompts');
  const prompt = buildChatPrompt(
    { answers: { goal: 'build strength', constraints: 'busy work week' } },
    [
      { role: 'user', text: 'old ' + 'x'.repeat(5000) },
      { role: 'assistant', text: 'middle ' + 'y'.repeat(5000) },
      { role: 'user', text: 'latest useful detail' }
    ],
    'What should I do today?',
    800
  );
  assert(prompt.includes('Latest user message:'));
  assert(prompt.includes('latest useful detail'));
  assert(prompt.includes('older messages omitted'));
  assert(prompt.length < 7000);
}

async function testIdempotentMessages() {
  await resetStorage();
  const db = require('../netlify/functions/sven/lib/db');
  await db.ensureUser('chat-1', 'Harry', { openaiDefaultModel: 'gpt-5-nano', dailyTokenLimit: 120000 });
  assert.strictEqual(await db.addUserMessageOnce('chat-1', 'hello', 123), true);
  assert.strictEqual(await db.addUserMessageOnce('chat-1', 'hello again', 123), false);
  const messages = await db.getMessages('chat-1', 10);
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].text, 'hello');
}

async function testIdempotentStripeCredits() {
  await resetStorage();
  const db = require('../netlify/functions/sven/lib/db');
  await db.ensureUser('chat-1', 'Harry', { openaiDefaultModel: 'gpt-5-nano', dailyTokenLimit: 120000 });
  assert.strictEqual(await db.addCredits('chat-1', 1000, 'stripe_starter', 'cs_123'), true);
  assert.strictEqual(await db.addCredits('chat-1', 1000, 'stripe_starter', 'cs_123'), false);
  const user = await db.getUser('chat-1');
  assert.strictEqual(user.credit_balance_tokens, 1000);
}

async function testCryptoRoundTrip() {
  const { encryptText, decryptText } = require('../netlify/functions/sven/lib/crypto');
  const encrypted = encryptText('secret', 'sk-test');
  assert.notStrictEqual(encrypted, 'sk-test');
  assert.strictEqual(decryptText('secret', encrypted), 'sk-test');
}

async function testSupportTickets() {
  await resetStorage();
  const db = require('../netlify/functions/sven/lib/db');
  await db.ensureUser('chat-1', 'Harry', { openaiDefaultModel: 'gpt-5-nano', dailyTokenLimit: 120000 });
  await db.addSupportTicket('chat-1', 'setup link says expired');
  const rows = await db.rowsFromIndex('support', 10);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].telegram_chat_id, 'chat-1');
  assert.strictEqual(rows[0].status, 'open');
  assert.strictEqual(rows[0].note, 'setup link says expired');
}

async function testHelpMentionsSupport() {
  const { commandHelp } = require('../netlify/functions/sven/lib/engine');
  const help = commandHelp();
  assert(help.includes('/bug'));
  assert(help.includes('support inbox'));
}

async function testSetupChecksTokenBeforeKeyShape() {
  await resetStorage();
  const originalSkip = process.env.SVEN_SKIP_KEY_VALIDATION;
  process.env.SVEN_SKIP_KEY_VALIDATION = '0';
  try {
    const { handler } = require('../netlify/functions/sven-setup');
    const response = await handler({
      httpMethod: 'POST',
      body: 'token=not-real&api_key=not-an-openai-key&model=gpt-5-nano'
    });
    assert.strictEqual(response.statusCode, 400);
    assert(response.body.includes('Setup link expired'));
    assert(!response.body.includes('Key rejected'));
  } finally {
    process.env.SVEN_SKIP_KEY_VALIDATION = originalSkip;
  }
}

function telegramUpdate(chatId, text, messageId) {
  return {
    message: {
      message_id: messageId,
      text,
      chat: {
        id: chatId,
        first_name: 'Beta'
      }
    }
  };
}

async function testEndToEndSvenFlow() {
  await resetStorage();
  const originalFetch = global.fetch;
  const sentMessages = [];
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('api.telegram.org')) {
      const body = JSON.parse(options.body || '{}');
      sentMessages.push(body.text || '');
      return new Response(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }), { status: 200 });
    }
    if (target === 'https://api.openai.com/v1/models') {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (target === 'https://api.openai.com/v1/responses') {
      return new Response(JSON.stringify({
        id: 'resp_test',
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Today: warm up, squat, row, carry. Keep it simple.' }] }],
        usage: { input_tokens: 123, output_tokens: 45 }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch target ${target}`);
  };

  try {
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { processTelegramUpdate } = require('../netlify/functions/sven/lib/engine');
    const setup = require('../netlify/functions/sven-setup');
    const db = require('../netlify/functions/sven/lib/db');
    const config = getConfig();
    const chatId = 'chat-e2e';
    let messageId = 1;

    await processTelegramUpdate(config, telegramUpdate(chatId, '/start', messageId++));
    const answers = [
      'Beta Tester',
      '39',
      'Fat loss and consistency',
      'I want energy for family life',
      '178cm, 88kg, inconsistent training',
      'Three steady sessions a week',
      'Patchy',
      '3 days, 40 minutes',
      'Gym and dumbbells',
      'none',
      'toast breakfast, meal deal lunch, family dinner',
      'no allergies',
      'protein only',
      'childcare and travel',
      'sleep is mixed',
      'direct and funny',
      'no guilt language',
      'yes'
    ];
    for (const answer of answers) await processTelegramUpdate(config, telegramUpdate(chatId, answer, messageId++));
    const user = await db.getUser(chatId);
    assert(user.onboarding_completed_at);

    await processTelegramUpdate(config, telegramUpdate(chatId, '/setup', messageId++));
    const setupMessage = sentMessages.find((text) => text.includes('/api/sven-setup?token='));
    assert(setupMessage);
    const token = new URL(setupMessage.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
    const getResponse = await setup.handler({ httpMethod: 'GET', queryStringParameters: { token } });
    assert.strictEqual(getResponse.statusCode, 200);
    assert(getResponse.body.includes('Set up Sven'));

    const postResponse = await setup.handler({
      httpMethod: 'POST',
      body: `token=${encodeURIComponent(token)}&api_key=sk-test-valid&model=gpt-5-nano`
    });
    assert.strictEqual(postResponse.statusCode, 200);
    assert(postResponse.body.includes('Connected'));
    assert(await db.getApiKey(chatId));

    await processTelegramUpdate(config, telegramUpdate(chatId, 'Can you plan today?', messageId++));
    const usage = await db.rowsFromIndex('usage', 10);
    assert.strictEqual(usage.length, 1);
    assert(sentMessages.some((text) => text.includes('warm up')));

    await processTelegramUpdate(config, telegramUpdate(chatId, '/bug setup link was confusing', messageId++));
    const support = await db.rowsFromIndex('support', 10);
    assert.strictEqual(support.length, 1);
    assert.strictEqual(support[0].note, 'setup link was confusing');
  } finally {
    global.fetch = originalFetch;
  }
}

async function run() {
  await testPromptTrimming();
  await testIdempotentMessages();
  await testIdempotentStripeCredits();
  await testCryptoRoundTrip();
  await testSupportTickets();
  await testHelpMentionsSupport();
  await testSetupChecksTokenBeforeKeyShape();
  await testEndToEndSvenFlow();
  await resetStorage();
  console.log('sven function tests ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
