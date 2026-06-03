const querystring = require('querystring');
const { getConfig } = require('./sven/lib/config');
const db = require('./sven/lib/db');
const { saveAndSendWeeklyReport } = require('./sven/lib/reports');
const { escapeHTML, htmlResponse, messagePage } = require('./sven/lib/html');

function requireAdmin(config, token) {
  return config.adminToken && token === config.adminToken;
}

function statCards(stats) {
  return Object.entries(stats)
    .map(([key, value]) => `<div class="card"><strong>${escapeHTML(key.replace(/_/g, ' '))}</strong><br>${escapeHTML(value)}</div>`)
    .join('');
}

function userRows(users) {
  if (!users.length) return '<tr><td colspan="6">No users yet.</td></tr>';
  return users.map((user) => `<tr>
    <td>${escapeHTML(user.display_name)}</td>
    <td>${escapeHTML(user.telegram_chat_id)}</td>
    <td>${user.onboarding_completed_at ? 'yes' : 'no'}</td>
    <td>${escapeHTML(user.funding_mode)}</td>
    <td>${escapeHTML(user.credit_balance_tokens)}</td>
    <td>${escapeHTML(user.updated_at)}</td>
  </tr>`).join('');
}

function genericRows(rows, cols) {
  if (!rows.length) return `<tr><td colspan="${cols.length}">Nothing yet.</td></tr>`;
  return rows.map((row) => `<tr>${cols.map((col) => `<td>${escapeHTML(row[col] || '')}</td>`).join('')}</tr>`).join('');
}

async function adminPage(config, token) {
  const stats = await db.dashboardStats();
  const users = await db.recentUsers(50);
  const feedback = await db.rowsFromIndex('feedback', 20);
  const support = await db.rowsFromIndex('support', 20);
  const flags = await db.rowsFromIndex('safety', 20);
  const reports = await db.rowsFromIndex('reports', 5);
  return htmlResponse(200, 'Sven Admin', `<h1>Sven Admin</h1>
    <div class="grid">${statCards(stats)}</div>

    <h2>Manual Operations</h2>
    <div class="grid">
      <div class="card">
        <h3>Grant credits</h3>
        <form method="post" action="/api/sven-admin">
          <input type="hidden" name="token" value="${escapeHTML(token)}">
          <input type="hidden" name="action" value="grant_credits">
          <label for="telegram_chat_id">Telegram chat ID</label>
          <input id="telegram_chat_id" name="telegram_chat_id" required>
          <label for="tokens">Tokens</label>
          <input id="tokens" name="tokens" type="number" value="250000" required>
          <label for="reason">Reason</label>
          <input id="reason" name="reason" value="manual_admin_grant">
          <button type="submit">Grant credits</button>
        </form>
      </div>
      <div class="card">
        <h3>Weekly report</h3>
        <p>Generate and save the current learning report. If admin Telegram is configured, Sven sends it to you.</p>
        <form method="post" action="/api/sven-admin">
          <input type="hidden" name="token" value="${escapeHTML(token)}">
          <input type="hidden" name="action" value="generate_report">
          <button type="submit">Generate report</button>
        </form>
      </div>
    </div>

    <h2>Users</h2>
    <table><tr><th>Name</th><th>Chat</th><th>Onboarded</th><th>Funding</th><th>Credits</th><th>Updated</th></tr>${userRows(users)}</table>

    <h2>Recent Feedback</h2>
    <table><tr><th>Time</th><th>User</th><th>Rating</th><th>Note</th></tr>${genericRows(feedback, ['created_at', 'telegram_chat_id', 'rating', 'note'])}</table>

    <h2>Support Inbox</h2>
    <table><tr><th>Time</th><th>User</th><th>Status</th><th>Issue</th></tr>${genericRows(support, ['created_at', 'telegram_chat_id', 'status', 'note'])}</table>

    <h2>Safety Flags</h2>
    <table><tr><th>Time</th><th>User</th><th>Term</th><th>Excerpt</th></tr>${genericRows(flags, ['created_at', 'telegram_chat_id', 'term', 'text_excerpt'])}</table>

    <h2>Weekly Reports</h2>
    ${reports.length ? reports.map((row) => `<pre>${escapeHTML(row.report_text)}</pre>`).join('') : '<p>No reports yet.</p>'}`);
}

exports.handler = async (event) => {
  const config = getConfig();
  const queryToken = (event.queryStringParameters || {}).token || '';
  if (event.httpMethod === 'GET') {
    if (!requireAdmin(config, queryToken)) return messagePage('Forbidden', 'Admin token required.', 403);
    return adminPage(config, queryToken);
  }
  if (event.httpMethod !== 'POST') return messagePage('Method not allowed', 'Use GET or POST.', 405);
  const body = querystring.parse(event.body || '');
  const token = String(body.token || '');
  if (!requireAdmin(config, token)) return messagePage('Forbidden', 'Admin token required.', 403);
  if (body.action === 'grant_credits') {
    const chatId = String(body.telegram_chat_id || '').trim();
    const amount = parseInt(body.tokens || '0', 10);
    const user = await db.getUser(chatId);
    if (!user) return messagePage('Unknown user', 'That Telegram chat ID does not exist yet.', 400);
    await db.addCredits(chatId, amount, String(body.reason || 'manual_admin_grant'));
  }
  if (body.action === 'generate_report') {
    await saveAndSendWeeklyReport(config);
  }
  return { statusCode: 303, headers: { Location: `/api/sven-admin?token=${encodeURIComponent(token)}` }, body: '' };
};
