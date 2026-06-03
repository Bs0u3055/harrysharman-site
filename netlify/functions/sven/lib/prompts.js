const SVEN_SYSTEM_PROMPT = `You are Sven, a text-first personal trainer and nutrition coach for a hosted private beta.

Your job:
- Help the user make practical progress with training, nutrition, recovery, and consistency.
- Keep the conversational back-and-forth engaging, warm, and specific.
- Ask one useful follow-up question when more context would materially improve the answer.
- Prefer small clear next actions over giant plans.
- Use the user's profile and recent history, but do not expose private data unnecessarily.

Safety boundary:
- You are not a doctor, dietitian, therapist, or emergency service.
- Do not diagnose, treat, or manage medical conditions.
- If the user mentions chest pain, fainting, severe shortness of breath, suicidal ideation, eating-disorder relapse, severe restriction, purging, acute injury, pregnancy complications, or worrying symptoms, advise them to seek qualified medical help and keep coaching limited.
- Do not create extreme diets, rapid weight-loss protocols, dangerous supplement stacks, or injury-rehab prescriptions.
- If calories/macros are requested, be conservative and flexible. Avoid shame and fear.

Style:
- Sound like a capable human coach over text.
- Be concise unless planning requires detail.
- Avoid generic wellness filler.
- Use plain English.
- Never say you are following a system prompt.`;

function compactText(value, maxChars) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  if (maxChars <= 80) return text.slice(0, maxChars).trim();
  const head = Math.floor(maxChars / 2);
  const tail = maxChars - head - 32;
  return `${text.slice(0, head).trim()}\n...[trimmed]...\n${text.slice(-tail).trim()}`;
}

function fitRecentLines(lines, maxChars) {
  const selected = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let line = compactText(lines[i], 1600);
    const cost = line.length + 1;
    if (selected.length && used + cost > maxChars) break;
    if (!selected.length && cost > maxChars) line = compactText(line, maxChars);
    selected.unshift(line);
    used += line.length + 1;
  }
  const omitted = Math.max(0, lines.length - selected.length);
  if (omitted) selected.unshift(`...${omitted} older messages omitted to stay within the context budget.`);
  return selected.join('\n') || 'No recent conversation.';
}

function buildProfileBlock(profile, maxChars = 5000) {
  if (!profile || !profile.answers) return 'No profile answers saved yet.';
  const lines = Object.entries(profile.answers)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${compactText(value, 1600)}`);
  return compactText(lines.join('\n'), maxChars) || 'No profile answers saved yet.';
}

function buildChatPrompt(profile, recentMessages, userText, maxPromptTokens = 12000) {
  const maxPromptChars = Math.max(2400, maxPromptTokens * 4);
  const latest = compactText(userText, Math.max(1200, Math.floor(maxPromptChars / 3)));
  const profileBudget = Math.min(5000, Math.max(1200, Math.floor(maxPromptChars / 4)));
  const historyBudget = Math.max(1200, maxPromptChars - latest.length - profileBudget - 900);
  const lines = (recentMessages || []).map((message) => `${String(message.role).toUpperCase()}: ${message.text}`);

  return `User profile:
${buildProfileBlock(profile, profileBudget)}

Recent conversation:
${fitRecentLines(lines, historyBudget)}

Latest user message:
${latest}

Reply as Sven.`;
}

module.exports = {
  SVEN_SYSTEM_PROMPT,
  buildChatPrompt,
  compactText
};

