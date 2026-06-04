const { generateToken, decryptText } = require('./crypto');
const db = require('./db');
const { formatQuestion, getQuestion, questionCount } = require('./onboarding');
const { buildChatPrompt, SVEN_SYSTEM_PROMPT } = require('./prompts');
const { callOpenAI, callOpenAIWithImage, transcribeOpenAIAudio } = require('./openai');
const { detectSafetyTerms } = require('./safety');
const { sendMessage, sendTyping, getTelegramFile, downloadTelegramFile } = require('./telegram');
const { learningSignal, userHash } = require('./learning');

const MIN_CREDIT_TOKENS_TO_START = 1500;
const MAX_OUTPUT_TOKENS = 700;
const CREDIT_SAFETY_MARGIN_TOKENS = 5000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SUPPORTED_AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/mpga', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/opus', 'application/ogg', 'video/mp4']);

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

function messageText(message) {
  return String(message.text || message.caption || '').trim();
}

function fileExtension(filePathOrName) {
  const match = String(filePathOrName || '').toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? match[1] : '';
}

function mimeFromName(filePathOrName, fallback = '') {
  const ext = fileExtension(filePathOrName);
  const byExt = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    m4a: 'audio/m4a',
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpga',
    wav: 'audio/wav',
    webm: 'audio/webm'
  };
  return byExt[ext] || fallback || 'application/octet-stream';
}

function filenameFromPath(filePath, fallback) {
  const name = String(filePath || '').split('/').pop() || fallback;
  return name.replace(/[^a-zA-Z0-9._-]/g, '_') || fallback;
}

function largestTelegramPhoto(message) {
  const photos = Array.isArray(message.photo) ? message.photo : [];
  if (!photos.length) return null;
  return photos.slice().sort((a, b) => Number(a.file_size || 0) - Number(b.file_size || 0)).pop();
}

function imageAttachment(message) {
  const photo = largestTelegramPhoto(message);
  if (photo && photo.file_id) {
    return {
      kind: 'image',
      label: 'photo or screenshot',
      fileId: photo.file_id,
      fileSize: Number(photo.file_size || 0),
      mimeType: 'image/jpeg',
      filename: 'telegram-photo.jpg'
    };
  }
  const doc = message.document;
  const mimeType = String(doc && doc.mime_type ? doc.mime_type : '').toLowerCase();
  if (doc && doc.file_id && SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      kind: 'image',
      label: 'image document',
      fileId: doc.file_id,
      fileSize: Number(doc.file_size || 0),
      mimeType,
      filename: doc.file_name || 'telegram-image'
    };
  }
  return null;
}

function audioAttachment(message) {
  if (message.voice && message.voice.file_id) {
    return {
      kind: 'audio',
      label: 'voice note',
      fileId: message.voice.file_id,
      fileSize: Number(message.voice.file_size || 0),
      mimeType: message.voice.mime_type || 'audio/ogg',
      filename: 'telegram-voice.ogg',
      duration: Number(message.voice.duration || 0)
    };
  }
  if (message.audio && message.audio.file_id) {
    const mimeType = String(message.audio.mime_type || '').toLowerCase() || mimeFromName(message.audio.file_name, 'audio/mpeg');
    return {
      kind: 'audio',
      label: 'audio clip',
      fileId: message.audio.file_id,
      fileSize: Number(message.audio.file_size || 0),
      mimeType,
      filename: message.audio.file_name || 'telegram-audio.mp3',
      duration: Number(message.audio.duration || 0)
    };
  }
  const doc = message.document;
  const mimeType = String(doc && doc.mime_type ? doc.mime_type : '').toLowerCase();
  if (doc && doc.file_id && (SUPPORTED_AUDIO_MIME_TYPES.has(mimeType) || SUPPORTED_AUDIO_MIME_TYPES.has(mimeFromName(doc.file_name)))) {
    return {
      kind: 'audio',
      label: 'audio document',
      fileId: doc.file_id,
      fileSize: Number(doc.file_size || 0),
      mimeType: mimeType || mimeFromName(doc.file_name),
      filename: doc.file_name || 'telegram-audio'
    };
  }
  return null;
}

function unsupportedDocument(message) {
  return Boolean(message.document && !imageAttachment(message) && !audioAttachment(message));
}

function dataUrl(bytes, mimeType) {
  return `data:${mimeType || 'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function downloadAttachment(config, attachment, maxBytes) {
  const telegramFile = await getTelegramFile(config, attachment.fileId);
  const reportedSize = Number(telegramFile.file_size || attachment.fileSize || 0);
  if (reportedSize && maxBytes && reportedSize > maxBytes) {
    throw new Error(`File is too large for this beta (${Math.ceil(reportedSize / 1024 / 1024)} MB).`);
  }
  const downloaded = await downloadTelegramFile(config, telegramFile.file_path, maxBytes);
  const mimeType = attachment.mimeType || downloaded.mimeType || mimeFromName(telegramFile.file_path);
  return {
    bytes: downloaded.bytes,
    mimeType,
    filename: filenameFromPath(telegramFile.file_path, attachment.filename || 'telegram-file')
  };
}

async function missingFundingMessage(config, chatId) {
  const url = await setupUrl(config, chatId);
  await sendMessage(config, chatId, `Sven needs your own OpenAI API key before replying. Connect it here:\n\n${url}`);
}

async function requireModelAccess(config, chatId) {
  const user = await db.getUser(chatId);
  if (!db.onboardingComplete(user)) {
    await sendMessage(config, chatId, 'Do the text onboarding first with /start. Once your profile and API key are connected, you can send photos, screenshots, and voice notes.');
    return null;
  }
  const keyRecord = await db.getApiKey(chatId);
  const funding = fundingForUser(config, user, keyRecord);
  if (!funding) {
    await missingFundingMessage(config, chatId);
    return null;
  }
  const used = await db.dailyTokensUsed(chatId);
  if (used >= user.daily_token_limit) {
    await sendMessage(config, chatId, "You have hit today's Sven token limit. Annoying, but the guardrail is doing its job. Send /status to check usage.");
    return null;
  }
  return { user, keyRecord, funding };
}

function apiKeyForFunding(config, funding, keyRecord) {
  return keyRecord ? decryptText(config.svenSecret, keyRecord.key_ciphertext) : funding.apiKey;
}

async function processTelegramUpdate(config, update) {
  const message = update.message || update.edited_message;
  if (!message) return;
  const text = messageText(message);
  const image = imageAttachment(message);
  const audio = audioAttachment(message);
  const hasUnsupportedDocument = unsupportedDocument(message);
  if (!text && !image && !audio && !hasUnsupportedDocument) return;
  const chat = message.chat || {};
  const chatId = String(chat.id);
  const displayName = chat.first_name || chat.username || '';
  await db.ensureUser(chatId, displayName, config);
  for (const term of detectSafetyTerms(text)) {
    await db.addSafetyFlag(chatId, 'user', term, text);
    await db.addLearningSignal(learningSignal(config, chatId, 'safety', term, text, 'redacted_safety_excerpt'));
  }
  if (text.startsWith('/') && !image && !audio) {
    await processCommand(config, chatId, text);
  } else if (image) {
    await processImage(config, chatId, text, image, message.message_id);
  } else if (audio) {
    await processAudio(config, chatId, text, audio, message.message_id);
  } else if (hasUnsupportedDocument) {
    await processUnsupportedDocument(config, chatId);
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
    await sendMessage(config, chatId, 'You are onboarded. Send me a food log, training update, question, or plan request. Give me the real version, not the Instagram version.');
    return;
  }
  await sendMessage(config, chatId, `Welcome to Sven. I am going to ask a few questions so the coaching is actually useful, not laminated gym-poster advice.\n\n${formatQuestion(user.onboarding_index)}`);
}

async function setup(config, chatId) {
  const url = await setupUrl(config, chatId);
  await sendMessage(config, chatId, `Set up Sven here by connecting your own OpenAI API key. This keeps your usage on your account and keeps Harry out of the bill-paying business, which is healthier for everyone involved.\n\n${url}`);
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
    await sendMessage(config, chatId, 'No profile answers saved yet. Send /start and I will ask the useful questions first.');
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
  await sendMessage(config, chatId, 'Your stored API key has been removed. Sensible housekeeping.');
}

async function deleteMe(config, chatId, rest) {
  if (rest !== 'confirm') {
    await sendMessage(config, chatId, 'To delete your Sven data, send:\n/delete_me confirm');
    return;
  }
  await db.deleteUserData(chatId, userHash(config, chatId));
  await sendMessage(config, chatId, 'Your Sven data has been deleted. Clean slate.');
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
  await sendMessage(config, chatId, 'Feedback saved. Useful. That helps sharpen Sven Core.');
}

async function support(config, chatId, rest) {
  if (!rest) {
    await sendMessage(config, chatId, 'Use: /bug what happened, what you expected, and anything you tapped or typed before it broke.');
    return;
  }
  await db.addSupportTicket(chatId, rest);
  await db.addLearningSignal(learningSignal(config, chatId, 'support', 'open_ticket', rest, 'user_submitted_support'));
  await sendMessage(config, chatId, 'Logged in the Sven support inbox. Annoying, but useful. You can keep using Sven, or send /bug again if something else breaks.');
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
    await sendMessage(config, chatId, 'I need a clear yes before we continue. Boring boundary, important boundary.');
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
    await sendMessage(config, chatId, 'Onboarding complete. Good. Next step: send /setup and connect your own OpenAI API key so we can get to the useful bit.');
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

async function ensureCreditReserve(config, chatId, user, funding, prompt) {
  if (funding.mode !== 'credits') return true;
  const estimatedTokens = estimatePromptTokens(prompt) + MAX_OUTPUT_TOKENS + CREDIT_SAFETY_MARGIN_TOKENS;
  if (Number(user.credit_balance_tokens || 0) >= estimatedTokens) return true;
  const url = await setupUrl(config, chatId);
  await sendMessage(config, chatId, `Your Sven credit balance is too low for the next safe reply.\n\nBalance: ${user.credit_balance_tokens} tokens\nEstimated reserve needed: ${estimatedTokens} tokens\n\nTop up or connect your own OpenAI key here:\n${url}`);
  return false;
}

async function storeAssistantReply(config, chatId, funding, result) {
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

async function processUnsupportedDocument(config, chatId) {
  await sendMessage(config, chatId, 'For this beta, send Sven text, a Telegram voice note, or a photo/screenshot. Health export files are not wired in yet. Screenshots of Apple Health, Google Fit, workouts, sleep, weight trends, or food work nicely.');
}

async function processImage(config, chatId, text, attachment, telegramMessageId = null) {
  const access = await requireModelAccess(config, chatId);
  if (!access) return;
  const { user, keyRecord, funding } = access;
  const summary = `${attachment.label} received${text ? ` with caption: ${text}` : ' with no caption'}`;
  const inserted = await db.addUserMessageOnce(chatId, summary, telegramMessageId);
  if (!inserted) return;
  await db.addLearningSignal(learningSignal(config, chatId, 'media', 'image_message', text || '[image without caption]', 'redacted_image_caption_only'));
  await sendTyping(config, chatId);

  let image;
  try {
    image = await downloadAttachment(config, attachment, MAX_IMAGE_BYTES);
  } catch (error) {
    await sendMessage(config, chatId, 'I could not read that image: ' + error.message + '\n\nTry a normal screenshot or photo under 8 MB.');
    return;
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(String(image.mimeType || '').toLowerCase())) {
    await sendMessage(config, chatId, 'I can read JPEG, PNG, WEBP, or GIF images in this beta. Try sending the screenshot as a normal Telegram photo.');
    return;
  }

  const recent = await db.getMessages(chatId, 12);
  const coreLearnings = await db.activeCoreLearnings(20);
  const latest = [
    `The user sent a ${attachment.label}.`,
    text ? `Caption/context: ${text}` : 'No caption/context was provided.',
    'Read the visible image carefully. If it is food, estimate calories and macros with uncertainty and ask for weights/volumes when that would materially improve accuracy. If it is an Apple Health, Google Fit, workout, sleep, weight, heart-rate, or recovery screenshot, extract only what is visible and connect it to the user profile, fatigue, sleep debt, training, nutrition, and goals. If it is travel, hotel, restaurant, or schedule context, adapt training and food choices to that constraint. Do not pretend to see data that is not visible.'
  ].join('\n');
  const prompt = buildChatPrompt(user, recent, latest, 12000, coreLearnings);
  if (!(await ensureCreditReserve(config, chatId, user, funding, prompt))) return;

  let result;
  try {
    const apiKey = apiKeyForFunding(config, funding, keyRecord);
    result = await callOpenAIWithImage(apiKey, funding.model, SVEN_SYSTEM_PROMPT, prompt, dataUrl(image.bytes, image.mimeType), MAX_OUTPUT_TOKENS);
  } catch (error) {
    await sendMessage(config, chatId, 'Sven could not analyse that image: ' + error.message);
    return;
  }
  await storeAssistantReply(config, chatId, funding, result);
}

async function processAudio(config, chatId, text, attachment, telegramMessageId = null) {
  const access = await requireModelAccess(config, chatId);
  if (!access) return;
  const { user, keyRecord, funding } = access;
  const summary = `${attachment.label} received${text ? ` with caption: ${text}` : ' with no caption'}`;
  const inserted = await db.addUserMessageOnce(chatId, summary, telegramMessageId);
  if (!inserted) return;
  await sendTyping(config, chatId);

  let audio;
  let transcriptResult;
  try {
    audio = await downloadAttachment(config, attachment, MAX_AUDIO_BYTES);
    const audioMime = String(audio.mimeType || '').toLowerCase();
    if (!SUPPORTED_AUDIO_MIME_TYPES.has(audioMime) && !SUPPORTED_AUDIO_MIME_TYPES.has(mimeFromName(audio.filename))) {
      throw new Error('Unsupported audio type. Telegram voice notes work best.');
    }
    const apiKey = apiKeyForFunding(config, funding, keyRecord);
    transcriptResult = await transcribeOpenAIAudio(apiKey, audio, config.openaiTranscriptionModel);
  } catch (error) {
    await sendMessage(config, chatId, 'I could not transcribe that audio: ' + error.message + '\n\nTry a shorter Telegram voice note.');
    return;
  }

  await db.addUsage(chatId, funding.provider, config.openaiTranscriptionModel, funding.mode, transcriptResult.usage.input_tokens, transcriptResult.usage.output_tokens, transcriptResult.raw);
  if (funding.mode === 'credits') {
    await db.consumeCredits(chatId, Number(transcriptResult.usage.input_tokens || 0) + Number(transcriptResult.usage.output_tokens || 0), 'audio_transcription');
  }

  const transcript = transcriptResult.text;
  const combinedText = `${text ? `Voice note caption/context: ${text}\n\n` : ''}Voice note transcript:\n${transcript}`;
  await db.updateUserMessageText(chatId, telegramMessageId, combinedText);
  await db.addLearningSignal(learningSignal(config, chatId, 'audio', 'voice_note_transcript', combinedText, 'redacted_voice_transcript'));
  for (const term of detectSafetyTerms(transcript)) {
    await db.addSafetyFlag(chatId, 'user', term, transcript);
    await db.addLearningSignal(learningSignal(config, chatId, 'safety', term, transcript, 'redacted_safety_excerpt'));
  }

  const recent = await db.getMessages(chatId, 12);
  const coreLearnings = await db.activeCoreLearnings(20);
  const prompt = buildChatPrompt(user, recent, combinedText, 12000, coreLearnings);
  if (!(await ensureCreditReserve(config, chatId, user, funding, prompt))) return;

  let result;
  try {
    const apiKey = apiKeyForFunding(config, funding, keyRecord);
    result = await callOpenAI(apiKey, funding.model, SVEN_SYSTEM_PROMPT, prompt, MAX_OUTPUT_TOKENS);
  } catch (error) {
    await sendMessage(config, chatId, 'Sven could not call the model after transcribing that audio: ' + error.message);
    return;
  }
  await storeAssistantReply(config, chatId, funding, result);
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
    await sendMessage(config, chatId, "You have hit today's Sven token limit. Annoying, but the guardrail is doing its job. Send /status to check usage.");
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
