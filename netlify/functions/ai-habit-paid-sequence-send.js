const {
  MAX_PAID_DAY,
  MAX_STARTER_DAY,
  addBusinessDays,
  businessDayNumber,
  dateOnly,
  formatEmailSubject,
  loadDay,
  sendWithResend
} = require('./ai-habit/lib/sequence');
const storage = require('./lib/storage');

const { getJSON, setJSON } = storage;
const connectStorage = storage.connectStorage || (() => {});
const storageDiagnostics = storage.storageDiagnostics || (async () => null);
const readIndex = storage.readIndex || ((indexName, max = 100) => (
  storage.getJSON('index:' + indexName, [])
    .then((items) => (Array.isArray(items) ? items : []).slice(0, max))
));

function paidStartFor(subscriber) {
  if (subscriber.paid_start_date) return subscriber.paid_start_date;
  if (subscriber.start_date) return addBusinessDays(subscriber.start_date, MAX_STARTER_DAY);
  return subscriber.paid_at ? dateOnly(new Date(subscriber.paid_at)) : dateOnly(new Date());
}

async function runPaidSequence(event, options = {}) {
  connectStorage(event);

  const today = options.today || dateOnly(new Date());
  const live = process.env.AI_HABIT_PAID_SEQUENCE_LIVE === 'true';
  const dailyLimit = Math.max(1, Math.min(100, Number(process.env.AI_HABIT_PAID_DAILY_SEND_LIMIT || 90)));
  let liveSendCount = 0;
  const subscriberKeys = await readIndex('ai-habit-subscribers', 5000);
  let paidSubscriberCount = 0;
  const results = [];

  for (const key of subscriberKeys) {
    const subscriber = await getJSON(key, null);
    if (!subscriber || subscriber.status === 'unsubscribed') continue;
    if (subscriber.paid_status !== 'paid' || subscriber.paid_track !== 'founding-90') continue;
    paidSubscriberCount += 1;

    const paidStartDate = paidStartFor(subscriber);
    const paidBusinessDay = businessDayNumber(paidStartDate, today);
    if (paidBusinessDay < 1) {
      results.push({ email: subscriber.email, status: 'paid_not_started', paid_start_date: paidStartDate });
      continue;
    }

    const day = MAX_STARTER_DAY + paidBusinessDay;
    if (day > MAX_PAID_DAY) {
      subscriber.paid_status = 'completed_paid_90';
      subscriber.updated_at = new Date().toISOString();
      await setJSON(key, subscriber);
      results.push({ email: subscriber.email, status: 'completed_paid_90' });
      continue;
    }

    if (Number(subscriber.last_sent_paid_day || MAX_STARTER_DAY) >= day) {
      results.push({ email: subscriber.email, status: 'already_sent', day });
      continue;
    }

    const email = await loadDay(day);
    const subject = formatEmailSubject(day, email.subject);
    const unsubscribeUrl = `https://harrysharman.com/.netlify/functions/ai-habit-unsubscribe?id=${encodeURIComponent(subscriber.id)}`;
    const html = email.html.replace(
      '</main>',
      `<p style="font-size:12px;line-height:1.5;color:#5b514b;margin-top:26px;">No longer want these? <a href="${unsubscribeUrl}" style="color:#2434ff;">Unsubscribe from The AI Habit paid sequence</a>.</p></main>`
    );
    const text = `${email.text}\n\nUnsubscribe: ${unsubscribeUrl}`;

    if (!live) {
      results.push({ email: subscriber.email, status: 'dry_run', day, subject });
      continue;
    }

    if (liveSendCount >= dailyLimit) {
      results.push({ email: subscriber.email, status: 'queued_daily_limit', day });
      continue;
    }

    try {
      const sent = await sendWithResend({
        to: subscriber.email,
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      });
      subscriber.last_sent_paid_day = day;
      subscriber.last_sent_paid_at = new Date().toISOString();
      subscriber.updated_at = subscriber.last_sent_paid_at;
      await setJSON(key, subscriber);
      liveSendCount += 1;
      results.push({ email: subscriber.email, status: 'sent', day, resend_id: sent.id || null });
    } catch (error) {
      results.push({ email: subscriber.email, status: 'error', day, error: error.message });
    }
  }

  const run = {
    created_at: new Date().toISOString(),
    today,
    live,
    daily_limit: dailyLimit,
    live_send_count: liveSendCount,
    paid_subscriber_count: paidSubscriberCount,
    total_subscriber_records: subscriberKeys.length,
    results
  };
  await setJSON(`ai-habit:paid-sequence-run:${run.created_at}`, run);
  await setJSON('ai-habit:paid-sequence-run:latest', run);
  return run;
}

exports.runPaidSequence = runPaidSequence;

exports.handler = async (event) => {
  const run = await runPaidSequence(event);
  const query = event.queryStringParameters || {};
  const diagnostics = query.diagnostics === '1' ? await storageDiagnostics() : null;
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      ok: true,
      live: run.live,
      paid_subscriber_count: run.paid_subscriber_count,
      total_subscriber_records: run.total_subscriber_records,
      result_count: run.results.length,
      storage: diagnostics || undefined
    })
  };
};
