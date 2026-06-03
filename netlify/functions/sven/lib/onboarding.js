const ONBOARDING_QUESTIONS = [
  { id: 'name', prompt: 'What should Sven call you?', private: false },
  { id: 'age', prompt: 'How old are you? You can say skip if you prefer.', private: true },
  { id: 'primary_goal', prompt: 'What is your main goal right now? Fat loss, muscle gain, strength, energy, consistency, health markers, confidence, or something else?', private: false },
  { id: 'goal_reason', prompt: 'Why does that goal matter to you?', private: true },
  { id: 'current_state', prompt: 'What is your current starting point? Include height, weight, training level, or anything useful. Approximate is fine.', private: true },
  { id: 'target_state', prompt: 'What would a successful 8-12 weeks look like?', private: false },
  { id: 'training_history', prompt: 'What has your training looked like over the last year?', private: false },
  { id: 'weekly_capacity', prompt: 'How many days per week can you realistically train, and how long can each session be?', private: false },
  { id: 'equipment', prompt: 'What equipment do you have access to? Gym, home dumbbells, machines, bands, running routes, bike, nothing, etc.', private: false },
  { id: 'injuries_conditions', prompt: 'Any injuries, pain, medical conditions, medications, pregnancy, eating disorder history, or clinician advice Sven must respect? Say none if none.', private: true },
  { id: 'nutrition_style', prompt: 'How do you currently eat on a normal weekday? No judgement, just the pattern.', private: true },
  { id: 'diet_constraints', prompt: 'Any dietary preferences, allergies, intolerances, religious constraints, foods you hate, or foods you rely on?', private: true },
  { id: 'tracking_comfort', prompt: 'How much tracking are you willing to do? None, photos only, protein only, calories/macros, or full detail?', private: false },
  { id: 'schedule_constraints', prompt: 'What does your weekly schedule make difficult? Work hours, childcare, travel, social meals, late nights, etc.', private: false },
  { id: 'sleep_energy', prompt: 'How are sleep, stress, and energy at the moment?', private: true },
  { id: 'motivation_style', prompt: 'What coaching style works best for you? Direct, gentle, funny, data-driven, strict accountability, tiny habits, or something else?', private: false },
  { id: 'red_lines', prompt: 'Anything Sven should never do? For example: no weigh-ins, no calorie targets, no guilt language, no morning messages.', private: true },
  { id: 'consent_boundary', prompt: 'Sven gives general fitness and nutrition coaching, not medical diagnosis or treatment. Reply yes if you are happy to use it on that basis.', private: false }
];

function questionCount() {
  return ONBOARDING_QUESTIONS.length;
}

function getQuestion(index) {
  return ONBOARDING_QUESTIONS[index] || null;
}

function formatQuestion(index) {
  const question = getQuestion(index);
  if (!question) return null;
  return `Question ${index + 1}/${questionCount()}: ${question.prompt}`;
}

module.exports = {
  ONBOARDING_QUESTIONS,
  questionCount,
  getQuestion,
  formatQuestion
};

