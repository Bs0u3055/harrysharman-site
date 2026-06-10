const crypto = require('crypto');
const { isValidEmail, nextWeekday, normaliseEmail } = require('./ai-habit/lib/sequence');
const storage = require('./lib/storage');

const { getJSON, setJSON, addToIndex } = storage;
const connectStorage = storage.connectStorage || (() => {});

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function redirect(location) {
  return {
    statusCode: 303,
    headers: { Location: location },
    body: ''
  };
}

exports.handler = async (event) => {
  connectStorage(event);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const body = parseBody(event);
  if (body['bot-field']) {
    return redirect('/projects/ai-habit/thanks.html');
  }

  const email = normaliseEmail(body.email);
  if (!isValidEmail(email)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: 'Please provide a valid email address.'
    };
  }

  const now = new Date().toISOString();
  const subscriberId = crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
  const key = `ai-habit:subscriber:${subscriberId}`;
  const existing = await getJSON(key, null);
  const subscriber = {
    id: subscriberId,
    email,
    name: String(body.name || '').trim(),
    context: String(body.context || '').trim(),
    track: 'starter-14',
    source: body.source || 'ai-habit-website',
    status: 'active',
    start_date: existing && existing.start_date ? existing.start_date : nextWeekday(new Date()),
    last_sent_day: existing && Number.isFinite(Number(existing.last_sent_day)) ? Number(existing.last_sent_day) : 0,
    ai_coach_interest_answered: Boolean(existing && existing.ai_coach_interest_answered),
    ai_coach_interest_response: existing && existing.ai_coach_interest_response ? existing.ai_coach_interest_response : '',
    ai_coach_interest_price: existing && existing.ai_coach_interest_price ? existing.ai_coach_interest_price : '',
    ai_coach_interest_at: existing && existing.ai_coach_interest_at ? existing.ai_coach_interest_at : '',
    created_at: existing && existing.created_at ? existing.created_at : now,
    updated_at: now
  };

  await setJSON(key, subscriber);
  await addToIndex('ai-habit-subscribers', key, 5000);

  return redirect('/projects/ai-habit/thanks.html');
};
