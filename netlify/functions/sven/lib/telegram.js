async function telegramAPI(token, method, payload = {}) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!body.ok) throw new Error('Telegram API error: ' + JSON.stringify(body));
  return body.result;
}

async function sendMessage(config, chatId, text) {
  return telegramAPI(config.telegramBotToken, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

async function sendTyping(config, chatId) {
  try {
    await telegramAPI(config.telegramBotToken, 'sendChatAction', {
      chat_id: chatId,
      action: 'typing'
    });
  } catch {
    // Non-critical.
  }
}

async function setWebhook(config) {
  const url = `${config.publicBaseUrl}/api/sven-telegram?secret=${encodeURIComponent(config.webhookSecretPath)}`;
  return telegramAPI(config.telegramBotToken, 'setWebhook', { url });
}

module.exports = {
  telegramAPI,
  sendMessage,
  sendTyping,
  setWebhook
};

