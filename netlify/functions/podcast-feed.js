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
const PUBLIC_FEED = 'https://harrysharman.com/feed.xml';
const OWNER_EMAIL  = 'harrysharman@gmail.com';
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_SECONDS = 300; // Keep crawlers close to the latest Podbean feed

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
  let patched = xml;

  if (!patched.includes('<itunes:email>')) {
    patched = patched.replace(
      '</itunes:owner>',
      `    <itunes:email>${OWNER_EMAIL}</itunes:email>
    </itunes:owner>`
    );
  }

  // When served from harrysharman.com, keep the feed's self reference aligned
  // with the URL crawlers are actually polling.
  patched = patched.replace(
    '<atom:link href="https://feed.podbean.com/harrysharman/feed.xml" rel="self" type="application/rss+xml"/>',
    `<atom:link href="${PUBLIC_FEED}" rel="self" type="application/rss+xml"/>`
  );

  if (!patched.includes('<lastBuildDate>')) {
    const pubDate = patched.match(/<pubDate>([^<]+)<\/pubDate>/);
    if (pubDate) {
      patched = patched.replace(
        pubDate[0],
        `${pubDate[0]}
    <lastBuildDate>${pubDate[1]}</lastBuildDate>`
      );
    }
  }

  return patched;
}

function lastModifiedFromFeed(xml) {
  const pubDate = xml.match(/<pubDate>([^<]+)<\/pubDate>/);
  if (!pubDate) return null;
  const parsed = new Date(pubDate[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toUTCString();
}

exports.handler = async (event, context) => {
  try {
    const xml = await fetchUpstream(PODBEAN_FEED);
    const patched = patchFeed(xml);
    const lastModified = lastModifiedFromFeed(patched);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'Access-Control-Allow-Origin': '*',
        ...(lastModified ? { 'Last-Modified': lastModified } : {}),
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
