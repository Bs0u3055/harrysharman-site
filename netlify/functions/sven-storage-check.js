const { getConfig } = require('./sven/lib/config');
const { connectStorage, storageDiagnostics } = require('./sven/lib/storage');

exports.handler = async (event) => {
  connectStorage(event);
  const config = getConfig();
  const token = (event.queryStringParameters || {}).token || '';
  if (!config.adminToken || token !== config.adminToken) {
    return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false }) };
  }
  const diagnostics = await storageDiagnostics();
  return {
    statusCode: diagnostics.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: diagnostics.ok, diagnostics })
  };
};
