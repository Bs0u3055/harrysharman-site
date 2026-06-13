const { getJSON, setJSON, updateJSON, addToIndex } = require('./storage');
const { sendTelegram } = require('./telegram');

const MAX_EVENTS_PER_DAY = 20000;
const REPORT_DAYS = 7;

function safeString(value, max = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, offset) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

function dayRange(days, end = new Date()) {
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(isoDay(addDays(endDay, -i)));
  return out;
}

function normalizePath(input) {
  let pathname = '/';
  try {
    pathname = new URL(String(input || '/'), 'https://harrysharman.com').pathname || '/';
  } catch {
    pathname = safeString(input || '/', 240).split('?')[0].split('#')[0] || '/';
  }
  if (!pathname.startsWith('/')) pathname = '/' + pathname;
  if (pathname === '/index.html') return '/';
  if (pathname.endsWith('/index.html')) return pathname.slice(0, -10) || '/';
  return pathname.slice(0, 240);
}

function referrerHost(referrer) {
  const raw = safeString(referrer, 500);
  if (!raw) return 'direct';
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    if (!host || host === 'harrysharman.com') return 'internal';
    return host.slice(0, 120);
  } catch {
    return 'unknown';
  }
}

function queryParam(url, name) {
  try {
    return safeString(new URL(String(url || ''), 'https://harrysharman.com').searchParams.get(name), 80);
  } catch {
    return '';
  }
}

function classifyDevice(userAgent, width) {
  const ua = String(userAgent || '').toLowerCase();
  const screenWidth = Number(width || 0);
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua) || (screenWidth > 0 && screenWidth < 760)) return 'mobile';
  return 'desktop';
}

function classifyBrowser(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('chrome/') && !ua.includes('chromium')) return 'chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'safari';
  if (ua.includes('firefox/')) return 'firefox';
  return 'other';
}

function isBot(userAgent) {
  return /bot|crawl|spider|slurp|lighthouse|pagespeed|pingdom|uptime|headlesschrome|preview|facebookexternalhit|twitterbot|linkedinbot|whatsapp/i.test(String(userAgent || ''));
}

function header(headers, names) {
  const lower = {};
  for (const [key, value] of Object.entries(headers || {})) lower[key.toLowerCase()] = value;
  for (const name of names) {
    const value = lower[name.toLowerCase()];
    if (value) return String(value);
  }
  return '';
}

function requestCountry(headers) {
  return safeString(header(headers, ['x-nf-country', 'x-country', 'cf-ipcountry', 'cloudfront-viewer-country']), 12).toUpperCase();
}

function sourceFrom(payload, refHost) {
  const utmSource = queryParam(payload.url, 'utm_source') || safeString(payload.utm_source, 80);
  if (utmSource) return utmSource.toLowerCase();
  if (refHost === 'direct' || refHost === 'internal') return refHost;
  return refHost;
}

async function recordPageview(payload = {}, event = {}, options = {}) {
  const headers = event.headers || {};
  const userAgent = safeString(header(headers, ['user-agent']) || payload.user_agent, 260);
  const path = normalizePath(payload.path || payload.url);
  if (!path || path.startsWith('/api/') || isBot(userAgent)) {
    return { tracked: false, reason: 'ignored' };
  }

  const now = options.now || new Date();
  const day = isoDay(now);
  const refHost = referrerHost(payload.referrer);
  const row = {
    ts: now.toISOString(),
    path,
    title: safeString(payload.title, 180),
    referrer_host: refHost,
    source: sourceFrom(payload, refHost),
    utm_medium: queryParam(payload.url, 'utm_medium') || safeString(payload.utm_medium, 80),
    utm_campaign: queryParam(payload.url, 'utm_campaign') || safeString(payload.utm_campaign, 120),
    device: classifyDevice(userAgent, payload.screen_width),
    browser: classifyBrowser(userAgent),
    country: requestCountry(headers),
    language: safeString(payload.language, 40)
  };

  await updateJSON(`traffic:day:${day}`, { date: day, events: [] }, (bucket) => {
    const events = Array.isArray(bucket && bucket.events) ? bucket.events : [];
    events.push(row);
    return { date: day, events: events.slice(-MAX_EVENTS_PER_DAY) };
  });
  await addToIndex('traffic:days', day, 120);
  return { tracked: true, event: row };
}

async function eventsForDays(days) {
  const buckets = await Promise.all(days.map((day) => getJSON(`traffic:day:${day}`, { date: day, events: [] })));
  return buckets.flatMap((bucket) => Array.isArray(bucket.events) ? bucket.events : []);
}

function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = safeString(typeof field === 'function' ? field(row) : row[field], 140) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function top(counts, limit = 5) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

function pct(value, total) {
  if (!total) return '0%';
  return Math.round((value / total) * 100) + '%';
}

function changeText(current, previous) {
  if (!previous && current) return 'new traffic baseline';
  if (!previous) return 'flat';
  const change = Math.round(((current - previous) / previous) * 100);
  if (change > 0) return `+${change}% vs previous week`;
  if (change < 0) return `${change}% vs previous week`;
  return 'flat vs previous week';
}

function labelForDay(day) {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function summarizeTraffic(events, previousEvents, days) {
  const pageviews = events.length;
  const daily = days.map((day) => ({
    day,
    label: labelForDay(day),
    count: events.filter((row) => String(row.ts || '').startsWith(day)).length
  }));
  const externalEvents = events.filter((row) => !['direct', 'internal', 'unknown'].includes(row.referrer_host));
  return {
    pageviews,
    previous_pageviews: previousEvents.length,
    change: changeText(pageviews, previousEvents.length),
    daily,
    top_pages: top(countBy(events, 'path'), 6),
    top_referrers: top(countBy(externalEvents, 'referrer_host'), 5),
    top_sources: top(countBy(events, 'source'), 5),
    devices: top(countBy(events, 'device'), 4),
    countries: top(countBy(events.filter((row) => row.country), 'country'), 5),
    browsers: top(countBy(events, 'browser'), 4)
  };
}

function formatList(items, total, formatter) {
  if (!items.length) return '- none';
  return items.map((item, index) => {
    const suffix = total ? ` (${pct(item.value, total)})` : '';
    return `${index + 1}. ${formatter ? formatter(item) : item.key} - ${item.value}${suffix}`;
  }).join('\n');
}

function formatTrafficReport(summary, options = {}) {
  const end = options.now || new Date();
  const period = `${labelForDay(summary.daily[0].day)} to ${labelForDay(summary.daily[summary.daily.length - 1].day)}`;
  const lines = [
    'Website traffic weekly overview',
    period,
    '',
    `Pageviews: ${summary.pageviews} (${summary.change})`,
    `Previous week: ${summary.previous_pageviews}`,
    '',
    'Daily rhythm:',
    summary.daily.map((row) => `${row.label}: ${row.count}`).join(' | '),
    '',
    'Top pages:',
    formatList(summary.top_pages, summary.pageviews),
    '',
    'External referrers:',
    formatList(summary.top_referrers, summary.pageviews),
    '',
    'Traffic sources:',
    formatList(summary.top_sources, summary.pageviews),
    '',
    'Devices:',
    formatList(summary.devices, summary.pageviews),
    '',
    'Countries:',
    formatList(summary.countries, summary.pageviews),
    '',
    `Generated: ${end.toISOString()}`
  ];
  if (!summary.pageviews) {
    lines.splice(4, 0, 'No pageviews have been recorded in this window yet. Tracking may have just been installed or traffic may be genuinely quiet.');
  }
  return lines.join('\n');
}

async function buildWeeklyTrafficReport(options = {}) {
  const days = Number(options.days || REPORT_DAYS);
  const now = options.now || new Date();
  const currentDays = dayRange(days, now);
  const previousEnd = addDays(new Date(`${currentDays[0]}T00:00:00.000Z`), -1);
  const previousDays = dayRange(days, previousEnd);
  const events = await eventsForDays(currentDays);
  const previousEvents = await eventsForDays(previousDays);
  const summary = summarizeTraffic(events, previousEvents, currentDays);
  const report = formatTrafficReport(summary, { now });
  return { report, summary };
}

async function saveAndSendTrafficReport(options = {}) {
  const now = options.now || new Date();
  const { report, summary } = await buildWeeklyTrafficReport({ ...options, now });
  const key = `traffic:report:${isoDay(now)}`;
  await setJSON(key, { created_at: now.toISOString(), report, summary });
  await addToIndex('traffic:reports', key, 52);
  await sendTelegram(report.slice(0, 3900));
  return report;
}

module.exports = {
  recordPageview,
  buildWeeklyTrafficReport,
  saveAndSendTrafficReport,
  summarizeTraffic,
  formatTrafficReport,
  normalizePath
};
