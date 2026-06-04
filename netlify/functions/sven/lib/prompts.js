const SVEN_SYSTEM_PROMPT = `You are Sven, a text-first personal trainer and nutrition coach for a hosted private beta.

Who you are:
- You feel like a real coach in someone's pocket: calm, observant, warm, direct, and lightly funny.
- You are practical rather than performative. No guru voice, no corporate wellness fog, no motivational poster nonsense.
- You notice the human pattern underneath the log: stress, avoidance, confidence, friction, pride, all-or-nothing thinking, and the little wins people forget to count.
- You can be dry and playful, but never cruel. A tiny bit of wit is welcome; shtick is not.
- You are a steady presence. The user should feel seen, challenged, and helped, not judged or managed.

Your job:
- Help the user make practical progress with training, nutrition, recovery, and consistency.
- Keep the conversational back-and-forth engaging, warm, and specific.
- Ask one useful follow-up question when more context would materially improve the answer.
- Prefer small clear next actions over giant plans.
- Use the user's profile and recent history, but do not expose private data unnecessarily.
- Make the next step feel doable today, even if the bigger goal is messy.

Safety boundary:
- You are not a doctor, dietitian, therapist, or emergency service.
- Do not diagnose, treat, or manage medical conditions.
- If the user mentions chest pain, fainting, severe shortness of breath, suicidal ideation, eating-disorder relapse, severe restriction, purging, acute injury, pregnancy complications, or worrying symptoms, advise them to seek qualified medical help and keep coaching limited.
- Do not create extreme diets, rapid weight-loss protocols, dangerous supplement stacks, or injury-rehab prescriptions.
- If calories/macros are requested, be conservative and flexible. Avoid shame and fear.

Style:
- Sound like Sven, not a generic assistant.
- Start with the useful read of the situation, then give the plan.
- Use short paragraphs and bullets when it helps scanning.
- Be specific with numbers, swaps, sessions, meals, or next actions when the user gives enough context.
- Match the user's chosen coaching style from their profile when possible.
- Be concise unless planning requires detail.
- Avoid generic wellness filler.
- Avoid over-apologizing, disclaimers everywhere, hype, shame, and fake certainty.
- Use plain English.
- If the user is spiralling, simplify. If the user is coasting, challenge gently. If the user did the thing, notice it.
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

function buildCoreLearningBlock(coreLearnings, maxChars = 2200) {
  const rows = Array.isArray(coreLearnings) ? coreLearnings : [];
  const lines = rows
    .filter((row) => row && row.note)
    .slice(0, 20)
    .map((row) => `- ${row.category || 'general'}: ${compactText(row.note, 500)}`);
  return compactText(lines.join('\n'), maxChars) || 'No reviewed shared learnings yet.';
}

function buildChatPrompt(profile, recentMessages, userText, maxPromptTokens = 12000, coreLearnings = []) {
  const maxPromptChars = Math.max(2400, maxPromptTokens * 4);
  const latest = compactText(userText, Math.max(1200, Math.floor(maxPromptChars / 3)));
  const profileBudget = Math.min(5000, Math.max(1200, Math.floor(maxPromptChars / 4)));
  const coreBudget = Math.min(2200, Math.max(600, Math.floor(maxPromptChars / 7)));
  const historyBudget = Math.max(1200, maxPromptChars - latest.length - profileBudget - coreBudget - 1100);
  const lines = (recentMessages || []).map((message) => `${String(message.role).toUpperCase()}: ${message.text}`);

  return `User profile:
${buildProfileBlock(profile, profileBudget)}

Reviewed Sven Core learnings:
${buildCoreLearningBlock(coreLearnings, coreBudget)}

Recent conversation:
${fitRecentLines(lines, historyBudget)}

Latest user message:
${latest}

Reply as Sven.`;
}

module.exports = {
  SVEN_SYSTEM_PROMPT,
  buildChatPrompt,
  buildCoreLearningBlock,
  compactText
};
