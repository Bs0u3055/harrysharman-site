const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'data', 'ai-habit-sequence');
const GENERATED_AT = '2026-06-09T18:45:00.000Z';
const FIRST_PAID_DAY = 15;
const LAST_PAID_DAY = 90;

const SOURCE_INFLUENCES = [
  {
    label: 'OpenAI prompt engineering best practices',
    url: 'https://help.openai.com/en/articles/10032626-prompt-engineering-best-practices-for-chatgpt',
    use: 'clarity, context, specificity, iteration'
  },
  {
    label: 'Anthropic prompt engineering overview',
    url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview',
    use: 'examples, structure, role prompting, prompt chaining'
  },
  {
    label: 'Microsoft 365 Copilot prompt framework',
    url: 'https://support.microsoft.com/en-us/microsoft-365-copilot/write-a-great-prompt-in-microsoft-365-copilot',
    use: 'goal, context, source, expectations'
  },
  {
    label: 'Google AI Essentials',
    url: 'https://www.coursera.org/specializations/ai-essentials-google',
    use: 'workplace productivity, responsible use, practical outputs'
  },
  {
    label: 'Fogg Behavior Model',
    url: 'https://www.behaviormodel.org/',
    use: 'motivation, ability, prompt design'
  },
  {
    label: 'UCL habit formation summary',
    url: 'https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit',
    use: 'longer habit runway than 14 days'
  },
  {
    label: 'Gollwitzer and Sheeran implementation intentions',
    url: 'https://cancercontrol.cancer.gov/sites/default/files/2020-06/goal_intent_attain.pdf',
    use: 'if-then planning and follow-through'
  },
  {
    label: 'Roediger and Karpicke retrieval practice',
    url: 'https://journals.sagepub.com/doi/abs/10.1111/j.1467-9280.2006.01693.x',
    use: 'recall, testing, durable learning'
  }
];

function fileForDay(dayNumber) {
  return path.join(OUT_DIR, `day_${String(dayNumber).padStart(2, '0')}.json`);
}

function readDay(dayNumber) {
  const filename = fileForDay(dayNumber);
  if (!fs.existsSync(filename)) {
    throw new Error(`Missing paid-track lesson: ${filename}`);
  }
  const day = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (day.day_number !== dayNumber) throw new Error(`Day ${dayNumber} has wrong day_number`);
  if (day.audience !== 'paid-90') throw new Error(`Day ${dayNumber} is not marked paid-90`);
  if (!day.title || !day.phase || !day.content) throw new Error(`Day ${dayNumber} is incomplete`);
  if (!day.content.includes('SUCCESS CRITERIA')) {
    throw new Error(`Day ${dayNumber} is missing success criteria`);
  }
  if (!day.content.includes('BEHAVIOURAL DESIGN')) {
    throw new Error(`Day ${dayNumber} is missing behavioural design`);
  }
  if (!Array.isArray(day.source_influences) || day.source_influences.length < 4) {
    throw new Error(`Day ${dayNumber} is missing source influences`);
  }
  return day;
}

function lessonSummary(day) {
  const spec = day.spec || {};
  return {
    day_number: day.day_number,
    phase: day.phase,
    title: day.title,
    task_type: spec.task_type || null,
    domain: spec.domain || null,
    difficulty_label: spec.difficulty_label || null,
    minutes: Number((day.content.match(/\| ([0-9]+) min/) || [])[1] || 0)
  };
}

function main() {
  const days = [];
  for (let dayNumber = FIRST_PAID_DAY; dayNumber <= LAST_PAID_DAY; dayNumber += 1) {
    days.push(readDay(dayNumber));
  }

  const curriculum = {
    generated_at: GENERATED_AT,
    product: 'The AI Habit - 90-day pay-what-it-is-worth track',
    description: 'Paid continuation curriculum for Days 15-90.',
    themes: [...new Set(days.map((day) => day.phase))],
    source_influences: SOURCE_INFLUENCES,
    days: days.map(lessonSummary)
  };

  fs.writeFileSync(
    path.join(OUT_DIR, 'paid_curriculum_index.json'),
    JSON.stringify(curriculum, null, 2) + '\n'
  );

  console.log(`Validated ${days.length} paid-track days and refreshed paid_curriculum_index.json`);
}

if (require.main === module) {
  main();
}

module.exports = {
  FIRST_PAID_DAY,
  LAST_PAID_DAY,
  readDay,
  lessonSummary
};
