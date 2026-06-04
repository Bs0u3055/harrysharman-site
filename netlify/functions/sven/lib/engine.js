const { generateToken, decryptText } = require('./crypto');
const db = require('./db');
const { formatQuestion, getQuestion, questionCount } = require('./onboarding');
const { buildChatPrompt, SVEN_SYSTEM_PROMPT } = require('./prompts');
const { callOpenAI } = require('./openai');
const { detectSafetyTerms } = require('./safety');
const { sendMessage, sendTyping } = require('./telegram');
const { learningSignal, userHash } = require('./learning');

const MIN_CREDIT_TOKENS_TO_START = 1500;
const MAX_OUTPUT_TOKENS = 700;
const CREDIT_SAFETY_MARGIN_TOKENS = 5000;

async function setupUrl(config, chatId) {
  const token = generateToken(24);
  await db.saveSetupToken(token, chatId, config.setupTokenTtlMinutes);
  return `${config.publicBaseUrl}/api/sven-setup?token=${encodeURIComponent(token)}`;
}

function commandHelp() {
  return [
    'Sven commands:',
    '/start - start or resume onboarding',
    '/setup - connect your own OpenAI key',
    '/status - check setup and usage',
    '/credits - check prepaid credit mode',
    '/profile - show saved profile',
    '/bug what broke - send a problem to the Sven support inbox',
    '/restart_onboarding - redo the profile questions',
    '/delete_key - remove your API key',
    '/delete_me confirm - delete your Sven data',
    '/feedback good|bad|wrong|unsafe note - send feedback'
  ].join('\n');
}

async function processTelegramUpdate(config, update) {
  const message = update.message || update.edited_message;
  if (!message || !message.text) return;
  const text = String(message.text || '').trim();
  if (!text) return;
  const chat = message.chat || {};
  const chatId = String(chat.id);
  const displayName = chat.first_name || chat.username || '';
  await db.ensureUser(chatId, displayName, config);
  for (const term of detectSafetyTerms(text)) {
    await db.addSafetyFlag(chatId, 'user', term, text);
    await db.addLearningSignal(learningSignal(config, chatId, 'safety', term, text, 'redacted_safety_excerpt'));
  }
  if (text.startsWith('/')) {
    await processCommand(config, chatId, text);
  } else {
    await processText(config, chatId, text, message.message_id);
  }
}

async function processCommand(config, chatId, text) {
  const [rawCommand, ...restParts] = text.split(' ');
  const command = rawCommand.toLowerCase();
  const rest = restParts.join(' ').trim();
  if (command === '/start') return start(config, chatId);
  if (command === '/setup') return setup(config, chatId);
  if (command === '/help') return sendMessage(config, chatId, commandHelp());
  if (command === '/status') return status(config, chatId);
  if (command === '/credits') return credits(config, chatId);
  if (command === '/profile') return profile(config, chatId);
  if (command === '/bug' || command === '/support' || command === '/broken') return support(config, chatId, rest);
  if (command === '/restart_onboarding') return restartOnboarding(config, chatId);
  if (command === '/delete_key') return deleteKey(config, chatId);
  if (command === '/delete_me') return deleteMe(config, chatId, rest);
  if (command === '/feedback') return feedback(config, chatId, rest);
  return sendMessage(config, chatId, 'I do not know that command yet. Send /help for the current list.');
}

async function start(config, chatId) {
  const user = await db.getUser(chatId);
  if (db.onboardingComplete(user)) {
    await sendMessage(config, chatId, 'You are onboarded. Send me a food log, training update, question, or plan request.');
    return;
  }
  await sendMessage(config, chatId, `Welcome to Sven. I need a proper starting profile first.\n\n${formatQuestion(user.onboarding_index)}`);
}

async function setup(config, chatId) {
  const url = await setupUrl(config, chatId);
  await sendMessage(config, chatId, `Set up Sven here by connecting your own OpenAI API key:\n\n${url}`);
}

async function status(config, chatId) {
  const user = await db.getUser(chatId);
  const key = await db.getApiKey(chatId);
  const used = await db.dailyTokensUsed(chatId);
  const onboarding = db.onboardingComplete(user) ? 'complete' : `in progress (${user.onboarding_index}/${questionCount()})`;
  const keyText = key ? `connected, ending ${key.key_last4}` : 'not connected';
  const creditText = config.enablePrepaidCredits ? `${user.credit_balance_tokens} tokens` : 'disabled for this beta';
  await sendMessage(config, chatId, `Onboarding: ${onboarding}\nFunding: ${user.funding_mode}\nAPI key: ${keyText}\nPrepaid credits: ${creditText}\nModel: ${user.preferred_model}\nToday tokens: ${used} / ${user.daily_token_limit}`);
}

async function credits(config, chatId) {
  const user = await db.getUser(chatId);
  const url = await setupUrl(config, chatId);
  if (!config.enablePrepaidCredits) {
    await sendMessage(config, chatId, `Prepaid credits are disabled for this beta. Sven runs on your own OpenAI API key.\n\nConnect or update your key here:\n${url}`);
    return;
  }
  await sendMessage(config, chatId, `Credit balance: ${user.credit_balance_tokens} tokens.\n\nAdd credits or connect your own API key here:\n${url}`);
}

async function profile(config, chatId) {
  const user = await db.getUser(chatId);
  const answers = user && user.answers ? user.answers : {};
  const keys = Object.keys(answers);
  if (!keys.length) {
    await sendMessage(config, chatId, 'No profile answers saved yet. Send /start to begin.');
    return;
  }
  const lines = ['Saved profile:'];
  for (const key of keys) lines.push(`- ${key.replace(/_/g, ' ')}: ${answers[key]}`);
  await sendMessage(config, chatId, lines.join('\n'));
}

async function restartOnboarding(config, chatId) {
  const user = await db.getUser(chatId);
  user.answers = {};
  user.onboarding_index = 0;
  user.onboarding_completed_at = null;
  await db.saveUser(user);
  await sendMessage(config, chatId, `Onboarding reset.\n\n${formatQuestion(0)}`);
}

async function deleteKey(config, chatId) {
  await db.deleteApiKey(chatId);
  await sendMessage(config, chatId, 'Your stored API key has been removed.');
}

async function deleteMe(config, chatId, rest) {
  if (rest !== 'confirm') {
    await sendMessage(config, chatId, 'To delete your Sven data, send:\n/delete_me confirm');
    return;
  }
  await db.deleteUserData(chatId, userHash(config, chatId));
  await sendMessage(config, chatId, 'Your Sven data has been deleted.');
}

async function feedback(config, chatId, rest) {
  if (!rest) {
    await sendMessage(config, chatId, 'Use: /feedback good|bad|wrong|unsafe your note');
    return;
  }
  const [ratingRaw, ...noteParts] = rest.split(' ');
  const rating = String(ratingRaw || '').toLowerCase();
  if (!['good', 'bad', 'wrong', 'unsafe'].includes(rating)) {
    await sendMessage(config, chatId, 'Feedback rating must be good, bad, wrong, or unsafe.');
    return;
  }
  const note = noteParts.join(' ').trim();
  await db.addFeedback(chatId, rating, note);
  await db.addLearningSignal(learningSignal(config, chatId, 'feedback', rating, note, 'user_submitted_feedback'));
  await sendMessage(config, chatId, 'Feedback saved. That helps improve Sven Core.');
}

async function support(config, chatId, rest) {
  if (!rest) {
    await sendMessage(config, chatId, 'Use: /bug what happened, what you expected, and anything you tapped or typed before it broke.');
    return;
  }
  await db.addSupportTicket(chatId, rest);
  await db.addLearningSignal(learningSignal(config, chatId, 'support', 'open_ticket', rest, 'user_submitted_support'));
  await sendMessage(config, chatId, 'Logged in the Sven support inbox. You can keep using Sven, or send /bug again if you notice another issue.');
}

async function answerOnboarding(config, chatId, user, text) {
  const index = Number(user.onboarding_index || 0);
  const question = getQuestion(index);
  if (!question) {
    user.onboarding_index = questionCount();
    user.onboarding_completed_at = user.onboarding_completed_at || new Date().toISOString();
    await db.saveUser(user);
    await sendMessage(config, chatId, 'Onboarding complete. Send /setup to connect your own OpenAI API key.');
    return;
  }
  if (question.id === 'consent_boundary' && !['yes', 'y', 'agree', 'i agree'].includes(text.trim().toLowerCase())) {
    await sendMessage(config, chatId, 'I need a clear yes before Sven can continue. This keeps the beta in a general wellness lane.');
    return;
  }
  user.answers = user.answers || {};
  user.answers[question.id] = text.trim();
  user.onboarding_index = index + 1;
  if (user.onboarding_index >= questionCount()) user.onboarding_completed_at = user.onboarding_completed_at || new Date().toISOString();
  await db.saveUser(user);
  await db.addLearningSignal(learningSignal(
    config,
    chatId,
    'onboarding',
    question.id,
    question.private ? '' : text,
    question.private ? 'private_omitted' : 'redacted_profile_answer',
    { private_field: Boolean(question.private) }
  ));
  if (user.onboarding_index >= questionCount()) {
    await sendMessage(config, chatId, 'Onboarding complete. Next step: send /setup and connect your own OpenAI API key.');
    return;
  }
  await sendMessage(config, chatId, formatQuestion(user.onboarding_index));
}

function fundingForUser(config, user, keyRecord) {
  if (keyRecord) return { mode: 'byok', provider: keyRecord.provider, model: keyRecord.model, apiKey: null };
  if (config.enablePrepaidCredits && user.credit_balance_tokens >= MIN_CREDIT_TOKENS_TO_START && config.centralOpenAIKey) {
    return { mode: 'credits', provider: 'openai', model: user.preferred_model, apiKey: config.centralOpenAIKey };
  }
  return null;
}

function estimatePromptTokens(prompt) {
  return Math.ceil(String(prompt || '').length / 4);
}

async function processText(config, chatId, text, telegramMessageId = null) {
  let user = await db.getUser(chatId);
  if (!db.onboardingComplete(user)) return answerOnboarding(config, chatId, user, text);
  const keyRecord = await db.getApiKey(chatId);
  const funding = fundingForUser(config, user, keyRecord);
  if (!funding) {
    const url = await setupUrl(config, chatId);
    await sendMessage(config, chatId, `Sven needs your own OpenAI API key before replying. Connect it here:\n\n${url}`);
    return;
  }
  const used = await db.dailyTokensUsed(chatId);
  if (used >= user.daily_token_limit) {
    await sendMessage(config, chatId, "You have hit today's Sven token limit. Send /status to check usage.");
    return;
  }
  const inserted = await db.addUserMessageOnce(chatId, text, telegramMessageId);
  if (!inserted) return;
  await db.addLearningSignal(learningSignal(config, chatId, 'message', 'user_message', text, 'redacted_user_input'));
  const recent = await db.getMessages(chatId, 12);
  const coreLearnings = await db.activeCoreLearnings(20);
  const prompt = buildChatPrompt(user, recent, text, 12000, coreLearnings);
  if (funding.mode === 'credits') {
    const estimatedTokens = estimatePromptTokens(prompt) + MAX_OUTPUT_TOKENS + CREDIT_SAFETY_MARGIN_TOKENS;
    if (Number(user.credit_balance_tokens || 0) < estimatedTokens) {
      const url = await setupUrl(config, chatId);
      await sendMessage(config, chatId, `Your Sven credit balance is too low for the next safe reply.\n\nBalance: ${user.credit_balance_tokens} tokens\nEstimated reserve needed: ${estimatedTokens} tokens\n\nTop up or connect your own OpenAI key here:\n${url}`);
      return;
    }
  }
  await sendTyping(config, chatId);
  let result;
  try {
    const apiKey = keyRecord ? decryptText(config.svenSecret, keyRecord.key_ciphertext) : funding.apiKey;
    result = await callOpenAI(apiKey, funding.model, SVEN_SYSTEM_PROMPT, prompt, MAX_OUTPUT_TOKENS);
  } catch (error) {
    await sendMessage(config, chatId, 'Sven could not call the model: ' + error.message);
    return;
  }
  const reply = result.text;
  await db.addMessage(chatId, 'assistant', reply);
  await db.addLearningSignal(learningSignal(config, chatId, 'message', 'assistant_response', reply, 'redacted_assistant_output'));
  await db.addUsage(chatId, funding.provider, funding.model, funding.mode, result.usage.input_tokens, result.usage.output_tokens, result.raw);
  if (funding.mode === 'credits') {
    await db.consumeCredits(chatId, Number(result.usage.input_tokens || 0) + Number(result.usage.output_tokens || 0), 'model_usage');
  }
  for (const term of detectSafetyTerms(reply)) {
    await db.addSafetyFlag(chatId, 'assistant', term, reply);
    await db.addLearningSignal(learningSignal(config, chatId, 'safety', term, reply, 'redacted_safety_excerpt'));
  }
  await sendMessage(config, chatId, reply);
}

module.exports = {
  processTelegramUpdate,
  setupUrl,
  commandHelp
};
