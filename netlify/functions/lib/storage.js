const fs = require('fs/promises');
const path = require('path');

let lastBlobError = '';

function connectStorage(event) {
  if (!event || !event.blobs) return;
  try {
    const { connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    lastBlobError = '';
  } catch {
    lastBlobError = 'connectLambda failed';
  }
}

function localDir() {
  const cwd = process.cwd();
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || cwd === '/var/task' || cwd.startsWith('/var/task/')) {
    return path.join('/tmp', '.site-traffic-data');
  }
  return path.join(cwd, '.site-traffic-data');
}

function keyToFilename(key) {
  return encodeURIComponent(key).replace(/%/g, '_') + '.json';
}

function hasBlobContext() {
  return Boolean(globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT);
}

async function localPath(key) {
  const dir = localDir();
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, keyToFilename(key));
}

async function blobStore() {
  const explicitSiteId = process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const explicitToken = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  const likelyNetlifyRuntime = Boolean(
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    explicitSiteId
  );
  if (!likelyNetlifyRuntime) return null;
  try {
    const { getStore } = await import('@netlify/blobs');
    if (explicitSiteId && explicitToken) {
      return getStore({ name: 'site-traffic', siteID: explicitSiteId, token: explicitToken });
    }
    if (explicitSiteId && hasBlobContext()) {
      return getStore({ name: 'site-traffic', siteID: explicitSiteId });
    }
    return getStore('site-traffic');
  } catch (error) {
    lastBlobError = error && error.message ? error.message : 'Blob store unavailable';
    return null;
  }
}

async function storageDiagnostics() {
  const store = await blobStore();
  const backend = store ? 'netlify_blobs' : 'local_fallback';
  const key = 'diagnostics:storage_probe';
  const probe = {
    id: Math.random().toString(36).slice(2),
    created_at: new Date().toISOString()
  };
  await setJSON(key, probe);
  const readBack = await getJSON(key, null);
  return {
    backend,
    ok: Boolean(readBack && readBack.id === probe.id),
    has_blob_context: hasBlobContext(),
    local_dir: backend === 'local_fallback' ? localDir() : '',
    last_blob_error: backend === 'local_fallback' ? lastBlobError : ''
  };
}

async function getJSON(key, fallback = null) {
  const store = await blobStore();
  if (store) {
    const value = await store.get(key, { type: 'json' });
    return value === null || value === undefined ? fallback : value;
  }
  try {
    const body = await fs.readFile(await localPath(key), 'utf8');
    return JSON.parse(body);
  } catch {
    return fallback;
  }
}

async function setJSON(key, value) {
  const store = await blobStore();
  if (store) {
    await store.setJSON(key, value);
    return;
  }
  await fs.writeFile(await localPath(key), JSON.stringify(value, null, 2));
}

async function updateJSON(key, fallback, updater) {
  const current = await getJSON(key, fallback);
  const next = await updater(current);
  await setJSON(key, next);
  return next;
}

async function addToIndex(indexName, key, max = 500) {
  await updateJSON('index:' + indexName, [], (items) => {
    const filtered = (Array.isArray(items) ? items : []).filter((item) => item !== key);
    filtered.unshift(key);
    return filtered.slice(0, max);
  });
}

async function readIndex(indexName, max = 100) {
  const items = await getJSON('index:' + indexName, []);
  return (Array.isArray(items) ? items : []).slice(0, max);
}

module.exports = {
  connectStorage,
  storageDiagnostics,
  getJSON,
  setJSON,
  updateJSON,
  addToIndex,
  readIndex
};
