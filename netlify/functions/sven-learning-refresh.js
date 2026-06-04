const { schedule } = require('@netlify/functions');
const { getConfig } = require('./sven/lib/config');
const { autoRefreshCoreLearnings } = require('./sven/lib/autolearning');

async function run() {
  const config = getConfig();
  const result = await autoRefreshCoreLearnings(config);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, result })
  };
}

exports.handler = schedule('0 6 * * *', run);
exports.run = run;
