const Stripe = require('stripe');

function htmlPage(title, message, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${title} - The AI Habit</title>
    <style>
      body{margin:0;background:#fefcf7;color:#120d0a;font-family:Arial,Helvetica,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px}
      main{max-width:680px;background:#fff;border:2px solid #120d0a;box-shadow:8px 8px 0 #120d0a;padding:34px}
      h1{font-size:44px;line-height:.95;margin:0 0 16px}
      p{font-size:18px;line-height:1.5;margin:0 0 18px}
      a{color:#2434ff;font-weight:800}
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <p><a href="/projects/ai-habit/">Back to The AI Habit</a></p>
    </main>
  </body>
</html>`
  };
}

function siteBaseUrl(event) {
  if (process.env.AI_HABIT_PUBLIC_BASE_URL) {
    return process.env.AI_HABIT_PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.URL) {
    return process.env.URL.replace(/\/$/, '');
  }
  const headers = event.headers || {};
  const host = headers.host || headers.Host;
  if (!host) return 'https://harrysharman.com';
  const proto = host.includes('localhost') || host.startsWith('127.0.0.1')
    ? 'http'
    : (headers['x-forwarded-proto'] || 'https');
  return `${proto}://${host}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return htmlPage(
      'Checkout is nearly ready',
      'The £49 founding checkout is wired into the site, but Stripe has not been connected to this deployment yet. Add STRIPE_SECRET_KEY in Netlify, then this button will open Stripe Checkout.',
      503
    );
  }

  const baseUrl = siteBaseUrl(event);
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
  const pricePence = Math.max(100, Number(process.env.AI_HABIT_90_DAY_PRICE_PENCE || 4900));

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_creation: 'always',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: pricePence,
            product_data: {
              name: 'The AI Habit - 90-day founding track',
              description: 'A 90-day applied LLM practice programme for building a grounded working AI habit.'
            }
          }
        }
      ],
      metadata: {
        product: 'ai_habit',
        plan: 'founding-90',
        source: 'ai-habit-site'
      },
      payment_intent_data: {
        metadata: {
          product: 'ai_habit',
          plan: 'founding-90',
          source: 'ai-habit-site'
        }
      },
      success_url: `${baseUrl}/projects/ai-habit/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/projects/ai-habit/#ninety-days`
    });

    return {
      statusCode: 303,
      headers: { Location: session.url },
      body: ''
    };
  } catch (error) {
    console.error('ai habit checkout error', error);
    return htmlPage(
      'Checkout had a wobble',
      'Stripe did not create the checkout session. The payment button is in place, but the Stripe configuration needs checking before the founding cohort can take payments.',
      500
    );
  }
};
