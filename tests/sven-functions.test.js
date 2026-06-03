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

async function run() {
  await testPromptTrimming();
  await testIdempotentMessages();
  await testIdempotentStripeCredits();
  await testCryptoRoundTrip();
  await testSupportTickets();
  await resetStorage();
  console.log('sven function tests ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
