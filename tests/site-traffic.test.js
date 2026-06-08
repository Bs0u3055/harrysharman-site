const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');

const storageDir = path.join(process.cwd(), '.site-traffic-data');

async function resetStorage() {
  await fs.rm(storageDir, { recursive: true, force: true });
}

async function testTrafficTrackingAndWeeklyReport() {
  await resetStorage();
  const {
    recordPageview,
    buildWeeklyTrafficReport,
    normalizePath
  } = require('../netlify/functions/lib/site-traffic');

  assert.strictEqual(normalizePath('https://harrysharman.com/index.html?utm_source=test'), '/');
  assert.strictEqual(normalizePath('/posts/example/index.html'), '/posts/example/');

  await recordPageview(
    {
      path: '/',
      url: 'https://harrysharman.com/',
      title: 'Harry Sharman',
      referrer: '',
      screen_width: 1440,
      language: 'en-GB'
    },
    { headers: { 'user-agent': 'Mozilla/5.0 Chrome/125 Safari/537.36', 'x-nf-country': 'gb' } },
    { now: new Date('2026-06-08T09:00:00.000Z') }
  );
  await recordPageview(
    {
      path: '/podcast.html',
      url: 'https://harrysharman.com/podcast.html?utm_source=linkedin&utm_medium=social',
      title: 'Briefly AI',
      referrer: 'https://www.linkedin.com/feed/',
      screen_width: 390,
      language: 'en-GB'
    },
    { headers: { 'user-agent': 'Mozilla/5.0 iPhone Mobile Safari/604.1', 'x-nf-country': 'gb' } },
    { now: new Date('2026-06-08T10:00:00.000Z') }
  );
  await recordPageview(
    { path: '/old.html', url: 'https://harrysharman.com/old.html', title: 'Old' },
    { headers: { 'user-agent': 'Mozilla/5.0 Firefox/120.0', 'x-nf-country': 'us' } },
    { now: new Date('2026-06-01T10:00:00.000Z') }
  );
  const bot = await recordPageview(
    { path: '/bot.html', url: 'https://harrysharman.com/bot.html', title: 'Bot' },
    { headers: { 'user-agent': 'Googlebot/2.1' } },
    { now: new Date('2026-06-08T10:30:00.000Z') }
  );

  assert.strictEqual(bot.tracked, false);
  const { report, summary } = await buildWeeklyTrafficReport({
    now: new Date('2026-06-08T12:00:00.000Z'),
    days: 7
  });
  assert.strictEqual(summary.pageviews, 2);
  assert.strictEqual(summary.previous_pageviews, 1);
  assert(report.includes('Website traffic weekly overview'));
  assert(report.includes('/podcast.html - 1'));
  assert(report.includes('linkedin.com - 1'));
  assert(report.includes('GB - 2'));
}

async function testTrafficReportEndpoint() {
  await resetStorage();
  const { handler } = require('../netlify/functions/site-traffic-report');
  const open = await handler({ httpMethod: 'GET', queryStringParameters: {} });
  assert.strictEqual(open.statusCode, 200);
  assert(open.body.includes('Website traffic weekly overview'));

  const oldToken = process.env.SITE_TRAFFIC_REPORT_TOKEN;
  process.env.SITE_TRAFFIC_REPORT_TOKEN = 'secret';
  try {
    const denied = await handler({ httpMethod: 'GET', queryStringParameters: {} });
    assert.strictEqual(denied.statusCode, 403);
    const ok = await handler({ httpMethod: 'GET', queryStringParameters: { token: 'secret' } });
    assert.strictEqual(ok.statusCode, 200);
  } finally {
    if (oldToken === undefined) delete process.env.SITE_TRAFFIC_REPORT_TOKEN;
    else process.env.SITE_TRAFFIC_REPORT_TOKEN = oldToken;
  }
}

async function run() {
  await testTrafficTrackingAndWeeklyReport();
  await testTrafficReportEndpoint();
  await resetStorage();
  console.log('site traffic tests ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
