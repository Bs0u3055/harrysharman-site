const db = require('./db');
const { callOpenAIJSON } = require('./openai');

const AUTO_LEARNING_INSTRUCTIONS = `You are the Sven Core learning distiller.

Return JSON only.

Your job is to read redacted beta signals and propose durable, general coaching lessons for Sven Core.

Rules:
- Promote only general lessons that can safely help many users.
- Never include names, contact details, Telegram IDs, exact private stories, medical specifics, or direct quotes from users.
- Do not promote diagnosis, treatment, injury rehab, eating-disorder coaching, extreme dieting, supplement protocols, or medical advice.
- Do not promote a one-off preference unless it clearly reflects a repeated pattern or a strong product/system lesson.
- Prefer practical coaching rules about friction, context, tracking, tone, food estimation, training adjustment, sleep/recovery, travel constraints, or onboarding.
- Keep each lesson as one sentence, under 280 characters, written as an instruction Sven can follow.
- If there is not enough evidence, return no promotions.

JSON shape:
{
  "summary": "short operator summary",
  "promote": [
    {
      "category": "coaching|nutrition|training|recovery|tracking|tone|safety|onboarding|product",
      "note": "general lesson",
      "confidence": 0.0,
      "supporting_signal_count": 0,
      "rationale": "short reason"
    }
  ],
  "skip": [
    { "reason": "short reason" }
  ]
}`;

function compact(value, maxChars) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxChars ? text : text.slice(0, maxChars - 3).trim() + '...';
}

function normalizeLesson(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasUnsafeLessonText(note) {
  const text = normalizeLesson(note);
  if (!text) return true;
  const blocked = [
    'diagnose',
    'diagnosis',
    'treat condition',
    'medical condition',
    'medication',
    'purging',
    'severe restriction',
    'eating disorder',
    'crash diet',
    'rapid weight loss',
    'supplement stack'
  ];
  return blocked.some((term) => text.includes(term));
}

function duplicateLesson(note, existing) {
  const target = normalizeLesson(note);
  if (!target) return true;
  return existing.some((row) => {
    const current = normalizeLesson(row.note);
    return current === target || (current.length > 40 && target.includes(current)) || (target.length > 40 && current.includes(target));
  });
}

function learningRowsForPrompt(rows) {
  return rows.map((row) => ({
    source: row.source || '',
    signal: row.signal || '',
    privacy: row.privacy || '',
    excerpt: compact(row.text_excerpt || '', 500)
  }));
}

function feedbackRowsForPrompt(rows) {
  return rows.map((row) => ({
    rating: row.rating || '',
    note: compact(row.note || '', 500)
  }));
}

function supportRowsForPrompt(rows) {
  return rows.map((row) => ({
    status: row.status || '',
    note: compact(row.note || '', 500)
  }));
}

function existingRowsForPrompt(rows) {
  return rows.map((row) => ({
    category: row.category || '',
    note: compact(row.note || '', 500),
    source: row.source || ''
  }));
}

function buildAutoLearningInput({ learning, feedback, support, coreLearnings, maxPromotions }) {
  return `Generate JSON Sven Core learning candidates from these redacted sources.

Max promotions: ${maxPromotions}

Existing active Sven Core lessons:
${JSON.stringify(existingRowsForPrompt(coreLearnings), null, 2)}

Recent learning signals:
${JSON.stringify(learningRowsForPrompt(learning), null, 2)}

Recent feedback:
${JSON.stringify(feedbackRowsForPrompt(feedback), null, 2)}

Recent support tickets:
${JSON.stringify(supportRowsForPrompt(support), null, 2)}

Return JSON only.`;
}

function validPromotion(item) {
  const note = compact(item && item.note, 1000);
  const category = compact(item && item.category, 80) || 'coaching';
  const confidence = Number(item && item.confidence);
  const supporting = Number(item && item.supporting_signal_count);
  if (!note || note.length < 24 || note.length > 320) return null;
  if (!Number.isFinite(confidence) || confidence < 0.72) return null;
  if (!Number.isFinite(supporting) || supporting < 2) return null;
  if (hasUnsafeLessonText(note)) return null;
  return {
    category,
    note,
    confidence,
    supporting_signal_count: supporting,
    rationale: compact(item.rationale || '', 500)
  };
}

async function autoRefreshCoreLearnings(config) {
  const learning = await db.rowsFromIndex('learning', 160);
  const feedback = await db.rowsFromIndex('feedback', 80);
  const support = await db.rowsFromIndex('support', 80);
  const coreLearnings = await db.activeCoreLearnings(120);
  const inputSignalCount = learning.length + feedback.length + support.length;

  if (!config.autoPromoteCoreLearnings) {
    const run = {
      status: 'skipped',
      input_signal_count: inputSignalCount,
      summary: 'Automatic Sven Core promotion disabled by configuration.'
    };
    await db.saveAutoLearningRun(run);
    return run;
  }

  if (!config.svenLearningOpenAIKey) {
    const run = {
      status: 'skipped',
      input_signal_count: inputSignalCount,
      summary: 'SVEN_LEARNING_OPENAI_KEY is not configured.'
    };
    await db.saveAutoLearningRun(run);
    return run;
  }

  if (inputSignalCount < Number(config.autoLearningMinSignals || 3)) {
    const run = {
      status: 'skipped',
      input_signal_count: inputSignalCount,
      summary: `Not enough learning signals yet (${inputSignalCount}).`
    };
    await db.saveAutoLearningRun(run);
    return run;
  }

  const maxPromotions = Math.max(1, Math.min(8, Number(config.autoLearningMaxPromotions || 4)));
  const input = buildAutoLearningInput({ learning, feedback, support, coreLearnings, maxPromotions });
  let result;
  try {
    result = await callOpenAIJSON(
      config.svenLearningOpenAIKey,
      config.svenLearningModel,
      AUTO_LEARNING_INSTRUCTIONS,
      input,
      1600
    );
  } catch (error) {
    const run = {
      status: 'failed',
      input_signal_count: inputSignalCount,
      summary: 'Automatic learning model call failed: ' + error.message
    };
    await db.saveAutoLearningRun(run);
    return run;
  }

  const rawPromotions = Array.isArray(result.json && result.json.promote) ? result.json.promote : [];
  const promoted = [];
  const skipped = [];
  for (const raw of rawPromotions.slice(0, maxPromotions)) {
    const candidate = validPromotion(raw);
    if (!candidate) {
      skipped.push({ reason: 'candidate_failed_validation', raw });
      continue;
    }
    if (duplicateLesson(candidate.note, coreLearnings.concat(promoted))) {
      skipped.push({ reason: 'duplicate_or_too_similar', note: candidate.note });
      continue;
    }
    await db.addCoreLearning(candidate.category, candidate.note, 'auto_learning');
    promoted.push(candidate);
  }

  const modelSkip = Array.isArray(result.json && result.json.skip) ? result.json.skip : [];
  const run = {
    status: 'completed',
    promoted_count: promoted.length,
    skipped_count: skipped.length + modelSkip.length,
    input_signal_count: inputSignalCount,
    summary: compact(result.json && result.json.summary, 1800) || `Promoted ${promoted.length} Sven Core lessons.`,
    raw: {
      model: config.svenLearningModel,
      usage: result.usage,
      promoted,
      skipped,
      model_skip: modelSkip.slice(0, 10)
    }
  };
  await db.saveAutoLearningRun(run);
  return run;
}

module.exports = {
  autoRefreshCoreLearnings,
  buildAutoLearningInput,
  normalizeLesson,
  validPromotion
};
