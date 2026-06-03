const fs = require('fs/promises');
const path = require('path');

const LOCAL_DIR = path.join(process.cwd(), '.sven-data');

function keyToFilename(key) {
  return encodeURIComponent(key).replace(/%/g, '_') + '.json';
}

async function localPath(key) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  return path.join(LOCAL_DIR, keyToFilename(key));
}

async function blobStore() {
  if (!process.env.NETLIFY) return null;
  const { getStore } = await import('@netlify/blobs');
  return getStore('sven');
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

async function deleteKey(key) {
  const store = await blobStore();
  if (store) {
    await store.delete(key);
    return;
  }
  try {
    await fs.unlink(await localPath(key));
  } catch {
    // Already gone.
  }
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
  getJSON,
  setJSON,
  deleteKey,
  updateJSON,
  addToIndex,
  readIndex
};

