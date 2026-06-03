const db = require('./db');
const { sendMessage } = require('./telegram');

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unset';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function formatCounts(counts) {
  return Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(', ') || 'none';
}

async function buildWeeklyReport() {
  const stats = await db.dashboardStats();
  const feedback = await db.rowsFromIndex('feedback', 50);
  const flags = await db.rowsFromIndex('safety', 50);
  const users = await db.recentUsers(100);
  const ratings = countBy(feedback, 'rating');
  const funding = countBy(users, 'funding_mode');
  const lines = [
    'Sven weekly learning report',
    '',
    `Users: ${stats.users}`,
    `Onboarded: ${stats.onboarded}`,
    `Funding modes: ${formatCounts(funding)}`,
    `Total model tokens: ${stats.tokens}`,
    `Outstanding prepaid token balance: ${stats.credit_balance_tokens}`,
    `Feedback count: ${stats.feedback}`,
    `Feedback mix: ${formatCounts(ratings)}`,
    `Open safety flags: ${stats.open_flags}`,
    '',
    'Recent feedback themes:'
  ];
  if (feedback.length) {
    for (const row of feedback.slice(0, 10)) lines.push(`- ${row.rating}: ${String(row.note || '').slice(0, 180)}`);
  } else {
    lines.push('- No feedback yet.');
  }
  lines.push('', 'Recent safety flags:');
  if (flags.length) {
    for (const row of flags.slice(0, 10)) lines.push(`- ${row.term}: ${String(row.text_excerpt || '').slice(0, 160)}`);
  } else {
    lines.push('- No safety flags.');
  }
  lines.push('', 'Suggested operator actions:', '- Review wrong/unsafe feedback before changing Sven Core.', '- Tighten prompts only when the same failure repeats.', '- Keep prepaid credit packs conservative until real cost data is visible.');
  return lines.join('\n');
}

async function saveAndSendWeeklyReport(config) {
  const report = await buildWeeklyReport();
  await db.saveWeeklyReport(report);
  if (config.adminTelegramChatId && config.telegramBotToken) {
    await sendMessage(config, config.adminTelegramChatId, report.slice(0, 3900));
  }
  return report;
}

module.exports = {
  buildWeeklyReport,
  saveAndSendWeeklyReport
};

