const SAFETY_TERMS = [
  'chest pain',
  'fainting',
  'passed out',
  'shortness of breath',
  'suicidal',
  'kill myself',
  'self harm',
  'purging',
  'vomiting to lose weight',
  'eating disorder',
  'pregnant',
  'pregnancy',
  'acute injury',
  'blood in',
  'severe pain'
];

function detectSafetyTerms(text) {
  const lower = String(text || '').toLowerCase();
  return SAFETY_TERMS.filter((term) => lower.includes(term));
}

module.exports = {
  detectSafetyTerms
};

