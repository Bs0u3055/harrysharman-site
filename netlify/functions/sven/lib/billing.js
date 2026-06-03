const { stripeConfigured } = require('./config');
const db = require('./db');

function packConfig(config, packName) {
  const packs = {
    starter: {
      priceId: config.stripePriceIdStarter,
      creditTokens: config.creditTokensStarter,
      label: 'Starter'
    },
    standard: {
      priceId: config.stripePriceIdStandard,
      creditTokens: config.creditTokensStandard,
      label: 'Standard'
    }
  };
  if (!packs[packName]) throw new Error('Unknown credit pack.');
  return packs[packName];
}

async function createCheckoutSession(config, chatId, packName) {
  if (!stripeConfigured(config)) throw new Error('Stripe is not configured.');
  const Stripe = require('stripe');
  const stripe = Stripe(config.stripeSecretKey);
  const pack = packConfig(config, packName);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: pack.priceId, quantity: 1 }],
    success_url: `${config.publicBaseUrl}/api/sven-billing-success`,
    cancel_url: `${config.publicBaseUrl}/api/sven-billing-cancel`,
    metadata: {
      telegram_chat_id: String(chatId),
      pack_name: packName,
      credit_tokens: String(pack.creditTokens)
    }
  });
  await db.addCheckoutSession(session.id, chatId, packName, pack.creditTokens);
  return session.url;
}

async function handleStripeWebhook(config, event) {
  if (!config.stripeWebhookSecret) throw new Error('Stripe webhook secret is not configured.');
  const Stripe = require('stripe');
  const stripe = Stripe(config.stripeSecretKey || 'sk_missing');
  const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'utf8');
  const stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  if (stripeEvent.type !== 'checkout.session.completed') return 'ignored';
  const session = stripeEvent.data.object;
  const row = await db.getCheckoutSession(session.id);
  if (!row || row.status === 'paid') return 'already_handled';
  await db.addCredits(row.telegram_chat_id, row.credit_tokens, `stripe_${row.pack_name}`, session.id);
  await db.markCheckoutPaid(session.id);
  return 'credited';
}

module.exports = {
  createCheckoutSession,
  handleStripeWebhook
};

