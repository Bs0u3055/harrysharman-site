const crypto = require('crypto');
const { isValidEmail, normaliseEmail } = require('./ai-habit/lib/sequence');
const storage = require('./lib/storage');

const { getJSON, setJSON, addToIndex, updateJSON } = storage;
const connectStorage = storage.connectStorage || (() => {});
const storageDiagnostics = storage.storageDiagnostics || (async () => null);

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title, body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${escapeHtml(title)} - The AI Habit</title>
    <style>
      body{margin:0;background:#fefcf7;color:#120d0a;font-family:Arial,Helvetica,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px}
      main{width:min(720px,100%);background:#fff;border:2px solid #120d0a;box-shadow:8px 8px 0 #120d0a;padding:34px}
      h1{font-size:44px;line-height:.95;margin:0 0 16px}
      p{font-size:18px;line-height:1.5;margin:0 0 18px}
      a{color:#2434ff;font-weight:800}
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      ${body}
      <p><a href="/projects/ai-habit/">Back to The AI Habit</a></p>
    </main>
  </body>
</html>`
  };
}

function cleanDay(value) {
  const day = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(day) || day < 1 || day > 90) return 0;
  return day;
}

function cleanResponse(value) {
  const response = String(value || '').trim().toLowerCase();
  return ['yes', 'maybe', 'no'].includes(response) ? response : '';
}

function cleanTrack(value) {
  const track = String(value || '').trim().toLowerCase();
  return ['starter', 'paid'].includes(track) ? track : 'unknown';
}

function cleanPriceBand(value) {
  const band = String(value || '').trim().toLowerCase();
  return ['0', '5', '10', '19', '49', 'employer'].includes(band) ? band : '';
}

function subscriberIdForEmail(email) {
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
}

function subscriberKeyFor(sid, email) {
  const cleanSid = String(sid || '').trim();
  if (/^[a-f0-9]{24}$/i.test(cleanSid)) return `ai-habit:subscriber:${cleanSid}`;
  if (isValidEmail(email)) return `ai-habit:subscriber:${subscriberIdForEmail(email)}`;
  return '';
}

function recordId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function responseLabel(response) {
  if (response === 'yes') return 'interested';
  if (response === 'maybe') return 'possibly interested';
  return 'not interested';
}

async function writeCoachInterest(body, event) {
  const day = cleanDay(body.day);
  const response = cleanResponse(body.response);
  if (!day || !response) {
    return { ok: false, statusCode: 400, error: 'Missing lesson day or AI coach interest answer.' };
  }

  const providedEmail = normaliseEmail(body.email);
  const email = isValidEmail(providedEmail) ? providedEmail : '';
  const sid = String(body.sid || '').trim();
  const subscriberKey = subscriberKeyFor(sid, email);
  const subscriber = subscriberKey ? await getJSON(subscriberKey, null) : null;
  const priceBand = cleanPriceBand(body.price_band);
  const now = new Date().toISOString();
  const id = recordId();
  const record = {
    id,
    created_at: now,
    day,
    response,
    track: cleanTrack(body.track),
    price_band: priceBand,
    comment: String(body.comment || '').trim().slice(0, 4000),
    email,
    subscriber_id: subscriber && subscriber.id ? subscriber.id : (sid && subscriberKey ? sid : ''),
    subscriber_email_known: Boolean(subscriber && subscriber.email),
    source: String(body.source || 'coach-interest-page').trim().slice(0, 80),
    user_agent: event.headers && (event.headers['user-agent'] || event.headers['User-Agent']) || '',
    referrer: event.headers && (event.headers.referer || event.headers.Referer) || ''
  };

  const key = `ai-habit:coach-interest:${id}`;
  await setJSON(key, record);
  await addToIndex('ai-habit-coach-interest', key, 10000);

  await updateJSON('ai-habit:coach-interest-summary', {
    total: 0,
    responses: {},
    price_bands: {},
    by_day: {},
    paid_positive: 0,
    updated_at: now
  }, (summary) => {
    const next = summary && typeof summary === 'object' ? summary : {};
    next.total = Number(next.total || 0) + 1;
    next.responses = next.responses && typeof next.responses === 'object' ? next.responses : {};
    next.price_bands = next.price_bands && typeof next.price_bands === 'object' ? next.price_bands : {};
    next.by_day = next.by_day && typeof next.by_day === 'object' ? next.by_day : {};
    next.responses[response] = Number(next.responses[response] || 0) + 1;
    if (priceBand) next.price_bands[priceBand] = Number(next.price_bands[priceBand] || 0) + 1;

    const dayKey = String(day);
    const currentDay = next.by_day[dayKey] || { yes: 0, maybe: 0, no: 0, latest_at: '' };
    currentDay[response] = Number(currentDay[response] || 0) + 1;
    currentDay.latest_at = now;
    next.by_day[dayKey] = currentDay;

    if (['yes', 'maybe'].includes(response) && priceBand && priceBand !== '0') {
      next.paid_positive = Number(next.paid_positive || 0) + 1;
    } else {
      next.paid_positive = Number(next.paid_positive || 0);
    }
    next.updated_at = now;
    return next;
  });

  if (subscriberKey && subscriber) {
    await updateJSON(subscriberKey, subscriber, (current) => ({
      ...(current || subscriber),
      ai_coach_interest_answered: true,
      ai_coach_interest_response: response,
      ai_coach_interest_price: priceBand,
      ai_coach_interest_comment: record.comment ? record.comment.slice(0, 500) : '',
      ai_coach_interest_at: now,
      updated_at: now
    }));
  }

  return { ok: true, record };
}

exports.writeCoachInterest = writeCoachInterest;

exports.handler = async (event) => {
  connectStorage(event);

  if (event.httpMethod === 'GET') {
    const query = event.queryStringParameters || {};
    if (query.diagnostics === '1') {
      const diagnostics = await storageDiagnostics();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ ok: true, storage: diagnostics })
      };
    }
    return page(
      'Use the coach interest page',
      '<p>The AI coach interest form lives on the site so email link scanners do not accidentally record an answer.</p><p><a href="/projects/ai-habit/coach-interest/">Open the AI coach interest page</a></p>'
    );
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const result = await writeCoachInterest(parseBody(event), event);
    if (!result.ok) {
      return page('Signal needs an answer', `<p>${escapeHtml(result.error)}</p>`, result.statusCode || 400);
    }
    return page(
      'Signal logged',
      `<p>You said you are ${responseLabel(result.record.response)} in an AI coach layer. Thank you. This is exactly the kind of signal that decides whether it gets built.</p>${result.record.price_band ? '<p>Your willingness-to-pay answer was saved too.</p>' : '<p>No willingness-to-pay answer added. That is fine.</p>'}`
    );
  } catch (error) {
    console.error('ai habit coach interest error', error);
    return page('Signal had a wobble', '<p>The answer did not save. Annoying, but fixable.</p>', 500);
  }
};
