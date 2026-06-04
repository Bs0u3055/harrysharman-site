const crypto = require('crypto');

function userHash(config, chatId) {
  const secret = config.svenSecret || 'sven-beta';
  return crypto.createHmac('sha256', secret).update(String(chatId)).digest('hex').slice(0, 16);
}

function redactText(value, maxChars = 900) {
  let text = String(value || '').trim();
  text = text.replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted_api_key]');
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted_email]');
  text = text.replace(/\b(?:\+?\d[\d\s().-]{8,}\d)\b/g, '[redacted_phone]');
  text = text.replace(/(token|secret|key)=([^&\s]+)/gi, '$1=[redacted]');
  text = text.replace(/\s+/g, ' ');
  return text.slice(0, maxChars);
}

function learningSignal(config, chatId, source, signal, text, privacy = 'redacted_user_input', extra = {}) {
  return {
    user_hash: userHash(config, chatId),
    source,
    signal,
    privacy,
    text_excerpt: redactText(text),
    review_status: 'new',
    ...extra
  };
}

module.exports = {
  userHash,
  redactText,
  learningSignal
};
