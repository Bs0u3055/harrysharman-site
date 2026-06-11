const TRANSIENT_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJSON(url, options, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error: { message: text.slice(0, 500) } };
      }
      if (TRANSIENT_STATUS.has(response.status) && attempt < attempts) {
        await sleep(Math.min(500 * attempt, 2000));
        continue;
      }
      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await sleep(Math.min(500 * attempt, 2000));
    }
  }
  throw new Error('OpenAI request failed: ' + (lastError ? lastError.message : 'unknown error'));
}

async function validateOpenAIKey(apiKey) {
  if (!apiKey || !String(apiKey).startsWith('sk-')) {
    throw new Error('That does not look like an OpenAI API key.');
  }
  const { response, body } = await requestJSON('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` }
  }, 2);
  if (!response.ok) {
    const message = body && body.error && body.error.message ? body.error.message : 'OpenAI rejected that key.';
    throw new Error(message + ' Check billing, project access, and the copied value.');
  }
  return true;
}

function outputText(body) {
  const parts = [];
  for (const item of body.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
    }
  }
  if (parts.length) return parts.join('\n').trim();
  return String(body.output_text || '').trim();
}

async function createResponse(apiKey, payload) {
  const { response, body } = await requestJSON('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const message = body && body.error && body.error.message ? body.error.message : 'OpenAI request failed.';
    throw new Error(message);
  }
  if (body.status === 'incomplete') {
    const reason = body.incomplete_details && body.incomplete_details.reason ? body.incomplete_details.reason : 'unknown reason';
    throw new Error('The model response was incomplete: ' + reason);
  }
  const text = outputText(body);
  if (!text) throw new Error('The model returned no text.');
  const usage = body.usage || {};
  return {
    text,
    usage: {
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0
    },
    raw: { id: body.id, status: body.status, usage }
  };
}

async function callOpenAI(apiKey, model, instructions, input, maxOutputTokens = 700) {
  const payload = {
    model,
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    text: { verbosity: 'low' }
  };
  return createResponse(apiKey, payload);
}

async function callOpenAIWithImage(apiKey, model, instructions, inputText, imageDataUrl, maxOutputTokens = 700) {
  const payload = {
    model,
    instructions,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: inputText },
        { type: 'input_image', image_url: imageDataUrl, detail: 'auto' }
      ]
    }],
    max_output_tokens: maxOutputTokens,
    text: { verbosity: 'low' }
  };
  return createResponse(apiKey, payload);
}

async function callOpenAIJSON(apiKey, model, instructions, input, maxOutputTokens = 1200) {
  const payload = {
    model,
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    text: {
      verbosity: 'low',
      format: { type: 'json_object' }
    }
  };
  const result = await createResponse(apiKey, payload);
  try {
    result.json = JSON.parse(result.text);
  } catch (error) {
    throw new Error('The model returned invalid JSON: ' + error.message);
  }
  return result;
}

async function requestMultipartJSON(url, apiKey, form, attempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      });
      const text = await response.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { error: { message: text.slice(0, 500) } };
      }
      if (TRANSIENT_STATUS.has(response.status) && attempt < attempts) {
        await sleep(Math.min(500 * attempt, 2000));
        continue;
      }
      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await sleep(Math.min(500 * attempt, 2000));
    }
  }
  throw new Error('OpenAI audio request failed: ' + (lastError ? lastError.message : 'unknown error'));
}

async function transcribeOpenAIAudio(apiKey, audio, model = 'gpt-4o-mini-transcribe') {
  const form = new FormData();
  const blob = new Blob([audio.bytes], { type: audio.mimeType || 'application/octet-stream' });
  form.append('file', blob, audio.filename || 'telegram-audio.webm');
  form.append('model', model || 'gpt-4o-mini-transcribe');
  form.append('response_format', 'json');
  form.append('prompt', 'Fitness and nutrition coaching voice note for Sven. Preserve meals, exercises, weights, reps, sets, sleep, fatigue, soreness, travel context, body measurements, calories, macros, and dates accurately.');

  const { response, body } = await requestMultipartJSON('https://api.openai.com/v1/audio/transcriptions', apiKey, form);
  if (!response.ok) {
    const message = body && body.error && body.error.message ? body.error.message : 'OpenAI transcription failed.';
    throw new Error(message);
  }
  const text = String(body.text || body.transcript || '').trim();
  if (!text) throw new Error('The transcription returned no text.');
  const usage = body.usage || {};
  return {
    text,
    usage: {
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0
    },
    raw: { model, usage }
  };
}

module.exports = {
  callOpenAI,
  callOpenAIWithImage,
  callOpenAIJSON,
  transcribeOpenAIAudio,
  validateOpenAIKey,
  requestJSON
};
