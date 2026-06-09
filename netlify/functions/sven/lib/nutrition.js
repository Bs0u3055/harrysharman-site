const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_SEARCH_URL = 'https://platform.fatsecret.com/rest/server.api';

const FOOD_LOOKUP_PATTERN = /\b(ate|eaten|had|having|breakfast|brunch|lunch|dinner|tea|supper|snack|meal|food|portion|serving|calorie|calories|kcal|macro|macros|protein|carb|carbs|fat|fats|fibre|fiber|sugar|sodium|takeaway|restaurant|buffet|recipe|ingredients?|weighed|grams?|g\b|kg|oz|ounces?|ml|litre|liter)\b/i;
const NON_FOOD_COMMAND_PATTERN = /^\/(?:start|setup|status|credits|profile|whoami|help|bug|support|broken|restart_onboarding|delete_key|delete_me|feedback|core|sven_core)\b/i;
const NUTRIENT_FIELDS = ['calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'];
const QUERY_STOPWORDS = new Set(['and', 'or', 'with', 'plus', 'for', 'at', 'my', 'the', 'this', 'that', 'today', 'yesterday', 'tomorrow', 'roughly', 'about']);

function nutritionLookupLikelyNeeded(text) {
  const value = String(text || '').trim();
  if (!value || NON_FOOD_COMMAND_PATTERN.test(value)) return false;
  return FOOD_LOOKUP_PATTERN.test(value);
}

function cleanFoodQuery(text) {
  let query = String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  query = query
    .replace(/^(voice note transcript:|voice note caption\/context:)/i, '')
    .replace(/^(i\s+)?(ate|had|having|breakfast was|lunch was|dinner was|snack was)\s+/i, '')
    .replace(/\b(for|at)\s+(breakfast|brunch|lunch|dinner|tea|supper|snack)\b/gi, ' ')
    .replace(/\b(can you|please|could you|roughly|estimate|calculate|tell me|what are|what is)\b/gi, ' ')
    .replace(/\b(calories|kcal|macros?|protein|carbs?|fat|fibre|fiber|in this|for this|breakfast|brunch|lunch|dinner|snack)\b/gi, ' ')
    .replace(/[?!.,:;]+/g, ' ')
    .split(' ')
    .filter((part) => {
      const value = part.trim().toLowerCase();
      return value && !QUERY_STOPWORDS.has(value);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (query.length < 3) query = String(text || '').replace(/\s+/g, ' ').trim();
  return query.slice(0, 120);
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundValue(value, places = 1) {
  const number = asNumber(value);
  if (number === null) return null;
  const factor = 10 ** places;
  return Math.round(number * factor) / factor;
}

function foodNutrients(food) {
  return Array.isArray(food && food.foodNutrients) ? food.foodNutrients : [];
}

function nutrientId(row) {
  return Number(row && (row.nutrientId || (row.nutrient && row.nutrient.id)));
}

function nutrientName(row) {
  return String((row && (row.nutrientName || row.name || (row.nutrient && row.nutrient.name))) || '').toLowerCase();
}

function nutrientUnit(row) {
  return String((row && (row.unitName || row.unit || (row.nutrient && row.nutrient.unitName))) || '').toLowerCase();
}

function nutrientAmount(row) {
  return asNumber(row && (row.value !== undefined ? row.value : row.amount));
}

function findNutrient(food, ids, namePatterns) {
  const rows = foodNutrients(food);
  const idSet = new Set(ids);
  const byId = rows.find((row) => idSet.has(nutrientId(row)));
  if (byId) return byId;
  return rows.find((row) => namePatterns.some((pattern) => pattern.test(nutrientName(row))));
}

function nutrientValue(food, ids, namePatterns, places = 1) {
  const row = findNutrient(food, ids, namePatterns);
  if (!row) return null;
  let value = nutrientAmount(row);
  if (value === null) return null;
  if (/energy|calorie/.test(nutrientName(row)) && /\bkj\b/.test(nutrientUnit(row))) {
    value = value / 4.184;
  }
  return roundValue(value, places);
}

function numericFieldCount(result) {
  if (!result) return 0;
  return NUTRIENT_FIELDS.filter((field) => asNumber(result[field]) !== null).length;
}

function isUsefulNutritionResult(result) {
  return Boolean(result && result.name && numericFieldCount(result) >= 2);
}

function queryTokens(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !QUERY_STOPWORDS.has(token));
}

function dataTypePriority(food) {
  const type = String(food && food.dataType ? food.dataType : '').toLowerCase();
  if (type.includes('foundation')) return 16;
  if (type.includes('sr legacy')) return 14;
  if (type.includes('survey')) return 8;
  if (type.includes('branded')) return 5;
  return 0;
}

function resultMatchScore(food, query) {
  const description = String((food && (food.description || food.lowercaseDescription || food.brandName)) || '').toLowerCase();
  const tokens = queryTokens(query);
  let score = dataTypePriority(food) + numericFieldCount(usdaResultFromFood(food));
  for (const token of tokens) {
    if (description.includes(token)) score += 6;
    else score -= 8;
  }
  const normalizedQuery = tokens.join(' ');
  if (normalizedQuery && description.includes(normalizedQuery)) score += 18;
  if (normalizedQuery && description.startsWith(normalizedQuery)) score += 10;
  if (tokens.includes('breast') && /nugget|patty|school lunch|babyfood|sandwich/.test(description)) score -= 18;
  if (tokens.includes('chicken') && tokens.includes('breast') && !description.includes('breast')) score -= 16;
  return score;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function usdaResultFromFood(food) {
  if (!food) return null;
  const result = {
    source: 'usda',
    name: food.description || food.lowercaseDescription || food.brandName || 'USDA food item',
    source_id: food.fdcId ? String(food.fdcId) : '',
    basis: 'USDA values are normally per 100g unless the food entry says otherwise',
    calories_kcal: nutrientValue(food, [1008, 2047, 2048], [/energy|calorie/i], 0),
    protein_g: nutrientValue(food, [1003], [/protein/i]),
    carbs_g: nutrientValue(food, [1005], [/carbohydrate|carb/i]),
    fat_g: nutrientValue(food, [1004], [/total lipid|fat/i]),
    fiber_g: nutrientValue(food, [1079], [/fiber|fibre/i]),
    sugar_g: nutrientValue(food, [2000], [/sugars?|sugar, total/i]),
    sodium_mg: nutrientValue(food, [1093], [/sodium/i], 0)
  };
  return result;
}

async function lookupUSDA(config, query, fetchImpl = fetch) {
  const key = config && config.nutritionUsdaApiKey;
  if (!key || !query || typeof fetchImpl !== 'function') return null;

  const params = new URLSearchParams({
    api_key: key,
    query,
    pageSize: '3',
    dataType: 'Foundation,SR Legacy,Survey (FNDDS),Branded'
  });

  const response = await fetchImpl(`${USDA_SEARCH_URL}?${params.toString()}`);
  if (!response || !response.ok) return null;
  const data = await readJson(response);
  const foods = Array.isArray(data && data.foods) ? data.foods : [];
  const best = foods
    .filter((food) => isUsefulNutritionResult(usdaResultFromFood(food)))
    .sort((a, b) => resultMatchScore(b, query) - resultMatchScore(a, query))[0] || foods[0];
  return usdaResultFromFood(best);
}

async function fatSecretAccessToken(config, fetchImpl = fetch) {
  const clientId = config && config.fatsecretClientId;
  const clientSecret = config && config.fatsecretClientSecret;
  if (!clientId || !clientSecret || typeof fetchImpl !== 'function') return '';

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'basic'
  });
  const response = await fetchImpl(FATSECRET_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!response || !response.ok) return '';
  const data = await readJson(response);
  return String((data && data.access_token) || '');
}

function parseFatSecretDescription(description) {
  const text = String(description || '');
  const matchValue = (pattern) => {
    const match = text.match(pattern);
    return match ? roundValue(match[1], pattern.toString().includes('Calories') ? 0 : 1) : null;
  };
  return {
    calories_kcal: matchValue(/Calories:\s*([\d.]+)\s*kcal/i),
    fat_g: matchValue(/Fat:\s*([\d.]+)\s*g/i),
    carbs_g: matchValue(/Carbs:\s*([\d.]+)\s*g/i),
    protein_g: matchValue(/Protein:\s*([\d.]+)\s*g/i)
  };
}

function fatSecretFoodFromData(data) {
  const food = data && data.foods && data.foods.food;
  if (Array.isArray(food)) return food[0];
  return food || null;
}

async function lookupFatSecret(config, query, fetchImpl = fetch) {
  const token = await fatSecretAccessToken(config, fetchImpl);
  if (!token) return null;

  const body = new URLSearchParams({
    method: 'foods.search',
    search_expression: query,
    format: 'json',
    max_results: '1'
  });

  const response = await fetchImpl(FATSECRET_SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!response || !response.ok) return null;
  const data = await readJson(response);
  const food = fatSecretFoodFromData(data);
  if (!food) return null;
  const parsed = parseFatSecretDescription(food.food_description);
  return {
    source: 'fatsecret',
    name: food.food_name || 'FatSecret food item',
    source_id: food.food_id ? String(food.food_id) : '',
    basis: food.food_description || 'FatSecret serving estimate',
    ...parsed
  };
}

async function lookupNutrition(config, query, fetchImpl = fetch) {
  const usda = await lookupUSDA(config, query, fetchImpl).catch(() => null);
  if (isUsefulNutritionResult(usda)) return usda;

  const fatsecret = await lookupFatSecret(config, query, fetchImpl).catch(() => null);
  if (isUsefulNutritionResult(fatsecret)) return fatsecret;

  return isUsefulNutritionResult(usda) ? usda : null;
}

function formatAmount(value, unit) {
  const number = asNumber(value);
  if (number === null) return '';
  return `${number}${unit}`;
}

function nutritionLine(result) {
  const parts = [
    formatAmount(result.calories_kcal, ' kcal'),
    formatAmount(result.protein_g, 'g protein'),
    formatAmount(result.carbs_g, 'g carbs'),
    formatAmount(result.fat_g, 'g fat'),
    formatAmount(result.fiber_g, 'g fibre'),
    formatAmount(result.sugar_g, 'g sugar'),
    formatAmount(result.sodium_mg, 'mg sodium')
  ].filter(Boolean);
  return parts.join('; ');
}

function nutritionContextFromResult(query, result) {
  const id = result.source_id ? ` (${result.source_id})` : '';
  return [
    'Nutrition lookup tool result:',
    `- Query: ${query}`,
    `- Source: ${result.source}`,
    `- Food: ${result.name}${id}`,
    `- Basis: ${result.basis || 'standard database serving estimate'}`,
    `- Nutrients: ${nutritionLine(result)}`,
    "- Use this only if it plausibly matches the user's food. Portions, brands, sauces, cooking method, and mixed meals still need judgement."
  ].join('\n');
}

async function buildNutritionLookupContext(config, text, options = {}) {
  if (!config || config.enableNutritionLookup === false) return '';
  if (!nutritionLookupLikelyNeeded(text)) return '';
  const query = cleanFoodQuery(text);
  if (!query) return '';
  const fetchImpl = options.fetch || fetch;
  const result = await lookupNutrition(config, query, fetchImpl).catch(() => null);
  if (!isUsefulNutritionResult(result)) return '';
  return nutritionContextFromResult(query, result);
}

module.exports = {
  buildNutritionLookupContext,
  cleanFoodQuery,
  lookupFatSecret,
  lookupNutrition,
  lookupUSDA,
  nutritionLookupLikelyNeeded
};
