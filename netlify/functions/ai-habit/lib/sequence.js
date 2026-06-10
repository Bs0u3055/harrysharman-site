const fs = require('fs/promises');
const path = require('path');

const CONTENT_DIR = path.join(process.cwd(), 'data', 'ai-habit-sequence');
const MAX_STARTER_DAY = 14;
const MAX_PAID_DAY = 90;

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(email));
}

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWeekday(date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function nextWeekday(from = new Date()) {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  while (!isWeekday(date)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dateOnly(date);
}

function businessDayNumber(startDate, todayDate) {
  const start = parseDateOnly(startDate);
  const today = parseDateOnly(todayDate);
  if (!start || !today || today < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= today) {
    if (isWeekday(cursor)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function addBusinessDays(startDateValue, businessDaysToAdd) {
  const start = parseDateOnly(startDateValue);
  if (!start) return nextWeekday(new Date());
  const cursor = new Date(start);
  let added = 0;
  while (added < businessDaysToAdd) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWeekday(cursor)) added += 1;
  }
  return dateOnly(cursor);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitSubject(content, fallbackTitle) {
  const lines = String(content || '').split(/\r?\n/);
  const first = lines[0] || '';
  if (first.toUpperCase().startsWith('SUBJECT:')) {
    return {
      subject: first.replace(/^SUBJECT:\s*/i, '').trim(),
      body: lines.slice(1).join('\n').trim()
    };
  }
  return {
    subject: fallbackTitle || 'The AI Habit',
    body: String(content || '').trim()
  };
}

function renderEmailHtml(day, subject, body) {
  const blocks = String(body || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const safe = escapeHtml(block).replace(/\n/g, '<br>');
      if (/^[A-Z0-9 ,.'&/-]+:$/.test(block) && block.length < 80) {
        return `<h2 style="font-size:18px;line-height:1.25;margin:28px 0 10px;color:#120d0a;">${safe}</h2>`;
      }
      return `<p style="font-size:16px;line-height:1.62;margin:0 0 18px;color:#241b16;">${safe}</p>`;
    })
    .join('\n');

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fefcf7;color:#120d0a;font-family:Arial,Helvetica,sans-serif;">
    <main style="max-width:680px;margin:0 auto;padding:32px 22px;">
      <div style="display:inline-block;border:2px solid #120d0a;background:#ffd84d;padding:7px 10px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">The AI Habit / Day ${day}</div>
      <h1 style="font-size:34px;line-height:1.04;margin:22px 0 18px;color:#120d0a;">${escapeHtml(subject)}</h1>
      ${blocks}
      <hr style="border:0;border-top:2px solid #120d0a;margin:34px 0 18px;">
      <p style="font-size:13px;line-height:1.5;color:#5b514b;">You are receiving this because you asked to start The AI Habit. This is a practical LLM workout, not legal, medical, financial, or employer-specific advice.</p>
    </main>
  </body>
</html>`;
}

async function loadDay(day) {
  const dayLabel = String(day).padStart(2, '0');
  const file = path.join(CONTENT_DIR, `day_${dayLabel}.json`);
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  const { subject, body } = splitSubject(data.content, data.title);
  return {
    day,
    title: data.title || subject,
    subject,
    text: body,
    html: renderEmailHtml(day, subject, body)
  };
}

function formatEmailSubject(day, subject) {
  const clean = String(subject || '').trim();
  if (/^AI Gym Day\s+\d+:/i.test(clean)) return clean;
  if (/^The AI Habit Day\s+\d+:/i.test(clean)) return clean;
  return `The AI Habit Day ${day}: ${clean || 'Your AI workout'}`;
}

function feedbackUrl({ day, rating, subscriberId, track = 'starter' }) {
  const params = new URLSearchParams({
    day: String(day),
    rating,
    track
  });
  if (subscriberId) params.set('sid', subscriberId);
  return `https://harrysharman.com/projects/ai-habit/feedback/?${params.toString()}`;
}

function feedbackEmailBlock({ day, subscriberId, track = 'starter' }) {
  const upUrl = feedbackUrl({ day, rating: 'up', subscriberId, track });
  const downUrl = feedbackUrl({ day, rating: 'down', subscriberId, track });
  return `<div style="border:2px solid #120d0a;background:#fff;margin:30px 0 0;padding:16px;">
        <p style="font-size:14px;line-height:1.45;color:#241b16;margin:0 0 12px;font-weight:700;">Was this lesson useful?</p>
        <a href="${upUrl}" style="display:inline-block;border:2px solid #120d0a;background:#ffd84d;color:#120d0a;text-decoration:none;font-size:13px;font-weight:700;padding:9px 11px;margin:0 8px 8px 0;">Thumbs up</a>
        <a href="${downUrl}" style="display:inline-block;border:2px solid #120d0a;background:#fefcf7;color:#120d0a;text-decoration:none;font-size:13px;font-weight:700;padding:9px 11px;margin:0 0 8px 0;">Thumbs down</a>
        <p style="font-size:12px;line-height:1.45;color:#5b514b;margin:4px 0 0;">One tap opens a feedback page with this lesson prefilled. Comments are optional, but useful.</p>
      </div>`;
}

function feedbackTextBlock({ day, subscriberId, track = 'starter' }) {
  return [
    'Was this lesson useful?',
    `Thumbs up: ${feedbackUrl({ day, rating: 'up', subscriberId, track })}`,
    `Thumbs down: ${feedbackUrl({ day, rating: 'down', subscriberId, track })}`
  ].join('\n');
}

async function sendWithResend({ to, subject, html, text, headers }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AI_HABIT_FROM || process.env.RESEND_FROM;
  if (!apiKey) throw new Error('RESEND_API_KEY is missing');
  if (!from) throw new Error('AI_HABIT_FROM or RESEND_FROM is missing');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
      headers,
      reply_to: process.env.AI_HABIT_REPLY_TO || process.env.RESEND_REPLY_TO || undefined
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Resend failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

module.exports = {
  MAX_PAID_DAY,
  MAX_STARTER_DAY,
  addBusinessDays,
  businessDayNumber,
  dateOnly,
  feedbackEmailBlock,
  feedbackTextBlock,
  feedbackUrl,
  formatEmailSubject,
  isValidEmail,
  loadDay,
  nextWeekday,
  normaliseEmail,
  sendWithResend
};
