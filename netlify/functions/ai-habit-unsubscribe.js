const storage = require('./lib/storage');

const { getJSON, setJSON } = storage;
const connectStorage = storage.connectStorage || (() => {});

function html(message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>The AI Habit</title>
    <style>
      body{margin:0;background:#fefcf7;color:#120d0a;font-family:Arial,Helvetica,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px}
      main{max-width:680px;border:2px solid #120d0a;background:#fff;box-shadow:8px 8px 0 #120d0a;padding:34px}
      h1{font-size:42px;line-height:1;margin:0 0 14px}
      p{font-size:18px;line-height:1.5;margin:0 0 12px}
      a{color:#2434ff;font-weight:700}
    </style>
  </head>
  <body>
    <main>
      <h1>The AI Habit</h1>
      <p>${message}</p>
      <p><a href="/projects/ai-habit/">Back to The AI Habit</a></p>
    </main>
  </body>
</html>`;
}

exports.handler = async (event) => {
  connectStorage(event);
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id || !/^[a-f0-9]{24}$/.test(id)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html('That unsubscribe link is not valid.')
    };
  }

  const key = `ai-habit:subscriber:${id}`;
  const subscriber = await getJSON(key, null);
  if (!subscriber) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html('That subscription was not found.')
    };
  }

  subscriber.status = 'unsubscribed';
  subscriber.unsubscribed_at = new Date().toISOString();
  subscriber.updated_at = subscriber.unsubscribed_at;
  await setJSON(key, subscriber);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html('You have been unsubscribed from The AI Habit starter sequence.')
  };
};
