const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');

process.env.SVEN_SECRET = 'test-secret';
process.env.SVEN_ADMIN_TOKEN = 'admin-token';
process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
process.env.SVEN_PUBLIC_BASE_URL = 'https://example.com';
process.env.SVEN_WEBHOOK_SECRET_PATH = 'secret-path';
process.env.SVEN_SKIP_KEY_VALIDATION = '1';
process.env.ADMIN_TELEGRAM_CHAT_ID = 'admin-chat';
process.env.SVEN_LEARNING_OPENAI_KEY = 'sk-learning';

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
  assert(SVEN_SYSTEM_PROMPT.includes('food photos'));
  assert(SVEN_SYSTEM_PROMPT.includes('Apple Health'));
  assert(SVEN_SYSTEM_PROMPT.includes('voice-note transcripts'));
  assert(SVEN_SYSTEM_PROMPT.includes('implementation intentions'));
  assert(SVEN_SYSTEM_PROMPT.includes('if-then plans'));
  assert(SVEN_SYSTEM_PROMPT.includes('Founder Sven Core'));
  assert(SVEN_SYSTEM_PROMPT.includes('COM-B'));
  assert(SVEN_SYSTEM_PROMPT.includes('System 1 and System 2'));
  assert(SVEN_SYSTEM_PROMPT.includes('HealthKit companion app'));
  assert(SVEN_SYSTEM_PROMPT.includes('Health Connect'));
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

async function testAutoLearningPromotesSafeGeneralLessons() {
  await resetStorage();
  const originalFetch = global.fetch;
  let payload = null;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target === 'https://api.openai.com/v1/responses') {
      payload = JSON.parse(options.body || '{}');
      assert.strictEqual(payload.text.format.type, 'json_object');
      return new Response(JSON.stringify({
        id: 'resp_learning',
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
          summary: 'Hotel/travel constraints are repeating, so Sven should adapt defaults.',
          promote: [{
            category: 'coaching',
            note: 'When a user is travelling or in a hotel, adapt food and training to available defaults before asking for ideal routines.',
            confidence: 0.86,
            supporting_signal_count: 4,
            rationale: 'Repeated travel/hotel signals in learning and feedback.'
          }],
          skip: []
        }) }] }],
        usage: { input_tokens: 500, output_tokens: 120 }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch target ${target}`);
  };

  try {
    const db = require('../netlify/functions/sven/lib/db');
    const { learningSignal } = require('../netlify/functions/sven/lib/learning');
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { autoRefreshCoreLearnings } = require('../netlify/functions/sven/lib/autolearning');
    const config = getConfig();
    await db.addLearningSignal(learningSignal(config, 'chat-a', 'message', 'user_message', 'I am in a hotel and breakfast is buffet food.'));
    await db.addLearningSignal(learningSignal(config, 'chat-b', 'message', 'user_message', 'Travel week, only hotel gym available.'));
    await db.addLearningSignal(learningSignal(config, 'chat-c', 'media', 'image_message', 'Hotel breakfast photo, unsure portions.'));
    await db.addFeedback('chat-d', 'good', 'Travel context was useful when Sven made the plan fit the hotel.');
    const run = await autoRefreshCoreLearnings(config);
    assert(payload.input.includes('Return JSON only'));
    assert.strictEqual(run.status, 'completed');
    assert.strictEqual(run.promoted_count, 1);
    const core = await db.activeCoreLearnings(10);
    assert.strictEqual(core.length, 1);
    assert.strictEqual(core[0].source, 'auto_learning');
    assert(core[0].note.includes('travelling'));
    const runs = await db.recentAutoLearningRuns(10);
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].promoted_count, 1);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testAutoLearningSkipsWithoutLearningKey() {
  await resetStorage();
  const originalLearningKey = process.env.SVEN_LEARNING_OPENAI_KEY;
  const originalCentralKey = process.env.CENTRAL_OPENAI_API_KEY;
  process.env.SVEN_LEARNING_OPENAI_KEY = '';
  process.env.CENTRAL_OPENAI_API_KEY = '';
  try {
    const db = require('../netlify/functions/sven/lib/db');
    const { learningSignal } = require('../netlify/functions/sven/lib/learning');
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { autoRefreshCoreLearnings } = require('../netlify/functions/sven/lib/autolearning');
    const config = getConfig();
    await db.addLearningSignal(learningSignal(config, 'chat-a', 'message', 'user_message', 'Lots of useful learning.'));
    await db.addLearningSignal(learningSignal(config, 'chat-b', 'message', 'user_message', 'More useful learning.'));
    await db.addLearningSignal(learningSignal(config, 'chat-c', 'message', 'user_message', 'Another useful learning.'));
    const run = await autoRefreshCoreLearnings(config);
    assert.strictEqual(run.status, 'skipped');
    assert(run.summary.includes('SVEN_LEARNING_OPENAI_KEY'));
    assert.strictEqual((await db.activeCoreLearnings(10)).length, 0);
  } finally {
    restoreEnv('SVEN_LEARNING_OPENAI_KEY', originalLearningKey);
    restoreEnv('CENTRAL_OPENAI_API_KEY', originalCentralKey);
  }
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
  assert(help.includes('/whoami'));
  assert(help.includes('support inbox'));
}

async function testSvenBetaPageGating() {
  const originalCode = process.env.SVEN_BETA_ACCESS_CODE;
  process.env.SVEN_BETA_ACCESS_CODE = 'DADFIT9K4M';
  try {
    const { handler } = require('../netlify/functions/sven-beta');
    const locked = await handler({ httpMethod: 'GET', queryStringParameters: {}, headers: {} });
    assert.strictEqual(locked.statusCode, 200);
    assert.strictEqual(locked.headers['X-Robots-Tag'], 'noindex, nofollow, noarchive');
    assert(locked.body.includes('Got the code?'));
    assert(!locked.body.includes('/start DADFIT9K4M'));
    assert(!locked.body.includes('Message Sven on Telegram'));

    const wrong = await handler({ httpMethod: 'GET', queryStringParameters: { invite: 'wrong' }, headers: {} });
    assert.strictEqual(wrong.statusCode, 403);
    assert(wrong.body.includes('That invite code did not work'));

    const open = await handler({ httpMethod: 'GET', queryStringParameters: { invite: 'DADFIT9K4M' }, headers: {} });
    assert.strictEqual(open.statusCode, 200);
    assert(open.headers['Set-Cookie'].includes('sven_beta_invite='));
    assert(open.body.includes('/start DADFIT9K4M'));
    assert(open.body.includes('Message Sven on Telegram'));
    assert(open.body.includes('No laminated'));
  } finally {
    restoreEnv('SVEN_BETA_ACCESS_CODE', originalCode);
  }
}

async function testTelegramInviteGate() {
  await resetStorage();
  const originalCode = process.env.SVEN_BETA_ACCESS_CODE;
  const originalFetch = global.fetch;
  process.env.SVEN_BETA_ACCESS_CODE = 'DADFIT9K4M';
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
    const config = getConfig();
    await processTelegramUpdate(config, telegramUpdate('chat-gated', '/start', 701));
    await processTelegramUpdate(config, telegramUpdate('chat-gated', '/setup', 702));
    await processTelegramUpdate(config, telegramUpdate('chat-gated', 'Can you help me?', 703));
    assert(sentMessages.filter((text) => text.includes('private friend beta')).length >= 3);
    assert(!sentMessages.some((text) => text.includes('/api/sven-setup?token=')));
    assert.strictEqual(openAICalled, false);

    await processTelegramUpdate(config, telegramUpdate('chat-gated', '/start wrong', 704));
    assert(sentMessages.some((text) => text.includes('invite code did not work')));

    await processTelegramUpdate(config, telegramUpdate('chat-gated', '/start DADFIT9K4M', 705));
    const user = await db.getUser('chat-gated');
    assert(user.invite_accepted_at);
    assert(sentMessages.some((text) => text.includes('laminated gym-poster advice')));
  } finally {
    restoreEnv('SVEN_BETA_ACCESS_CODE', originalCode);
    global.fetch = originalFetch;
  }
}

async function testWhoamiShowsTelegramChatId() {
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
    throw new Error(`Unexpected fetch target ${target}`);
  };
  try {
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { processTelegramUpdate } = require('../netlify/functions/sven/lib/engine');
    await processTelegramUpdate(getConfig(), telegramUpdate('chat-whoami', '/whoami', 503));
    assert(sentMessages.some((text) => text.includes('chat-whoami')));
  } finally {
    global.fetch = originalFetch;
  }
}

async function testAdminTelegramCanAddCoreLearning() {
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
    throw new Error(`Unexpected fetch target ${target}`);
  };
  try {
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { processTelegramUpdate } = require('../netlify/functions/sven/lib/engine');
    const db = require('../netlify/functions/sven/lib/db');
    await processTelegramUpdate(getConfig(), telegramUpdate('admin-chat', '/core travel | When a user is in a hotel, make the plan fit the available breakfast and equipment.', 501));
    const rows = await db.activeCoreLearnings(10);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].category, 'travel');
    assert.strictEqual(rows[0].source, 'telegram_admin');
    assert(rows[0].note.includes('hotel'));
    assert(sentMessages.some((text) => text.includes('Saved to Sven Core')));
  } finally {
    global.fetch = originalFetch;
  }
}

async function testNonAdminCannotAddCoreLearning() {
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
    throw new Error(`Unexpected fetch target ${target}`);
  };
  try {
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { processTelegramUpdate } = require('../netlify/functions/sven/lib/engine');
    const db = require('../netlify/functions/sven/lib/db');
    await processTelegramUpdate(getConfig(), telegramUpdate('not-admin', '/core coaching | bad lesson should not save', 502));
    assert.strictEqual((await db.activeCoreLearnings(10)).length, 0);
    assert(sentMessages.some((text) => text.includes('only for the Sven admin')));
  } finally {
    global.fetch = originalFetch;
  }
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

function telegramPhotoUpdate(chatId, caption, messageId) {
  return {
    message: {
      message_id: messageId,
      caption,
      photo: [
        { file_id: 'photo-small', file_size: 2, width: 90, height: 90 },
        { file_id: 'photo-large', file_size: 4, width: 1200, height: 900 }
      ],
      chat: {
        id: chatId,
        first_name: 'Beta'
      }
    }
  };
}

function telegramVoiceUpdate(chatId, messageId) {
  return {
    message: {
      message_id: messageId,
      voice: {
        file_id: 'voice-file',
        file_size: 4,
        duration: 42,
        mime_type: 'audio/ogg'
      },
      chat: {
        id: chatId,
        first_name: 'Beta'
      }
    }
  };
}

async function createReadyByokUser(chatId) {
  const db = require('../netlify/functions/sven/lib/db');
  const { encryptText } = require('../netlify/functions/sven/lib/crypto');
  await db.ensureUser(chatId, 'Beta', { openaiDefaultModel: 'gpt-5-nano', dailyTokenLimit: 120000 });
  const user = await db.getUser(chatId);
  user.onboarding_completed_at = new Date().toISOString();
  user.answers = {
    primary_goal: 'fat loss and consistency',
    motivation: 'energy for family life',
    tracking_comfort: 'photos and rough macros',
    schedule_constraints: 'childcare, work, and travel',
    recovery_sleep: 'sleep is patchy'
  };
  await db.saveUser(user);
  await db.saveApiKey(chatId, {
    provider: 'openai',
    model: 'gpt-5-nano',
    key_ciphertext: encryptText('test-secret', 'sk-test-valid'),
    key_last4: 'alid',
    created_at: db.nowISO(),
    updated_at: db.nowISO()
  });
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

async function testTelegramPhotoAnalysisFlow() {
  await resetStorage();
  await createReadyByokUser('chat-photo');
  const originalFetch = global.fetch;
  const sentMessages = [];
  let responsePayload = null;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/file/botfake-token/photos/meal.jpg')) {
      return new Response(Buffer.from([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
      });
    }
    if (target.includes('/botfake-token/getFile')) {
      const body = JSON.parse(options.body || '{}');
      assert.strictEqual(body.file_id, 'photo-large');
      return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/meal.jpg', file_size: 4 } }), { status: 200 });
    }
    if (target.includes('api.telegram.org')) {
      const body = JSON.parse(options.body || '{}');
      sentMessages.push(body.text || body.action || '');
      return new Response(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }), { status: 200 });
    }
    if (target === 'https://api.openai.com/v1/responses') {
      responsePayload = JSON.parse(options.body || '{}');
      return new Response(JSON.stringify({
        id: 'resp_photo',
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Looks like a chicken-and-rice meal. Roughly 550-700 kcal; send weights next time and I will tighten it up.' }] }],
        usage: { input_tokens: 222, output_tokens: 66 }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch target ${target}`);
  };

  try {
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { processTelegramUpdate } = require('../netlify/functions/sven/lib/engine');
    const db = require('../netlify/functions/sven/lib/db');
    await processTelegramUpdate(getConfig(), telegramPhotoUpdate('chat-photo', 'Lunch at hotel buffet, not sure on portions', 101));
    assert(responsePayload);
    assert.strictEqual(responsePayload.input[0].content[0].type, 'input_text');
    assert.strictEqual(responsePayload.input[0].content[1].type, 'input_image');
    assert(responsePayload.input[0].content[1].image_url.startsWith('data:image/jpeg;base64,'));
    assert(responsePayload.input[0].content[0].text.includes('weights/volumes'));
    assert(responsePayload.input[0].content[0].text.includes('Apple Health'));
    assert(sentMessages.some((text) => text.includes('chicken-and-rice')));
    const usage = await db.rowsFromIndex('usage', 10);
    assert.strictEqual(usage.length, 1);
    const learning = await db.rowsFromIndex('learning', 20);
    assert(learning.some((row) => row.source === 'media' && row.signal === 'image_message'));
  } finally {
    global.fetch = originalFetch;
  }
}

async function testTelegramVoiceNoteFlow() {
  await resetStorage();
  await createReadyByokUser('chat-voice');
  const originalFetch = global.fetch;
  const sentMessages = [];
  let responsePrompt = '';
  let transcriptionRequested = false;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/file/botfake-token/voice/file_1.ogg')) {
      return new Response(Buffer.from([5, 6, 7, 8]), {
        status: 200,
        headers: { 'content-type': 'audio/ogg', 'content-length': '4' }
      });
    }
    if (target.includes('/botfake-token/getFile')) {
      const body = JSON.parse(options.body || '{}');
      assert.strictEqual(body.file_id, 'voice-file');
      return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file_1.ogg', file_size: 4 } }), { status: 200 });
    }
    if (target.includes('api.telegram.org')) {
      const body = JSON.parse(options.body || '{}');
      sentMessages.push(body.text || body.action || '');
      return new Response(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }), { status: 200 });
    }
    if (target === 'https://api.openai.com/v1/audio/transcriptions') {
      transcriptionRequested = true;
      assert(options.body instanceof FormData);
      return new Response(JSON.stringify({
        text: 'I am travelling and staying in a hotel. Slept badly, trained yesterday, and breakfast was eggs, toast and fruit.',
        usage: { input_tokens: 33, output_tokens: 7 }
      }), { status: 200 });
    }
    if (target === 'https://api.openai.com/v1/responses') {
      responsePrompt = JSON.parse(options.body || '{}').input || '';
      return new Response(JSON.stringify({
        id: 'resp_voice',
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hotel week, so we keep it simple: protein breakfast, walk after lunch, short full-body session if sleep improves.' }] }],
        usage: { input_tokens: 200, output_tokens: 50 }
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch target ${target}`);
  };

  try {
    const { getConfig } = require('../netlify/functions/sven/lib/config');
    const { processTelegramUpdate } = require('../netlify/functions/sven/lib/engine');
    const db = require('../netlify/functions/sven/lib/db');
    await processTelegramUpdate(getConfig(), telegramVoiceUpdate('chat-voice', 201));
    assert.strictEqual(transcriptionRequested, true);
    assert(responsePrompt.includes('Voice note transcript'));
    assert(responsePrompt.includes('staying in a hotel'));
    assert(sentMessages.some((text) => text.includes('Hotel week')));
    const messages = await db.getMessages('chat-voice', 10);
    assert(messages.some((message) => message.role === 'user' && message.text.includes('Slept badly')));
    const usage = await db.rowsFromIndex('usage', 10);
    assert.strictEqual(usage.length, 2);
    assert(usage.some((row) => row.model === 'gpt-4o-mini-transcribe'));
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

async function testTrafficTrackingAndWeeklyReport() {
  await resetStorage();
  const {
    recordPageview,
    buildWeeklyTrafficReport,
    normalizePath
  } = require('../netlify/functions/sven/lib/site-traffic');

  assert.strictEqual(normalizePath('https://harrysharman.com/index.html?utm_source=test'), '/');
  assert.strictEqual(normalizePath('/posts/example/index.html'), '/posts/example/');

  await recordPageview(
    {
      path: '/',
      url: 'https://harrysharman.com/',
      title: 'Harry Sharman',
      referrer: '',
      screen_width: 1440,
      language: 'en-GB'
    },
    { headers: { 'user-agent': 'Mozilla/5.0 Chrome/125 Safari/537.36', 'x-nf-country': 'gb' } },
    { now: new Date('2026-06-08T09:00:00.000Z') }
  );
  await recordPageview(
    {
      path: '/podcast.html',
      url: 'https://harrysharman.com/podcast.html?utm_source=linkedin&utm_medium=social',
      title: 'Briefly AI',
      referrer: 'https://www.linkedin.com/feed/',
      screen_width: 390,
      language: 'en-GB'
    },
    { headers: { 'user-agent': 'Mozilla/5.0 iPhone Mobile Safari/604.1', 'x-nf-country': 'gb' } },
    { now: new Date('2026-06-08T10:00:00.000Z') }
  );
  await recordPageview(
    { path: '/old.html', url: 'https://harrysharman.com/old.html', title: 'Old' },
    { headers: { 'user-agent': 'Mozilla/5.0 Firefox/120.0', 'x-nf-country': 'us' } },
    { now: new Date('2026-06-01T10:00:00.000Z') }
  );
  const bot = await recordPageview(
    { path: '/bot.html', url: 'https://harrysharman.com/bot.html', title: 'Bot' },
    { headers: { 'user-agent': 'Googlebot/2.1' } },
    { now: new Date('2026-06-08T10:30:00.000Z') }
  );

  assert.strictEqual(bot.tracked, false);
  const { report, summary } = await buildWeeklyTrafficReport({
    now: new Date('2026-06-08T12:00:00.000Z'),
    days: 7
  });
  assert.strictEqual(summary.pageviews, 2);
  assert.strictEqual(summary.previous_pageviews, 1);
  assert(report.includes('Website traffic weekly overview'));
  assert(report.includes('/podcast.html - 1'));
  assert(report.includes('linkedin.com - 1'));
  assert(report.includes('GB - 2'));
}

async function testTrafficReportEndpointRequiresAdmin() {
  await resetStorage();
  const { handler } = require('../netlify/functions/site-traffic-report');
  const denied = await handler({ httpMethod: 'GET', queryStringParameters: {} });
  assert.strictEqual(denied.statusCode, 403);

  const ok = await handler({ httpMethod: 'GET', queryStringParameters: { token: 'admin-token' } });
  assert.strictEqual(ok.statusCode, 200);
  assert(ok.body.includes('Website traffic weekly overview'));
}

async function run() {
  await testPromptTrimming();
  await testSvenPersonalityPrompt();
  await testCoreLearningAndUserIsolationInPrompt();
  await testAutoLearningPromotesSafeGeneralLessons();
  await testAutoLearningSkipsWithoutLearningKey();
  await testPrepaidCreditsDisabledByDefault();
  await testLearningRedactionAndHashing();
  await testIdempotentMessages();
  await testIdempotentStripeCredits();
  await testCryptoRoundTrip();
  await testSupportTickets();
  await testDeleteUserDataClearsSecondaryRecords();
  await testHelpMentionsSupport();
  await testSvenBetaPageGating();
  await testTelegramInviteGate();
  await testWhoamiShowsTelegramChatId();
  await testAdminTelegramCanAddCoreLearning();
  await testNonAdminCannotAddCoreLearning();
  await testSetupChecksTokenBeforeKeyShape();
  await testBillingEndpointDisabledByDefault();
  await testEndToEndSvenFlow();
  await testTelegramPhotoAnalysisFlow();
  await testTelegramVoiceNoteFlow();
  await testCreditModeRequiresSafeReserveBeforeOpenAI();
  await testCentralKeyIgnoredWhenPrepaidDisabled();
  await testAdminShowsPaymentMonitoringSections();
  await testTrafficTrackingAndWeeklyReport();
  await testTrafficReportEndpointRequiresAdmin();
  await resetStorage();
  console.log('sven function tests ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
