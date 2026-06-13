async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.TRAFFIC_REPORT_TELEGRAM_CHAT_ID || process.env.ADMIN_TELEGRAM_CHAT_ID || '';
  if (!token || !chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });
  const body = await response.json();
  if (!body.ok) throw new Error('Telegram API error: ' + JSON.stringify(body));
  return true;
}

module.exports = {
  sendTelegram
};
