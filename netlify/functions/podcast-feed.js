/**
 * Netlify Function: Podcast Feed Proxy
 *
 * Replaces the previous feed-proxy.py that ran on Dobby:8080.
 * Fetches the Podbean feed and injects <itunes:email> into <itunes:owner>
 * (required by some podcatchers/Spotify/Apple) before serving.
 *
 * Accessed via:
 *   - https://harrysharman.com/feed.xml
 *   - https://harrysharman.com/.netlify/functions/podcast-feed
 *
 * Migrated from feed-proxy.py 2026-05-26.
 */

const https = require('https');

const PODBEAN_FEED = 'https://feed.podbean.com/harrysharman/feed.xml';
const OWNER_EMAIL  = 'harrysharman@gmail.com';
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 600; // 10 minutes — feed updates infrequently

function fetchUpstream(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Upstream fetch timeout')), FETCH_TIMEOUT_MS);

    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        // Follow one redirect
        return fetchUpstream(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        clearTimeout(timer);
        reject(new Error(`Upstream returned ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function patchFeed(xml) {
  if (xml.includes('<itunes:email>')) return xml;
  return xml.replace(
    '</itunes:owner>',
    `    <itunes:email>${OWNER_EMAIL}</itunes:email>\n    </itunes:owner>`
  );
}

exports.handler = async (event, context) => {
  try {
    const xml = await fetchUpstream(PODBEAN_FEED);
    const patched = patchFeed(xml);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'Access-Control-Allow-Origin': '*',
      },
      body: patched,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'text/plain' },
      body: `Feed proxy error: ${err.message}`,
    };
  }
};
