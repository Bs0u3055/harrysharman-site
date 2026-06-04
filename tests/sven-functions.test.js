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

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
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

async function testSvenPersonalityPrompt() {
  const { SVEN_SYSTEM_PROMPT } = require('../netlify/functions/sven/lib/prompts');
  assert(SVEN_SYSTEM_PROMPT.includes('real coach'));
  assert(SVEN_SYSTEM_PROMPT.includes('lightly funny'));
  assert(SVEN_SYSTEM_PROMPT.includes('no corporate wellness fog'));
  assert(SVEN_SYSTEM_PROMPT.includes('not judged'));
  assert(SVEN_SYSTEM_PROMPT.includes('Sound like Sven'));
}

async function testCoreLearningAndUserIsolationInPrompt() {
  const { buildChatPrompt } = require('../netlify/functions/sven/lib/prompts');
  const prompt = buildChatPrompt(
    { answers: { goal: 'build strength', constraints: 'busy work week' } },
    [{ role: 'user', text: 'my private detail is blue kettlebell' }],
    'What should I do today?',
    800,
    [{ category: 'coaching', note: 'Prefer repeatable progressions over novelty.' }]
  );
  assert(prompt.includes('Prefer repeatable progressions'));
  assert(prompt.includes('blue kettlebell'));
  assert(!prompt.includes('another user private detail'));
}

async function testPrepaidCreditsDisabledByDefault() {
  const { getConfig, stripeConfigured } = require('../netlify/functions/sven/lib/config');
  const original = {
    enable: process.env.SVEN_ENABLE_PREPAID_CREDITS,
    stripeSecret: process.env.STRIPE_SECRET_KEY,
    stripeWebhook: process.env.STRIPE_WEBHOOK_SECRET,
    starter: process.env.STRIPE_PRICE_ID_STARTER,
    standard: process.env.STRIPE_PRICE_ID_STANDARD
  };
  process.env.SVEN_ENABLE_PREPAID_CREDITS = '';
  process.env.STRIPE_SECRET_KEY = 'sk_test_stripe';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_PRICE_ID_STARTER = 'price_starter';
  process.env.STRIPE_PRICE_ID_STANDARD = 'price_standard';
  try {
    const config = getConfig();
    assert.strictEqual(config.enablePrepaidCredits, false);
    assert.strictEqual(stripeConfigured(config), false);
    process.env.SVEN_ENABLE_PREPAID_CREDITS = 'true';
    const enabled = getConfig();
    assert.strictEqual(enabled.enablePrepaidCredits, true);
    assert.strictEqual(stripeConfigured(enabled), true);
  } finally {
    restoreEnv('SVEN_ENABLE_PREPAID_CREDITS', original.enable);
    restoreEnv('STRIPE_SECRET_KEY', original.stripeSecret);
    restoreEnv('STRIPE_WEBHOOK_SECRET', original.stripeWebhook);
    restoreEnv('STRIPE_PRICE_ID_STARTER', original.starter);
    restoreEnv('STRIPE_PRICE_ID_STANDARD', original.standard);
  }
}

async function testLearningRedactionAndHashing() {
  const { learningSignal, userHash } = require('../netlify/functions/sven/lib/learning');
  const config = { svenSecret: 'hash-secret' };
  const signal = learningSignal(
    config,
    'chat-1',
    'message',
    'user_message',
    'Email me at person@example.com, call +44 7700 900123, key sk-abc123abc123abc123abc123 token=secret'
  );
  assert.strictEqual(signal.user_hash, userHash(config, 'chat-1'));
  assert(!signal.text_excerpt.includes('person@example.com'));
  assert(!signal.text_excerpt.includes('+44 7700 900123'));
  assert(!signal.text_excerpt.includes('sk-abc'));
  assert(!signal.text_excerpt.includes('token=secret'));
  assert(!Object.prototype.hasOwnProperty.call(signal, 'telegram_chat_id'));
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
  await db.addCheckoutSession('cs_123', 'chat-1', 'starter', 1000);
  assert.strictEqual(await db.addCredits('chat-1', 1000, 'stripe_starter', 'cs_123'), true);
  assert.strictEqual(await db.addCredits('chat-1', 1000, 'stripe_starter', 'cs_123'), false);
  const user = await db.getUser('chat-1');
  assert.strictEqual(user.credit_balance_tokens, 1000);
  const checkouts = await db.rowsFromIndex('checkout', 10);
  assert.strictEqual(checkouts.length, 1);
  assert.strictEqual(checkouts[0].stripe_session_id, 'cs_123');
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

async function testDeleteUserDataClearsSecondaryRecords() {
  await resetStorage();
  const db = require('../netlify/functions/sven/lib/db');
  const { learningSignal, userHash } = require('../netlify/functions/sven/lib/learning');
  const config = { openaiDefaultModel: 'gpt-5-nano', dailyTokenLimit: 120000, svenSecret: 'delete-secret' };
  await db.ensureUser('chat-1', 'Harry', config);
  await db.addMessage('chat-1', 'user', 'private message');
  await db.addUsage('chat-1', 'openai', 'gpt-5-nano', 'byok', 1, 2, {});
  await db.addFeedback('chat-1', 'bad', 'wrong tone');
  await db.addSupportTicket('chat-1', 'broken setup');
  await db.addSafetyFlag('chat-1', 'user', 'injury', 'knee pain');
  await db.addLearningSignal(learningSignal(config, 'chat-1', 'message', 'user_message', 'private message'));
  await db.deleteUserData('chat-1', userHash(config, 'chat-1'));
  assert.strictEqual(await db.getUser('chat-1'), null);
  assert.deepStrictEqual(await db.getMessages('chat-1', 10), []);
  assert.strictEqual((await db.rowsFromIndex('usage', 10)).length, 0);
  assert.strictEqual((await db.rowsFromIndex('feedback', 10)).length, 0);
  assert.strictEqual((await db.rowsFromIndex('support', 10)).length, 0);
  assert.strictEqual((await db.rowsFromIndex('safety', 10)).length, 0);
  assert.strictEqual((await db.rowsFromIndex('learning', 10)).length, 0);
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
    restoreEnv('SVEN_SKIP_KEY_VALIDATION', originalSkip);
  }
}

async function testBillingEndpointDisabledByDefault() {
  const original = process.env.SVEN_ENABLE_PREPAID_CREDITS;
  process.env.SVEN_ENABLE_PREPAID_CREDITS = '';
  try {
    const { handler } = require('../netlify/functions/sven-billing');
    const response = await handler({ httpMethod: 'GET', queryStringParameters: { token: 'anything', pack: 'starter' } });
    assert.strictEqual(response.statusCode, 400);
    assert(response.body.includes('Prepaid credits disabled'));
  } finally {
    restoreEnv('SVEN_ENABLE_PREPAID_CREDITS', original);
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
  let responsePrompt = '';
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
      responsePrompt = JSON.parse(options.body || '{}').input || '';
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
    assert(sentMessages.some((text) => text.includes('laminated gym-poster advice')));
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

    await db.addCoreLearning('coaching', 'Prefer boring repeatable progressions over novelty for busy parents.');
    await processTelegramUpdate(config, telegramUpdate(chatId, 'Can you plan today?', messageId++));
    const usage = await db.rowsFromIndex('usage', 10);
    assert.strictEqual(usage.length, 1);
    assert(responsePrompt.includes('Prefer boring repeatable progressions'));
    assert(sentMessages.some((text) => text.includes('warm up')));

    await processTelegramUpdate(config, telegramUpdate(chatId, '/bug setup link was confusing', messageId++));
    const support = await db.rowsFromIndex('support', 10);
    assert.strictEqual(support.length, 1);
    assert.strictEqual(support[0].note, 'setup link was confusing');
    const learning = await db.rowsFromIndex('learning', 100);
    assert(learning.length >= 20);
    assert(learning.every((row) => row.user_hash && !Object.prototype.hasOwnProperty.call(row, 'telegram_chat_id')));
    assert(learning.some((row) => row.source === 'support' && row.text_excerpt.includes('setup link was confusing')));
  } finally {
    global.fetch = originalFetch;
  }
}

async function testCreditModeRequiresSafeReserveBeforeOpenAI() {
  await resetStorage();
  const originalFetch = global.fetch;
  const sentMessages = [];
  let openAICalled = false;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('api.telegram.org')) {
      const body = JSON.parse(options.body || '{}');
      sentMessages.push(body.text || '');
      return new Response(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }), { status: 200 });
    }
    if (target.includes('api.openai.com')) {
      openAICalled = true;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    throw new Error(`Unexpected fetch target ${target}`);
  };

  try {
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { processTelegramUpdate } = require('../netlify/functions/sven/lib/engine');
    const db = require('../netlify/functions/sven/lib/db');
    const config = { ...getConfig(), centralOpenAIKey: 'sk-test-central', enablePrepaidCredits: true };
    await db.ensureUser('chat-credit', 'Credit', config);
    const user = await db.getUser('chat-credit');
    user.onboarding_completed_at = new Date().toISOString();
    user.answers = { primary_goal: 'strength' };
    user.credit_balance_tokens = 1600;
    user.funding_mode = 'credits';
    await db.saveUser(user);
    await processTelegramUpdate(config, telegramUpdate('chat-credit', 'Give me a plan today', 1));
    assert.strictEqual(openAICalled, false);
    assert(sentMessages.some((text) => text.includes('credit balance is too low')));
    assert.strictEqual((await db.rowsFromIndex('usage', 10)).length, 0);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testCentralKeyIgnoredWhenPrepaidDisabled() {
  await resetStorage();
  const originalFetch = global.fetch;
  const sentMessages = [];
  let openAICalled = false;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('api.telegram.org')) {
      const body = JSON.parse(options.body || '{}');
      sentMessages.push(body.text || '');
      return new Response(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }), { status: 200 });
    }
    if (target.includes('api.openai.com')) {
      openAICalled = true;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    throw new Error(`Unexpected fetch target ${target}`);
  };

  try {
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { processTelegramUpdate } = require('../netlify/functions/sven/lib/engine');
    const db = require('../netlify/functions/sven/lib/db');
    const config = { ...getConfig(), centralOpenAIKey: 'sk-test-central', enablePrepaidCredits: false };
    await db.ensureUser('chat-disabled', 'Disabled', config);
    const user = await db.getUser('chat-disabled');
    user.onboarding_completed_at = new Date().toISOString();
    user.answers = { primary_goal: 'strength' };
    user.credit_balance_tokens = 999999;
    user.funding_mode = 'credits';
    await db.saveUser(user);
    await processTelegramUpdate(config, telegramUpdate('chat-disabled', 'Give me a plan today', 1));
    assert.strictEqual(openAICalled, false);
    assert(sentMessages.some((text) => text.includes('own OpenAI API key')));
    assert.strictEqual((await db.rowsFromIndex('usage', 10)).length, 0);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testAdminShowsPaymentMonitoringSections() {
  await resetStorage();
  const db = require('../netlify/functions/sven/lib/db');
  const { handler } = require('../netlify/functions/sven-admin');
  const config = { openaiDefaultModel: 'gpt-5-nano', dailyTokenLimit: 120000 };
  await db.ensureUser('chat-1', 'Harry', config);
  await db.addCheckoutSession('cs_admin', 'chat-1', 'starter', 250000);
  await db.addCredits('chat-1', 250000, 'stripe_starter', 'cs_admin');
  await db.addUsage('chat-1', 'openai', 'gpt-5-nano', 'credits', 10, 20, {});
  const response = await handler({ httpMethod: 'GET', queryStringParameters: { token: 'admin-token' } });
  assert.strictEqual(response.statusCode, 200);
  assert(response.body.includes('Recent Usage'));
  assert(response.body.includes('Credit Ledger'));
  assert(response.body.includes('Stripe Checkout Sessions'));
  assert(response.body.includes('cs_admin'));
}

async function run() {
  await testPromptTrimming();
  await testSvenPersonalityPrompt();
  await testCoreLearningAndUserIsolationInPrompt();
  await testPrepaidCreditsDisabledByDefault();
  await testLearningRedactionAndHashing();
  await testIdempotentMessages();
  await testIdempotentStripeCredits();
  await testCryptoRoundTrip();
  await testSupportTickets();
  await testDeleteUserDataClearsSecondaryRecords();
  await testHelpMentionsSupport();
  await testSetupChecksTokenBeforeKeyShape();
  await testBillingEndpointDisabledByDefault();
  await testEndToEndSvenFlow();
  await testCreditModeRequiresSafeReserveBeforeOpenAI();
  await testCentralKeyIgnoredWhenPrepaidDisabled();
  await testAdminShowsPaymentMonitoringSections();
  await resetStorage();
  console.log('sven function tests ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
