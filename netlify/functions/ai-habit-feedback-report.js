const storage = require('./lib/storage');

const { getJSON, readIndex } = storage;
const connectStorage = storage.connectStorage || (() => {});
const storageDiagnostics = storage.storageDiagnostics || (async () => null);

function allowed(event) {
  const token = process.env.AI_HABIT_FEEDBACK_ADMIN_TOKEN;
  if (!token) return false;
  const query = event.queryStringParameters || {};
  const header = event.headers && (event.headers.authorization || event.headers.Authorization) || '';
  return query.token === token || header === `Bearer ${token}`;
}

exports.handler = async (event) => {
  connectStorage(event);

  if (!allowed(event)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'Set AI_HABIT_FEEDBACK_ADMIN_TOKEN and provide it to view feedback.' })
    };
  }

  const query = event.queryStringParameters || {};
  const limit = Math.max(1, Math.min(200, Number.parseInt(query.limit || '50', 10) || 50));
  const keys = await readIndex('ai-habit-feedback', limit);
  const records = [];
  for (const key of keys) {
    const record = await getJSON(key, null);
    if (record) records.push(record);
  }
  const summary = await getJSON('ai-habit:feedback-summary', { days: {} });
  const diagnostics = query.diagnostics === '1' ? await storageDiagnostics() : null;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      ok: true,
      summary,
      records,
      storage: diagnostics || undefined
    })
  };
};
