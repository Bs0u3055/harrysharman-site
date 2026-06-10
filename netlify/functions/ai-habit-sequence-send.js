const {
  MAX_STARTER_DAY,
  businessDayNumber,
  dateOnly,
  feedbackEmailBlock,
  feedbackTextBlock,
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

async function runSequence(event, options = {}) {
  connectStorage(event);

  const today = options.today || dateOnly(new Date());
  const live = process.env.AI_HABIT_SEQUENCE_LIVE === 'true';
  const dailyLimit = Math.max(1, Math.min(100, Number(process.env.AI_HABIT_DAILY_SEND_LIMIT || 90)));
  let liveSendCount = 0;
  const subscriberKeys = await readIndex('ai-habit-subscribers', 5000);
  let activeSubscriberCount = 0;
  const results = [];

  for (const key of subscriberKeys) {
    const subscriber = await getJSON(key, null);
    if (!subscriber || subscriber.status !== 'active') continue;
    activeSubscriberCount += 1;

    const day = businessDayNumber(subscriber.start_date, today);
    if (day < 1) {
      results.push({ email: subscriber.email, status: 'not_started', start_date: subscriber.start_date });
      continue;
    }
    if (day > MAX_STARTER_DAY) {
      subscriber.status = 'completed_starter';
      subscriber.updated_at = new Date().toISOString();
      await setJSON(key, subscriber);
      results.push({ email: subscriber.email, status: 'completed_starter' });
      continue;
    }
    if (Number(subscriber.last_sent_day || 0) >= day) {
      results.push({ email: subscriber.email, status: 'already_sent', day });
      continue;
    }

    const email = await loadDay(day);
    const subject = formatEmailSubject(day, email.subject);
    const unsubscribeUrl = `https://harrysharman.com/.netlify/functions/ai-habit-unsubscribe?id=${encodeURIComponent(subscriber.id)}`;
    const html = email.html.replace(
      '</main>',
      `${feedbackEmailBlock({ day, subscriberId: subscriber.id, track: 'starter' })}<p style="font-size:12px;line-height:1.5;color:#5b514b;margin-top:26px;">No longer want these? <a href="${unsubscribeUrl}" style="color:#2434ff;">Unsubscribe from The AI Habit starter sequence</a>.</p></main>`
    );
    const text = `${email.text}\n\n${feedbackTextBlock({ day, subscriberId: subscriber.id, track: 'starter' })}\n\nUnsubscribe: ${unsubscribeUrl}`;

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
      subscriber.last_sent_day = day;
      subscriber.last_sent_at = new Date().toISOString();
      subscriber.updated_at = subscriber.last_sent_at;
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
    subscriber_count: activeSubscriberCount,
    total_subscriber_records: subscriberKeys.length,
    results
  };
  await setJSON(`ai-habit:sequence-run:${run.created_at}`, run);
  await setJSON('ai-habit:sequence-run:latest', run);
  return run;
}

exports.runSequence = runSequence;

exports.handler = async (event) => {
  const run = await runSequence(event);
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
      subscriber_count: run.subscriber_count,
      total_subscriber_records: run.total_subscriber_records,
      result_count: run.results.length,
      storage: diagnostics || undefined
    })
  };
};
