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

function cleanRating(value) {
  return value === 'down' ? 'down' : (value === 'up' ? 'up' : '');
}

function cleanTrack(value) {
  const track = String(value || '').trim().toLowerCase();
  return ['starter', 'paid'].includes(track) ? track : 'unknown';
}

function subscriberKeyForSid(sid) {
  const clean = String(sid || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(clean)) return '';
  return `ai-habit:subscriber:${clean}`;
}

function feedbackId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

async function writeFeedback(body, event) {
  const day = cleanDay(body.day);
  const rating = cleanRating(body.rating);
  if (!day || !rating) {
    return { ok: false, statusCode: 400, error: 'Missing lesson day or rating.' };
  }

  const sid = String(body.sid || '').trim();
  const subscriberKey = subscriberKeyForSid(sid);
  const subscriber = subscriberKey ? await getJSON(subscriberKey, null) : null;
  const providedEmail = normaliseEmail(body.email);
  const email = isValidEmail(providedEmail) ? providedEmail : '';
  const now = new Date().toISOString();
  const id = feedbackId();
  const record = {
    id,
    created_at: now,
    day,
    rating,
    track: cleanTrack(body.track),
    comment: String(body.comment || '').trim().slice(0, 4000),
    email,
    subscriber_id: sid && subscriberKey ? sid : '',
    subscriber_email_known: Boolean(subscriber && subscriber.email),
    subscriber_track: subscriber && subscriber.track ? subscriber.track : '',
    source: String(body.source || 'feedback-page').trim().slice(0, 80),
    user_agent: event.headers && (event.headers['user-agent'] || event.headers['User-Agent']) || '',
    referrer: event.headers && (event.headers.referer || event.headers.Referer) || ''
  };

  const key = `ai-habit:feedback:${id}`;
  await setJSON(key, record);
  await addToIndex('ai-habit-feedback', key, 10000);

  await updateJSON('ai-habit:feedback-summary', { days: {}, updated_at: now }, (summary) => {
    const next = summary && typeof summary === 'object' ? summary : { days: {} };
    next.days = next.days && typeof next.days === 'object' ? next.days : {};
    const dayKey = String(day);
    const current = next.days[dayKey] || { up: 0, down: 0, comments: 0, latest_at: '' };
    current[rating] = Number(current[rating] || 0) + 1;
    if (record.comment) current.comments = Number(current.comments || 0) + 1;
    current.latest_at = now;
    next.days[dayKey] = current;
    next.updated_at = now;
    return next;
  });

  return { ok: true, record };
}

exports.writeFeedback = writeFeedback;

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
      'Use the feedback page',
      '<p>The feedback form lives on the site so email link scanners do not accidentally record a vote.</p><p><a href="/projects/ai-habit/feedback/">Open lesson feedback</a></p>'
    );
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const result = await writeFeedback(parseBody(event), event);
    if (!result.ok) {
      return page('Feedback needs a lesson', `<p>${escapeHtml(result.error)}</p>`, result.statusCode || 400);
    }
    const label = result.record.rating === 'up' ? 'useful' : 'not useful enough';
    return page(
      'Feedback logged',
      `<p>Marked Day ${result.record.day} as ${label}. Thank you. This is how the sequence gets less vague and more useful.</p>${result.record.comment ? '<p>Your comment was saved too.</p>' : '<p>No comment added. That is fine. A thumb is still signal.</p>'}`
    );
  } catch (error) {
    console.error('ai habit feedback error', error);
    return page('Feedback had a wobble', '<p>The feedback did not save. Annoying, but fixable.</p>', 500);
  }
};
