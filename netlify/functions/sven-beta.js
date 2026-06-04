const { getConfig } = require('./sven/lib/config');
const { escapeHTML } = require('./sven/lib/html');

function headers(extra = {}) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Cache-Control': 'no-store, max-age=0',
    ...extra
  };
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function cookieValue(cookieHeader, name) {
  const cookies = String(cookieHeader || '').split(';');
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('=') || '');
  }
  return '';
}

function shell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${escapeHTML(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Caveat:wght@500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    body.sven-beta-page{background:#e63a25;color:#1a1410}
    .sven-beta-page .site-header{background:#e63a25}
    .sven-private-mark{font-family:var(--f-mono);font-size:11px;letter-spacing:.14em;border:2px solid var(--ink);border-radius:999px;padding:7px 12px;background:var(--cream)}
    .sven-hero{background:var(--red);border-bottom:2px solid var(--ink);padding:54px 0 44px}
    .sven-hero-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:34px;align-items:end}
    .sven-kicker{display:inline-flex;align-items:center;gap:9px;font-family:var(--f-mono);font-size:11px;letter-spacing:.16em;background:var(--cream);border:2px solid var(--ink);border-radius:999px;padding:8px 14px;margin-bottom:20px}
    .sven-kicker span{width:7px;height:7px;background:var(--ink);border-radius:999px;display:inline-block}
    .sven-title{font-family:var(--f-sans);font-weight:900;font-size:clamp(46px,7vw,92px);line-height:.88;letter-spacing:-.04em;max-width:880px}
    .sven-title strong{display:inline-block;background:var(--ink);color:var(--cream);padding:2px 13px 4px;border-radius:4px}
    .sven-copy{font-size:17px;line-height:1.55;max-width:620px;margin-top:24px}
    .sven-note{font-family:var(--f-hand);font-size:30px;font-weight:700;color:var(--cream);transform:rotate(-3deg);display:inline-block;margin-top:18px}
    .sven-panel{background:var(--cream);border:2px solid var(--ink);box-shadow:8px 8px 0 var(--ink);padding:24px}
    .sven-panel h2,.sven-section h2{font-size:clamp(28px,3vw,42px);line-height:.96;letter-spacing:-.03em;margin-bottom:14px}
    .sven-panel p,.sven-section p,.sven-section li{font-size:15px;line-height:1.58}
    .sven-form{display:grid;gap:12px;margin-top:18px}
    .sven-form label{font-family:var(--f-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
    .sven-input{width:100%;border:2px solid var(--ink);background:#fff;padding:13px 14px;font:600 16px var(--f-sans);border-radius:0}
    .sven-button,.sven-link-button{display:inline-flex;align-items:center;justify-content:center;border:2px solid var(--ink);background:var(--ink);color:var(--cream);padding:13px 18px;font:800 13px var(--f-sans);letter-spacing:.06em;text-transform:uppercase;transition:transform .15s,box-shadow .15s}
    .sven-button:hover,.sven-link-button:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 var(--ink)}
    .sven-link-button.alt{background:var(--cream);color:var(--ink)}
    .sven-error{border-left:5px solid var(--red);background:#fff;padding:12px;margin-top:12px;font-weight:700}
    .sven-marquee{background:var(--ink);color:var(--cream);font-family:var(--f-mono);font-size:12px;letter-spacing:.16em;padding:12px 0;overflow:hidden;white-space:nowrap;border-bottom:2px solid var(--ink)}
    .sven-marquee span{display:inline-block;padding-right:30px}
    .sven-section{background:var(--cream);border-bottom:2px solid var(--ink);padding:44px 0}
    .sven-section.dark{background:var(--ink);color:var(--cream)}
    .sven-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:2px solid var(--ink);border-bottom:0}
    .sven-card{padding:22px;border-right:2px solid var(--ink);border-bottom:2px solid var(--ink);background:var(--cream);color:var(--ink);min-height:180px}
    .sven-card:nth-child(3n){border-right:0}
    .sven-card.dark{background:var(--ink);color:var(--cream)}
    .sven-card-label{font-family:var(--f-mono);font-size:10px;letter-spacing:.16em;opacity:.62;margin-bottom:12px}
    .sven-card h3{font-size:22px;line-height:1;letter-spacing:-.02em;margin-bottom:12px}
    .sven-steps{display:grid;gap:12px;counter-reset:sven-step;margin-top:22px}
    .sven-step{display:grid;grid-template-columns:48px 1fr;gap:16px;align-items:start;border-top:2px solid var(--ink);padding-top:16px}
    .sven-step:before{counter-increment:sven-step;content:counter(sven-step);display:grid;place-items:center;width:38px;height:38px;background:var(--red);border:2px solid var(--ink);font:900 16px var(--f-sans)}
    .sven-code{display:inline-block;background:var(--ink);color:var(--cream);font-family:var(--f-mono);font-size:13px;padding:4px 7px;margin:2px 0}
    .sven-cta-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
    .sven-small{font-family:var(--f-mono);font-size:11px;line-height:1.55;opacity:.7;margin-top:16px}
    @media (max-width:860px){
      .sven-hero-grid,.sven-grid{grid-template-columns:1fr}
      .sven-card,.sven-card:nth-child(3n){border-right:0}
      .sven-private-mark{display:none}
    }
  </style>
</head>
<body class="sven-beta-page">
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand">HARRY<span class="brand-slash">/</span>SHARMAN</a>
      <span class="sven-private-mark">PRIVATE SVEN BETA</span>
    </div>
  </header>
  ${body}
</body>
</html>`;
}

function lockedPage(error = '') {
  const body = `<section class="sven-hero">
    <div class="container sven-hero-grid">
      <div>
        <div class="sven-kicker"><span></span> INVITE ONLY</div>
        <h1 class="sven-title">Sven is in <strong>friend beta.</strong></h1>
        <p class="sven-copy">This page is private, hidden from the site navigation, and blocked from search indexing. If Harry sent you the beta link, paste the invite code below.</p>
        <div class="sven-note">tiny velvet rope, basically.</div>
      </div>
      <div class="sven-panel">
        <h2>Enter invite code</h2>
        <p>This stops random traffic getting to the setup flow while Sven is still being tested.</p>
        <form class="sven-form" method="get" action="/sven-beta">
          <label for="invite">Invite code</label>
          <input class="sven-input" id="invite" name="invite" autocomplete="off" required>
          <button class="sven-button" type="submit">Open beta page</button>
        </form>
        ${error ? `<div class="sven-error">${escapeHTML(error)}</div>` : ''}
        <p class="sven-small">Do not share this page publicly. Sven is not ready for open signups.</p>
      </div>
    </div>
  </section>`;
  return shell('Sven private beta', body);
}

function openPage(config) {
  const code = String(config.betaAccessCode || '').trim();
  const botUrl = `https://t.me/Sven_DadFit_Bot?start=${encodeURIComponent(code)}`;
  const body = `<section class="sven-hero">
    <div class="container sven-hero-grid">
      <div>
        <div class="sven-kicker"><span></span> SVEN FRIEND BETA</div>
        <h1 class="sven-title">A coach in your pocket. <strong>No laminated gym nonsense.</strong></h1>
        <p class="sven-copy">Sven is a text-first AI personal trainer and nutrition coach. You message it like a coach: food, training, sleep, travel, screenshots, voice notes, the messy real-life stuff. The more context you give it, the sharper it gets.</p>
        <div class="sven-cta-row">
          <a class="sven-link-button" href="${botUrl}" rel="nofollow">Message Sven on Telegram</a>
          <a class="sven-link-button alt" href="https://platform.openai.com/api-keys" rel="nofollow">Create OpenAI API key</a>
        </div>
      </div>
      <div class="sven-panel">
        <h2>Important first</h2>
        <p>You pay OpenAI directly using your own API key. Harry is giving you the Sven coaching harness, not bankrolling everyone's token usage.</p>
        <p>Sven is not a doctor, dietitian, therapist, or emergency service. Do not use it for diagnosis, urgent issues, eating-disorder support, acute injuries, or medical treatment decisions.</p>
      </div>
    </div>
  </section>
  <div class="sven-marquee"><span>PRIVATE TEST - USE HONESTLY - FEEDBACK HELPS SVEN IMPROVE - DO NOT SHARE PUBLICLY</span><span>PRIVATE TEST - USE HONESTLY - FEEDBACK HELPS SVEN IMPROVE - DO NOT SHARE PUBLICLY</span></div>
  <section class="sven-section">
    <div class="container">
      <h2>Set up in ten minutes.</h2>
      <div class="sven-steps">
        <div class="sven-step"><div><strong>Download Telegram.</strong><p>Install Telegram on your phone if you do not already have it.</p></div></div>
        <div class="sven-step"><div><strong>Create your OpenAI API key.</strong><p>Go to <a href="https://platform.openai.com/api-keys" rel="nofollow">platform.openai.com/api-keys</a>, log in, add billing if asked, and create a secret key. Copy it once.</p></div></div>
        <div class="sven-step"><div><strong>Start Sven with the beta code.</strong><p>Tap the Telegram button above, or message Sven and send:</p><span class="sven-code">/start ${escapeHTML(code)}</span></div></div>
        <div class="sven-step"><div><strong>Answer the onboarding questions.</strong><p>Sven asks about goals, training, food, injuries/constraints, sleep, schedule, tracking style, and coaching style.</p></div></div>
        <div class="sven-step"><div><strong>Connect your API key safely.</strong><p>After onboarding, send <span class="sven-code">/setup</span>. Open the secure setup link Sven sends. Paste your OpenAI key there. Do not paste the API key directly into Telegram.</p></div></div>
      </div>
    </div>
  </section>
  <section class="sven-section dark">
    <div class="container">
      <h2>What to send Sven.</h2>
      <div class="sven-grid">
        <div class="sven-card"><div class="sven-card-label">TEXT</div><h3>Plans and decisions</h3><p>Ask what to train, what to eat, how to adapt a day, or how to recover when life has gone sideways.</p></div>
        <div class="sven-card"><div class="sven-card-label">VOICE</div><h3>Messy context</h3><p>Send a Telegram voice note when typing is annoying. Monologue the whole situation and let Sven turn it into a plan.</p></div>
        <div class="sven-card"><div class="sven-card-label">PHOTOS</div><h3>Food tracking</h3><p>Photograph meals. It works better if you add weights, portions, brands, oils, sauces, and what you actually ate.</p></div>
        <div class="sven-card dark"><div class="sven-card-label">SCREENSHOTS</div><h3>Health data</h3><p>Apple Health, Google Fit, sleep, workout, weight, steps, recovery, heart-rate screenshots. Sven is not directly connected yet, so screenshots are the workaround.</p></div>
        <div class="sven-card dark"><div class="sven-card-label">TRAVEL</div><h3>Real constraints</h3><p>Tell Sven if you are in a hotel, at a buffet, away with work, low on equipment, eating out, or short on time.</p></div>
        <div class="sven-card dark"><div class="sven-card-label">RECOVERY</div><h3>Fatigue signals</h3><p>Tell it about sleep debt, soreness, stress, hunger, motivation, late nights, childcare, and social meals.</p></div>
      </div>
    </div>
  </section>
  <section class="sven-section">
    <div class="container">
      <h2>Useful commands.</h2>
      <div class="sven-grid">
        <div class="sven-card"><div class="sven-card-label">SETUP</div><h3>Connect or update key</h3><p><span class="sven-code">/setup</span><br><span class="sven-code">/status</span><br><span class="sven-code">/delete_key</span></p></div>
        <div class="sven-card"><div class="sven-card-label">FEEDBACK</div><h3>Make it better</h3><p><span class="sven-code">/feedback good what worked</span><br><span class="sven-code">/feedback wrong what was wrong</span><br><span class="sven-code">/feedback unsafe what happened</span></p></div>
        <div class="sven-card"><div class="sven-card-label">BROKEN</div><h3>Report issues</h3><p><span class="sven-code">/bug what happened, what you expected, and what you tapped or typed before it broke</span></p></div>
      </div>
      <p class="sven-small">Private messages stay in your Sven memory. Separate anonymised patterns from feedback, bugs, and coaching misses can become Sven Core learnings, so the beta improves for everyone without copying one person's private details into someone else's coaching.</p>
    </div>
  </section>`;
  return shell('Sven friend beta', body);
}

exports.handler = async (event) => {
  const config = getConfig();
  if (!config.betaAccessCode) {
    return { statusCode: 503, headers: headers(), body: lockedPage('The beta invite page is not configured yet.') };
  }
  const invite = normalize((event.queryStringParameters || {}).invite);
  const cookieInvite = normalize(cookieValue((event.headers || {}).cookie, 'sven_beta_invite'));
  const expected = normalize(config.betaAccessCode);
  const hasAccess = invite === expected || cookieInvite === expected;
  if (!hasAccess) {
    const hadInvite = Boolean(invite);
    return {
      statusCode: hadInvite ? 403 : 200,
      headers: headers(),
      body: lockedPage(hadInvite ? 'That invite code did not work.' : '')
    };
  }
  const setCookie = `sven_beta_invite=${encodeURIComponent(config.betaAccessCode)}; Max-Age=2592000; Path=/sven-beta; HttpOnly; Secure; SameSite=Lax`;
  return {
    statusCode: 200,
    headers: headers({ 'Set-Cookie': setCookie }),
    body: openPage(config)
  };
};
