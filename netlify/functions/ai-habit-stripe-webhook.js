const crypto = require('crypto');
const Stripe = require('stripe');
const {
  MAX_STARTER_DAY,
  addBusinessDays,
  businessDayNumber,
  dateOnly,
  nextWeekday,
  normaliseEmail
} = require('./ai-habit/lib/sequence');
const storage = require('./lib/storage');

const { getJSON, setJSON, addToIndex } = storage;
const connectStorage = storage.connectStorage || (() => {});

function rawBody(event) {
  if (event.isBase64Encoded) return Buffer.from(event.body || '', 'base64');
  return Buffer.from(event.body || '', 'utf8');
}

function subscriberIdFor(email) {
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
}

async function recordPaidSession(session) {
  const email = normaliseEmail(
    session.customer_details && session.customer_details.email
      ? session.customer_details.email
      : session.customer_email
  );
  if (!email) return { recorded: false, reason: 'missing_email' };

  const now = new Date().toISOString();
  const subscriberId = subscriberIdFor(email);
  const key = `ai-habit:subscriber:${subscriberId}`;
  const existing = await getJSON(key, null);
  const startDate = existing && existing.start_date ? existing.start_date : nextWeekday(new Date());
  const starterDay = businessDayNumber(startDate, dateOnly(new Date()));
  const starterComplete = Boolean(
    existing &&
    (
      existing.status === 'completed_starter' ||
      Number(existing.last_sent_day || 0) >= MAX_STARTER_DAY ||
      starterDay > MAX_STARTER_DAY
    )
  );
  const paidStartDate = existing && existing.paid_start_date
    ? existing.paid_start_date
    : (starterComplete ? nextWeekday(new Date()) : addBusinessDays(startDate, MAX_STARTER_DAY));
  const metadata = session.metadata || {};
  const plan = metadata.plan || 'pay-what-worth-90';
  const subscriber = {
    id: subscriberId,
    email,
    name: existing && existing.name ? existing.name : '',
    context: existing && existing.context ? existing.context : '',
    track: existing && existing.track ? existing.track : 'paid-90',
    paid_track: 'founding-90',
    paid_status: 'paid',
    paid_at: now,
    paid_plan: plan,
    paid_amount_pence: metadata.chosen_amount_pence || String(session.amount_total || ''),
    paid_suggested_amount_pence: metadata.suggested_amount_pence || null,
    stripe_session_id: session.id,
    stripe_customer_id: session.customer || null,
    stripe_payment_intent_id: session.payment_intent || null,
    source: existing && existing.source ? existing.source : 'ai-habit-stripe',
    status: existing && existing.status ? existing.status : 'active',
    start_date: startDate,
    paid_start_date: paidStartDate,
    last_sent_day: existing && Number.isFinite(Number(existing.last_sent_day)) ? Number(existing.last_sent_day) : 0,
    last_sent_paid_day: existing && Number.isFinite(Number(existing.last_sent_paid_day)) ? Number(existing.last_sent_paid_day) : MAX_STARTER_DAY,
    created_at: existing && existing.created_at ? existing.created_at : now,
    updated_at: now
  };

  await setJSON(key, subscriber);
  await addToIndex('ai-habit-subscribers', key, 5000);
  await setJSON(`ai-habit:payment:${session.id}`, {
    id: session.id,
    email,
    amount_total: session.amount_total || null,
    currency: session.currency || 'gbp',
    plan,
    chosen_amount_pence: metadata.chosen_amount_pence || String(session.amount_total || ''),
    suggested_amount_pence: metadata.suggested_amount_pence || null,
    min_amount_pence: metadata.min_amount_pence || '100',
    max_amount_pence: metadata.max_amount_pence || '20000',
    created_at: now,
    updated_at: now,
    stripe_customer_id: session.customer || null,
    stripe_payment_intent_id: session.payment_intent || null
  });

  return { recorded: true, email };
}

exports.handler = async (event) => {
  connectStorage(event);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.AI_HABIT_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Stripe webhook is not configured' })
    };
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
  const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  try {
    const stripeEvent = stripe.webhooks.constructEvent(rawBody(event), signature, webhookSecret);
    let result = { ignored: true, type: stripeEvent.type };

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      if (session.metadata && session.metadata.product === 'ai_habit') {
        result = await recordPaidSession(session);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, result })
    };
  } catch (error) {
    console.error('ai habit stripe webhook error', error);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
};
