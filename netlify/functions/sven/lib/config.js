function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function intEnv(name, fallback) {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function publicBaseUrl() {
  const configured = env('SVEN_PUBLIC_BASE_URL');
  if (configured) return configured.replace(/\/$/, '');
  const netlifyUrl = env('URL');
  if (netlifyUrl) return netlifyUrl.replace(/\/$/, '');
  return 'https://harrysharman.com';
}

function getConfig() {
  return {
    telegramBotToken: env('TELEGRAM_BOT_TOKEN'),
    webhookSecretPath: env('SVEN_WEBHOOK_SECRET_PATH'),
    publicBaseUrl: publicBaseUrl(),
    svenSecret: env('SVEN_SECRET'),
    adminToken: env('SVEN_ADMIN_TOKEN'),
    adminTelegramChatId: env('ADMIN_TELEGRAM_CHAT_ID'),
    primarySvenTelegramChatId: env('PRIMARY_SVEN_TELEGRAM_CHAT_ID') || env('HARRY_TELEGRAM_CHAT_ID') || env('ADMIN_TELEGRAM_CHAT_ID'),
    trafficReportTelegramChatId: env('TRAFFIC_REPORT_TELEGRAM_CHAT_ID') || env('ADMIN_TELEGRAM_CHAT_ID'),
    betaAccessCode: env('SVEN_BETA_ACCESS_CODE'),
    openaiDefaultModel: env('OPENAI_DEFAULT_MODEL', 'gpt-5-nano'),
    openaiTranscriptionModel: env('OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-mini-transcribe'),
    svenLearningOpenAIKey: env('SVEN_LEARNING_OPENAI_KEY') || env('CENTRAL_OPENAI_API_KEY'),
    svenLearningModel: env('SVEN_LEARNING_MODEL', env('OPENAI_DEFAULT_MODEL', 'gpt-5-nano')),
    autoPromoteCoreLearnings: boolEnv('SVEN_AUTO_PROMOTE_CORE_LEARNINGS', true),
    autoLearningMinSignals: intEnv('SVEN_AUTO_LEARNING_MIN_SIGNALS', 3),
    autoLearningMaxPromotions: intEnv('SVEN_AUTO_LEARNING_MAX_PROMOTIONS', 4),
    enableNutritionLookup: boolEnv('SVEN_ENABLE_NUTRITION_LOOKUP', true),
    nutritionUsdaApiKey: env('SVEN_USDA_FDC_API_KEY') || env('USDA_FDC_API_KEY') || env('FDC_API_KEY'),
    fatsecretClientId: env('SVEN_FATSECRET_CLIENT_ID') || env('FATSECRET_CLIENT_ID'),
    fatsecretClientSecret: env('SVEN_FATSECRET_CLIENT_SECRET') || env('FATSECRET_CLIENT_SECRET'),
    dailyTokenLimit: intEnv('SVEN_DAILY_TOKEN_LIMIT', 120000),
    setupTokenTtlMinutes: intEnv('SETUP_TOKEN_TTL_MINUTES', 60),
    centralOpenAIKey: env('CENTRAL_OPENAI_API_KEY'),
    stripeSecretKey: env('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: env('STRIPE_WEBHOOK_SECRET'),
    stripePriceIdStarter: env('STRIPE_PRICE_ID_STARTER'),
    stripePriceIdStandard: env('STRIPE_PRICE_ID_STANDARD'),
    creditTokensStarter: intEnv('CREDIT_TOKENS_STARTER', 250000),
    creditTokensStandard: intEnv('CREDIT_TOKENS_STANDARD', 750000),
    enablePrepaidCredits: boolEnv('SVEN_ENABLE_PREPAID_CREDITS', false),
    skipKeyValidation: boolEnv('SVEN_SKIP_KEY_VALIDATION', false),
    autoSetWebhook: boolEnv('AUTO_SET_TELEGRAM_WEBHOOK', false)
  };
}

function stripeConfigured(config = getConfig()) {
  return Boolean(
    config.enablePrepaidCredits &&
    config.stripeSecretKey &&
    config.stripeWebhookSecret &&
    config.stripePriceIdStarter &&
    config.stripePriceIdStandard
  );
}

module.exports = {
  getConfig,
  stripeConfigured
};
