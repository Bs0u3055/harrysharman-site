const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ALLOWED_ORIGIN = 'https://harrysharman.com';
const MAX_Q = 300;

function openAIRequest(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.OpenAIKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Service unavailable' }) };
  }

  let question = '';
  try {
    const body = JSON.parse(event.body || '{}');
    question = (body.question || '').toString().trim().slice(0, MAX_Q);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad request' }) };
  }
  if (!question) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Question required' }) };
  }

  // Load transcript bundle
  let bundle = { episodes: [] };
  try {
    const bundlePath = path.join(__dirname, '../../data/transcripts-bundle.json');
    bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  } catch(e) {
    // Bundle not available — answer from general knowledge about the show
  }

  // Build context from episodes that have content (last 30)
  const episodesWithContent = bundle.episodes.filter(ep => ep.content);
  const contextParts = episodesWithContent.map(ep =>
    `--- Episode: ${ep.date} ---\nTitle: ${ep.title}\n${ep.content}`
  );
  const context = contextParts.join('\n\n');
  const totalEps = bundle.total || bundle.episodes.length;

  const systemPrompt = `You are the Briefly AI archive assistant. Briefly AI is a fully automated daily podcast covering the most important AI news each morning — scripted and voiced by AI, with no humans involved in production.

You have access to ${episodesWithContent.length} episode transcripts from the show's archive (${totalEps} episodes total, running since April 2026).

When answering questions:
- Be specific about what the show has covered — cite dates and episode titles
- If a topic has been covered multiple times, mention the pattern or evolution
- Keep answers concise but substantive (3-6 sentences)
- If the transcripts don't cover the topic, say so honestly
- Write in second person ("Briefly AI has covered...", "The show discussed...")
- Don't make up episodes or topics not in the transcripts

EPISODE TRANSCRIPTS:
${context.slice(0, 80000)}`;

  try {
    const result = await openAIRequest(apiKey, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      max_tokens: 400,
      temperature: 0.5
    });

    const answer = result.choices && result.choices[0] && result.choices[0].message
      ? result.choices[0].message.content.trim()
      : 'No answer available.';

    return { statusCode: 200, headers, body: JSON.stringify({ answer }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Service error' }) };
  }
};
