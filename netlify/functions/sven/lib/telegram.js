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

async function getTelegramFile(config, fileId) {
  return telegramAPI(config.telegramBotToken, 'getFile', { file_id: fileId });
}

async function downloadTelegramFile(config, filePath, maxBytes) {
  if (!config.telegramBotToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  if (!filePath) throw new Error('Telegram did not return a downloadable file path.');
  const response = await fetch(`https://api.telegram.org/file/bot${config.telegramBotToken}/${filePath}`);
  if (!response.ok) throw new Error(`Telegram file download failed with HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (maxBytes && contentLength && contentLength > maxBytes) {
    throw new Error(`File is too large for this beta (${Math.ceil(contentLength / 1024 / 1024)} MB).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (maxBytes && bytes.length > maxBytes) {
    throw new Error(`File is too large for this beta (${Math.ceil(bytes.length / 1024 / 1024)} MB).`);
  }
  return {
    bytes,
    mimeType: response.headers.get('content-type') || '',
    byteLength: bytes.length
  };
}

module.exports = {
  telegramAPI,
  sendMessage,
  sendTyping,
  setWebhook,
  getTelegramFile,
  downloadTelegramFile
};
