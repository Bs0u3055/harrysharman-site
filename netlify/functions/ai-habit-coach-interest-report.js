const storage = require('./lib/storage');

const { getJSON, readIndex } = storage;
const connectStorage = storage.connectStorage || (() => {});
const storageDiagnostics = storage.storageDiagnostics || (async () => null);

function allowed(event) {
  const token = process.env.AI_HABIT_COACH_ADMIN_TOKEN || process.env.AI_HABIT_FEEDBACK_ADMIN_TOKEN;
  if (!token) return false;
  const query = event.queryStringParameters || {};
  const header = event.headers && (event.headers.authorization || event.headers.Authorization) || '';
  return query.token === token || header === `Bearer ${token}`;
}

function recommendation(summary, records) {
  const total = Number(summary && summary.total || 0);
  const yes = Number(summary && summary.responses && summary.responses.yes || 0);
  const maybe = Number(summary && summary.responses && summary.responses.maybe || 0);
  const paidPositive = Number(summary && summary.paid_positive || 0);
  const positiveRate = total ? (yes + maybe) / total : 0;
  const comments = records.filter((record) => record.comment && ['yes', 'maybe'].includes(record.response));

  if (paidPositive >= 5 || (total >= 20 && positiveRate >= 0.35 && comments.length >= 3)) {
    return 'Prototype the offer: enough paid-positive signal to design a small manual pilot before building automation.';
  }
  if (total >= 10 && positiveRate < 0.2) {
    return 'Do not build yet: weak signal. Keep asking only at planned checkpoints.';
  }
  return 'Keep collecting signal: not enough evidence to build or kill.';
}

exports.handler = async (event) => {
  connectStorage(event);

  if (!allowed(event)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'Set AI_HABIT_COACH_ADMIN_TOKEN or AI_HABIT_FEEDBACK_ADMIN_TOKEN and provide it to view coach interest.' })
    };
  }

  const query = event.queryStringParameters || {};
  const limit = Math.max(1, Math.min(500, Number.parseInt(query.limit || '100', 10) || 100));
  const keys = await readIndex('ai-habit-coach-interest', limit);
  const records = [];
  for (const key of keys) {
    const record = await getJSON(key, null);
    if (record) records.push(record);
  }
  const summary = await getJSON('ai-habit:coach-interest-summary', {
    total: 0,
    responses: {},
    price_bands: {},
    by_day: {},
    paid_positive: 0
  });
  const diagnostics = query.diagnostics === '1' ? await storageDiagnostics() : null;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      ok: true,
      summary,
      recommendation: recommendation(summary, records),
      records,
      storage: diagnostics || undefined
    })
  };
};
