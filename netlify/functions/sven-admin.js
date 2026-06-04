const querystring = require('querystring');
const { getConfig } = require('./sven/lib/config');
const db = require('./sven/lib/db');
const { saveAndSendWeeklyReport } = require('./sven/lib/reports');
const { connectStorage } = require('./sven/lib/storage');
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

function usageRows(rows) {
  if (!rows.length) return '<tr><td colspan="7">Nothing yet.</td></tr>';
  return rows.map((row) => {
    const total = Number(row.input_tokens || 0) + Number(row.output_tokens || 0);
    return `<tr>
      <td>${escapeHTML(row.created_at)}</td>
      <td>${escapeHTML(row.telegram_chat_id)}</td>
      <td>${escapeHTML(row.funding_mode)}</td>
      <td>${escapeHTML(row.model)}</td>
      <td>${escapeHTML(row.input_tokens)}</td>
      <td>${escapeHTML(row.output_tokens)}</td>
      <td>${escapeHTML(total)}</td>
    </tr>`;
  }).join('');
}

function autoLearningRows(rows) {
  if (!rows.length) return '<tr><td colspan="6">Nothing yet.</td></tr>';
  return rows.map((row) => `<tr>
    <td>${escapeHTML(row.created_at)}</td>
    <td>${escapeHTML(row.status)}</td>
    <td>${escapeHTML(row.input_signal_count)}</td>
    <td>${escapeHTML(row.promoted_count)}</td>
    <td>${escapeHTML(row.skipped_count)}</td>
    <td>${escapeHTML(row.summary)}</td>
  </tr>`).join('');
}

function creditOperationsCard(config, token) {
  if (!config.enablePrepaidCredits) {
    return `<div class="card">
      <h3>Prepaid credits</h3>
      <p>Disabled for this beta. Friends use their own OpenAI API keys, so usage and costs stay with them.</p>
    </div>`;
  }
  return `<div class="card">
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
  </div>`;
}

async function adminPage(config, token) {
  const stats = await db.dashboardStats();
  const users = await db.recentUsers(50);
  const usage = await db.rowsFromIndex('usage', 30);
  const credits = await db.rowsFromIndex('credits', 30);
  const checkouts = await db.rowsFromIndex('checkout', 30);
  const feedback = await db.rowsFromIndex('feedback', 20);
  const support = await db.rowsFromIndex('support', 20);
  const flags = await db.rowsFromIndex('safety', 20);
  const learning = await db.rowsFromIndex('learning', 30);
  const coreLearnings = await db.activeCoreLearnings(20);
  const autoLearningRuns = await db.recentAutoLearningRuns(10);
  const reports = await db.rowsFromIndex('reports', 5);
  return htmlResponse(200, 'Sven Admin', `<h1>Sven Admin</h1>
    <div class="grid">${statCards(stats)}</div>

    <h2>Manual Operations</h2>
    <div class="grid">
      ${creditOperationsCard(config, token)}
      <div class="card">
        <h3>Weekly report</h3>
        <p>Generate and save the current learning report. If admin Telegram is configured, Sven sends it to you.</p>
        <form method="post" action="/api/sven-admin">
          <input type="hidden" name="token" value="${escapeHTML(token)}">
          <input type="hidden" name="action" value="generate_report">
          <button type="submit">Generate report</button>
        </form>
      </div>
      <div class="card">
        <h3>Add Sven Core learning</h3>
        <p>Use this only for reviewed lessons that should apply to every user.</p>
        <form method="post" action="/api/sven-admin">
          <input type="hidden" name="token" value="${escapeHTML(token)}">
          <input type="hidden" name="action" value="add_core_learning">
          <label for="category">Category</label>
          <input id="category" name="category" value="coaching">
          <label for="note">Reviewed lesson</label>
          <textarea id="note" name="note" required></textarea>
          <button type="submit">Add to Sven Core</button>
        </form>
      </div>
    </div>

    <h2>Users</h2>
    <table><tr><th>Name</th><th>Chat</th><th>Onboarded</th><th>Funding</th><th>Credits</th><th>Updated</th></tr>${userRows(users)}</table>

    <h2>Recent Usage</h2>
    <p>Rows with funding mode "credits" used Harry's central OpenAI key and should have a matching paid credit grant. Rows with "byok" used the user's own OpenAI key.</p>
    <table><tr><th>Time</th><th>User</th><th>Funding</th><th>Model</th><th>Input</th><th>Output</th><th>Total</th></tr>${usageRows(usage)}</table>

    <h2>Credit Ledger</h2>
    <p>Positive rows are credit grants. Stripe grants include a Stripe session ID. Negative rows are model usage deductions.</p>
    <table><tr><th>Time</th><th>User</th><th>Delta tokens</th><th>Reason</th><th>Stripe session</th></tr>${genericRows(credits, ['created_at', 'telegram_chat_id', 'delta_tokens', 'reason', 'stripe_session_id'])}</table>

    <h2>Stripe Checkout Sessions</h2>
    <p>A user is funded only after a session moves from created to paid through the signed Stripe webhook.</p>
    <table><tr><th>Time</th><th>User</th><th>Session</th><th>Pack</th><th>Tokens</th><th>Status</th><th>Updated</th></tr>${genericRows(checkouts, ['created_at', 'telegram_chat_id', 'stripe_session_id', 'pack_name', 'credit_tokens', 'status', 'updated_at'])}</table>

    <h2>Recent Feedback</h2>
    <table><tr><th>Time</th><th>User</th><th>Rating</th><th>Note</th></tr>${genericRows(feedback, ['created_at', 'telegram_chat_id', 'rating', 'note'])}</table>

    <h2>Learning Queue</h2>
    <p>Redacted shared signals for review. These are not used in user chats until you add a reviewed lesson to Sven Core.</p>
    <table><tr><th>Time</th><th>User hash</th><th>Source</th><th>Signal</th><th>Privacy</th><th>Excerpt</th></tr>${genericRows(learning, ['created_at', 'user_hash', 'source', 'signal', 'privacy', 'text_excerpt'])}</table>

    <h2>Sven Core Learnings</h2>
    <table><tr><th>Time</th><th>Category</th><th>Source</th><th>Status</th><th>Note</th></tr>${genericRows(coreLearnings, ['created_at', 'category', 'source', 'status', 'note'])}</table>

    <h2>Automatic Learning Runs</h2>
    <p>Daily behind-the-scenes distillation of anonymised beta signals into safe, general Sven Core lessons.</p>
    <table><tr><th>Time</th><th>Status</th><th>Signals</th><th>Promoted</th><th>Skipped</th><th>Summary</th></tr>${autoLearningRows(autoLearningRuns)}</table>

    <h2>Support Inbox</h2>
    <table><tr><th>Time</th><th>User</th><th>Status</th><th>Issue</th></tr>${genericRows(support, ['created_at', 'telegram_chat_id', 'status', 'note'])}</table>

    <h2>Safety Flags</h2>
    <table><tr><th>Time</th><th>User</th><th>Term</th><th>Excerpt</th></tr>${genericRows(flags, ['created_at', 'telegram_chat_id', 'term', 'text_excerpt'])}</table>

    <h2>Weekly Reports</h2>
    ${reports.length ? reports.map((row) => `<pre>${escapeHTML(row.report_text)}</pre>`).join('') : '<p>No reports yet.</p>'}`);
}

exports.handler = async (event) => {
  connectStorage(event);
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
    if (!config.enablePrepaidCredits) return messagePage('Prepaid credits disabled', 'Manual credit grants are disabled for the BYOK beta.', 400);
    const chatId = String(body.telegram_chat_id || '').trim();
    const amount = parseInt(body.tokens || '0', 10);
    const user = await db.getUser(chatId);
    if (!user) return messagePage('Unknown user', 'That Telegram chat ID does not exist yet.', 400);
    await db.addCredits(chatId, amount, String(body.reason || 'manual_admin_grant'));
  }
  if (body.action === 'generate_report') {
    await saveAndSendWeeklyReport(config);
  }
  if (body.action === 'add_core_learning') {
    const note = String(body.note || '').trim();
    if (!note) return messagePage('Missing note', 'Add a reviewed lesson before saving to Sven Core.', 400);
    await db.addCoreLearning(String(body.category || 'coaching'), note);
  }
  return { statusCode: 303, headers: { Location: `/api/sven-admin?token=${encodeURIComponent(token)}` }, body: '' };
};
