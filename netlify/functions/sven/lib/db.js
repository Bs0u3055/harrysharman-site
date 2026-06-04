const { getJSON, setJSON, deleteKey, addToIndex, readIndex } = require('./storage');

const MAX_MESSAGES_PER_USER = 1000;
const MAX_LEARNING_SIGNALS = 5000;

function nowISO() {
  return new Date().toISOString();
}

function todayKey() {
  return nowISO().slice(0, 10);
}

function userKey(chatId) {
  return `user:${chatId}`;
}

function apiKeyKey(chatId) {
  return `api-key:${chatId}`;
}

function messagesKey(chatId) {
  return `messages:${chatId}`;
}

function setupTokenKey(token) {
  return `setup-token:${token}`;
}

function learningKey() {
  return `learning:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function coreLearningKey() {
  return `core-learning:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

async function ensureUser(chatId, displayName, config) {
  const key = userKey(chatId);
  let user = await getJSON(key, null);
  const now = nowISO();
  if (!user) {
    user = {
      telegram_chat_id: String(chatId),
      display_name: displayName || '',
      onboarding_index: 0,
      onboarding_completed_at: null,
      preferred_provider: 'openai',
      preferred_model: config.openaiDefaultModel,
      funding_mode: 'unset',
      credit_balance_tokens: 0,
      daily_token_limit: config.dailyTokenLimit,
      answers: {},
      processed_message_ids: [],
      created_at: now,
      updated_at: now
    };
  } else {
    user.display_name = displayName || user.display_name || '';
    user.updated_at = now;
  }
  await setJSON(key, user);
  await addToIndex('users', String(chatId), 1000);
  return user;
}

async function getUser(chatId) {
  return getJSON(userKey(chatId), null);
}

async function saveUser(user) {
  user.updated_at = nowISO();
  await setJSON(userKey(user.telegram_chat_id), user);
  await addToIndex('users', String(user.telegram_chat_id), 1000);
  return user;
}

function onboardingComplete(user) {
  return Boolean(user && user.onboarding_completed_at);
}

async function saveSetupToken(token, chatId, ttlMinutes) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  await setJSON(setupTokenKey(token), {
    token,
    telegram_chat_id: String(chatId),
    expires_at: expiresAt,
    used_at: null,
    created_at: nowISO()
  });
}

async function getSetupToken(token) {
  return getJSON(setupTokenKey(token), null);
}

function tokenIsValid(row) {
  return Boolean(row && !row.used_at && new Date(row.expires_at).getTime() > Date.now());
}

async function markSetupTokenUsed(token) {
  const row = await getSetupToken(token);
  if (!row) return;
  row.used_at = nowISO();
  await setJSON(setupTokenKey(token), row);
}

async function saveApiKey(chatId, keyRecord) {
  await setJSON(apiKeyKey(chatId), keyRecord);
  const user = await getUser(chatId);
  if (user) {
    user.funding_mode = 'byok';
    user.preferred_provider = keyRecord.provider;
    user.preferred_model = keyRecord.model;
    await saveUser(user);
  }
}

async function getApiKey(chatId) {
  return getJSON(apiKeyKey(chatId), null);
}

async function deleteApiKey(chatId) {
  await deleteKey(apiKeyKey(chatId));
  const user = await getUser(chatId);
  if (user) {
    user.funding_mode = user.credit_balance_tokens > 0 ? 'credits' : 'unset';
    await saveUser(user);
  }
}

async function addCredits(chatId, amountTokens, reason, stripeSessionId = null) {
  if (stripeSessionId) {
    const existing = await getJSON(`stripe-credit:${stripeSessionId}`, null);
    if (existing) return false;
    await setJSON(`stripe-credit:${stripeSessionId}`, { chatId: String(chatId), amountTokens, reason, created_at: nowISO() });
  }
  const user = await getUser(chatId);
  if (!user) return false;
  user.credit_balance_tokens = Math.max(0, Number(user.credit_balance_tokens || 0) + Number(amountTokens || 0));
  user.funding_mode = 'credits';
  await saveUser(user);
  const ledgerKey = `credit:${Date.now()}:${chatId}:${Math.random().toString(16).slice(2)}`;
  await setJSON(ledgerKey, {
    telegram_chat_id: String(chatId),
    delta_tokens: Number(amountTokens || 0),
    reason,
    stripe_session_id: stripeSessionId,
    created_at: nowISO()
  });
  await addToIndex('credits', ledgerKey, 1000);
  return true;
}

async function consumeCredits(chatId, amountTokens, reason) {
  const user = await getUser(chatId);
  if (!user) return;
  const tokens = Math.max(0, Number(amountTokens || 0));
  user.credit_balance_tokens = Math.max(0, Number(user.credit_balance_tokens || 0) - tokens);
  await saveUser(user);
  const ledgerKey = `credit:${Date.now()}:${chatId}:${Math.random().toString(16).slice(2)}`;
  await setJSON(ledgerKey, {
    telegram_chat_id: String(chatId),
    delta_tokens: -tokens,
    reason,
    created_at: nowISO()
  });
  await addToIndex('credits', ledgerKey, 1000);
}

async function addCheckoutSession(sessionId, chatId, packName, creditTokens) {
  await setJSON(`checkout:${sessionId}`, {
    stripe_session_id: sessionId,
    telegram_chat_id: String(chatId),
    pack_name: packName,
    credit_tokens: creditTokens,
    status: 'created',
    created_at: nowISO(),
    updated_at: nowISO()
  });
}

async function getCheckoutSession(sessionId) {
  return getJSON(`checkout:${sessionId}`, null);
}

async function markCheckoutPaid(sessionId) {
  const row = await getCheckoutSession(sessionId);
  if (!row) return;
  row.status = 'paid';
  row.updated_at = nowISO();
  await setJSON(`checkout:${sessionId}`, row);
}

async function getMessages(chatId, limit = 12) {
  const messages = await getJSON(messagesKey(chatId), []);
  return (Array.isArray(messages) ? messages : []).slice(-limit);
}

async function addMessage(chatId, role, text, telegramMessageId = null) {
  const messages = await getJSON(messagesKey(chatId), []);
  messages.push({ role, text, telegram_message_id: telegramMessageId, created_at: nowISO() });
  await setJSON(messagesKey(chatId), messages.slice(-MAX_MESSAGES_PER_USER));
}

async function addUserMessageOnce(chatId, text, telegramMessageId) {
  const user = await getUser(chatId);
  if (!user) return false;
  if (telegramMessageId !== null && telegramMessageId !== undefined) {
    const id = String(telegramMessageId);
    user.processed_message_ids = Array.isArray(user.processed_message_ids) ? user.processed_message_ids : [];
    if (user.processed_message_ids.includes(id)) return false;
    user.processed_message_ids.push(id);
    user.processed_message_ids = user.processed_message_ids.slice(-200);
    await saveUser(user);
  }
  await addMessage(chatId, 'user', text, telegramMessageId);
  return true;
}

async function addUsage(chatId, provider, model, fundingMode, inputTokens, outputTokens, raw) {
  const usageKey = `usage:${Date.now()}:${chatId}:${Math.random().toString(16).slice(2)}`;
  await setJSON(usageKey, {
    telegram_chat_id: String(chatId),
    provider,
    model,
    funding_mode: fundingMode,
    input_tokens: Number(inputTokens || 0),
    output_tokens: Number(outputTokens || 0),
    raw,
    created_at: nowISO()
  });
  await addToIndex('usage', usageKey, 2000);
}

async function dailyTokensUsed(chatId) {
  const keys = await readIndex('usage', 2000);
  const today = todayKey();
  let total = 0;
  for (const key of keys) {
    const row = await getJSON(key, null);
    if (!row || row.telegram_chat_id !== String(chatId) || !String(row.created_at || '').startsWith(today)) continue;
    total += Number(row.input_tokens || 0) + Number(row.output_tokens || 0);
  }
  return total;
}

async function addFeedback(chatId, rating, note) {
  const key = `feedback:${Date.now()}:${chatId}:${Math.random().toString(16).slice(2)}`;
  await setJSON(key, { telegram_chat_id: String(chatId), rating, note, created_at: nowISO() });
  await addToIndex('feedback', key, 500);
}

async function addSupportTicket(chatId, note) {
  const key = `support:${Date.now()}:${chatId}:${Math.random().toString(16).slice(2)}`;
  await setJSON(key, {
    telegram_chat_id: String(chatId),
    note: String(note || '').slice(0, 1200),
    status: 'open',
    created_at: nowISO()
  });
  await addToIndex('support', key, 500);
}

async function addLearningSignal(signal) {
  const key = learningKey();
  await setJSON(key, {
    ...signal,
    created_at: nowISO()
  });
  await addToIndex('learning', key, MAX_LEARNING_SIGNALS);
}

async function addCoreLearning(category, note, source = 'manual_admin') {
  const key = coreLearningKey();
  await setJSON(key, {
    category: String(category || 'general').slice(0, 80),
    note: String(note || '').slice(0, 1000),
    source,
    status: 'active',
    created_at: nowISO()
  });
  await addToIndex('core-learning', key, 200);
}

async function activeCoreLearnings(limit = 20) {
  const rows = await rowsFromIndex('core-learning', limit);
  return rows.filter((row) => row.status === 'active' && row.note);
}

async function addSafetyFlag(chatId, source, term, textExcerpt) {
  const key = `safety:${Date.now()}:${chatId}:${Math.random().toString(16).slice(2)}`;
  await setJSON(key, {
    telegram_chat_id: String(chatId),
    source,
    term,
    text_excerpt: String(textExcerpt || '').slice(0, 400),
    resolved_at: null,
    created_at: nowISO()
  });
  await addToIndex('safety', key, 500);
}

async function deleteUser(chatId) {
  await deleteUserData(chatId);
}

async function recentUsers(limit = 100) {
  const ids = await readIndex('users', limit);
  const users = [];
  for (const id of ids) {
    const user = await getUser(id);
    if (user) users.push(user);
  }
  return users;
}

async function rowsFromIndex(indexName, limit = 50) {
  const keys = await readIndex(indexName, limit);
  const rows = [];
  for (const key of keys) {
    const row = await getJSON(key, null);
    if (row) rows.push(row);
  }
  return rows;
}

async function deleteRowsMatching(indexName, limit, predicate) {
  const keys = await readIndex(indexName, limit);
  for (const key of keys) {
    const row = await getJSON(key, null);
    if (row && predicate(row)) await deleteKey(key);
  }
}

async function deleteUserData(chatId, hashedUser = null) {
  const id = String(chatId);
  await deleteKey(userKey(id));
  await deleteKey(apiKeyKey(id));
  await deleteKey(messagesKey(id));
  await deleteRowsMatching('usage', 5000, (row) => row.telegram_chat_id === id);
  await deleteRowsMatching('credits', 5000, (row) => row.telegram_chat_id === id);
  await deleteRowsMatching('feedback', 2000, (row) => row.telegram_chat_id === id);
  await deleteRowsMatching('support', 2000, (row) => row.telegram_chat_id === id);
  await deleteRowsMatching('safety', 2000, (row) => row.telegram_chat_id === id);
  if (hashedUser) await deleteRowsMatching('learning', 5000, (row) => row.user_hash === hashedUser);
}

async function dashboardStats() {
  const users = await recentUsers(1000);
  const usageRows = await rowsFromIndex('usage', 2000);
  const feedbackRows = await rowsFromIndex('feedback', 1000);
  const safetyRows = await rowsFromIndex('safety', 1000);
  const supportRows = await rowsFromIndex('support', 1000);
  const learningRows = await rowsFromIndex('learning', 2000);
  const coreRows = await activeCoreLearnings(200);
  return {
    users: users.length,
    onboarded: users.filter((user) => user.onboarding_completed_at).length,
    byok: users.filter((user) => user.funding_mode === 'byok').length,
    credits: users.filter((user) => user.funding_mode === 'credits').length,
    feedback: feedbackRows.length,
    support: supportRows.filter((row) => row.status !== 'closed').length,
    learning_signals: learningRows.length,
    core_learnings: coreRows.length,
    open_flags: safetyRows.filter((row) => !row.resolved_at).length,
    tokens: usageRows.reduce((sum, row) => sum + Number(row.input_tokens || 0) + Number(row.output_tokens || 0), 0),
    credit_balance_tokens: users.reduce((sum, row) => sum + Number(row.credit_balance_tokens || 0), 0)
  };
}

async function saveWeeklyReport(reportText) {
  const key = `report:${Date.now()}`;
  await setJSON(key, { report_text: reportText, created_at: nowISO() });
  await addToIndex('reports', key, 20);
}

module.exports = {
  nowISO,
  ensureUser,
  getUser,
  saveUser,
  onboardingComplete,
  saveSetupToken,
  getSetupToken,
  tokenIsValid,
  markSetupTokenUsed,
  saveApiKey,
  getApiKey,
  deleteApiKey,
  addCredits,
  consumeCredits,
  addCheckoutSession,
  getCheckoutSession,
  markCheckoutPaid,
  getMessages,
  addMessage,
  addUserMessageOnce,
  addUsage,
  dailyTokensUsed,
  addFeedback,
  addSupportTicket,
  addLearningSignal,
  addCoreLearning,
  activeCoreLearnings,
  addSafetyFlag,
  deleteUser,
  deleteUserData,
  recentUsers,
  rowsFromIndex,
  dashboardStats,
  saveWeeklyReport
};
