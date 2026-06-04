# Sven Beta Readiness

## Current Launch Mode

Sven is ready for a small Telegram beta using bring-your-own OpenAI keys only.

Friends message the same bot, but each Telegram chat is treated as a separate user workspace. Their profile, messages, API key, credits, usage, and onboarding state are stored under their own Telegram chat ID.

The beta is text-first, but users can also send:

- Telegram voice notes or audio clips
- Food photos
- Workout, sleep, weight, step, heart-rate, recovery, Apple Health, Google Fit, or wearable screenshots
- Context messages such as "I am travelling", "I am in a hotel", "I am eating out", or "sleep was bad"

Sven is not directly integrated with Apple Health, Google Fit, Garmin, Fitbit, MyFitnessPal, or food scales yet. The practical beta path is screenshots, food photos, voice notes, and plain-language context.

## User Separation

- Per-user profile: `user:<telegram_chat_id>`
- Per-user OpenAI key: `api-key:<telegram_chat_id>` and encrypted with `SVEN_SECRET`
- Per-user message memory: `messages:<telegram_chat_id>`
- Per-user setup link: a random, expiring setup token mapped to one chat ID
- Per-user prompt context: only that user's profile, that user's recent messages, and reviewed Sven Core lessons

The model prompt does not pull in other users' messages, profile answers, feedback, support tickets, safety flags, or usage rows.

## Learning System

Sven now has three layers:

1. Private user memory
   - Used only for that user.
   - Includes onboarding answers and recent conversation.
   - Stores up to 1,000 messages per user for beta review/history, while only the recent slice is sent into the model prompt.
   - Voice notes are transcribed using that user's OpenAI key and stored as private text context.
   - Raw photos, screenshots, and audio files are not stored by Sven. They are downloaded temporarily for the model call.

2. Redacted learning queue
   - Stores anonymized signals from onboarding, messages, feedback, support, and safety flags.
   - Keeps up to 5,000 recent learning signals during beta.
   - Uses a hashed user reference, not the raw Telegram chat ID.
   - Redacts API keys, emails, phone numbers, and token-like URL parameters.
   - This queue is for admin review and is not automatically shown to other users.

3. Reviewed Sven Core learnings
   - Manually added in Sven Admin after review.
   - Can also be added by Harry/admin in Telegram with `/core category | reviewed lesson`.
   - These are the only shared lessons injected into every user's Sven prompt.
   - This is the safety boundary that lets everyone make Sven smarter without leaking one user's raw data into another user's experience.

## Central Learning Loop

There are now three routes into the central Sven Core repository:

0. Automatic background distillation
   - A scheduled Netlify function runs daily behind the scenes.
   - It reads redacted learning signals, feedback, support tickets, and existing Sven Core lessons.
   - It uses `SVEN_LEARNING_OPENAI_KEY`, not a tester's API key, to propose safe general lessons.
   - It auto-promotes only validated, non-identifying, high-confidence lessons into Sven Core with source `auto_learning`.
   - It skips one-off, private, unsafe, medical, duplicate, or low-confidence lessons.
   - Runs are visible in Sven Admin under "Automatic Learning Runs" and in the weekly report.

1. Harry's personal Sven improvements
   - When Harry finds a reusable coaching rule in his own Sven, he can send it to the Telegram bot as admin:

     ```text
     /core coaching | When a user is tired, first reduce decision load before adding more accountability.
     ```

   - The command is admin-only and saves the reviewed lesson directly into Sven Core.
   - It requires `ADMIN_TELEGRAM_CHAT_ID` in Netlify. Harry can get the right ID by messaging Sven with `/whoami`.
   - The lesson then appears in Sven Admin and is injected into future hosted Sven replies for every user.

2. Friend beta learnings
   - Users send messages, screenshots, voice notes, feedback, and bugs.
   - Sven stores private user context only for that user.
   - Sven also creates redacted learning signals in the Learning Queue.
   - Harry reviews those signals and turns repeated useful patterns into general Sven Core learnings.

This means the system improves centrally, but only through compressed general lessons. Raw user details do not automatically flow into everyone else's Sven.

Required environment variable for full automation:

```text
SVEN_LEARNING_OPENAI_KEY
```

Optional controls:

```text
SVEN_LEARNING_MODEL=gpt-5-nano
SVEN_AUTO_PROMOTE_CORE_LEARNINGS=true
SVEN_AUTO_LEARNING_MIN_SIGNALS=3
SVEN_AUTO_LEARNING_MAX_PROMOTIONS=4
```

## Admin Workflow

Open Sven Admin and review:

- Users
- Recent Feedback
- Learning Queue
- Sven Core Learnings
- Support Inbox
- Safety Flags
- Weekly Reports

When a repeated useful lesson appears in feedback or the learning queue, rewrite it as a general coaching rule and add it through "Add Sven Core learning".

From Telegram, Harry/admin can also add:

```text
/core category | reviewed general lesson
```

Good Sven Core examples:

- "For busy parents, start with two repeatable full-body sessions before adding optional extras."
- "When a user resists calorie tracking, offer protein/fibre/meal-pattern tracking first."
- "If the user reports guilt or shame around food, switch to neutral language and one next meal action."

Bad Sven Core examples:

- Raw user stories
- Identifiable health details
- A specific user's injury, weight, medication, or schedule
- Anything copied directly from private onboarding fields

## Sven Voice

Sven should feel like a real coach in the user's pocket: calm, observant, warm, direct, lightly funny, and specific.

Good Sven voice:

- "Give me the real version, not the Instagram version."
- "This is not a motivation problem yet. It is a friction problem."
- "Do the boring version twice this week. Boring is underrated because it works."
- "Good. That counts. Now make the next step smaller than your ego wants it to be."

Avoid:

- Corporate wellness language
- Guru voice
- Shame, guilt, or fear
- Long generic pep talks
- Fake certainty
- Turning every answer into a medical disclaimer

## Personal Sven Background Material

The hosted Sven prompt now includes a curated "Founder Sven Core" layer drawn from the older personal/alpha setup material and Harry's public behavioural-strategy notes.

Included as compressed principles:

- BYOK operating model and per-user separation
- Private user memory versus reviewed shared Sven Core learning
- Health data integration path: chat-first, then manual summaries, then companion apps
- Apple Health via HealthKit, Android via Health Connect, and caution around Google Fit as a new integration path
- Health data as coaching context, not diagnosis
- COM-B: capability, opportunity, motivation
- System 1 / System 2 decision-making
- Social proof, identity, and accessibility
- Micro-laziness compounding into larger drift
- Future-self lens, used lightly and without shame
- Hawthorne effect plus identity
- Insight as the human tension underneath the log
- Voice principles from Harry's tone-of-voice notes: sharp, warm, direct, slightly amused, plain English, no corporate/guru language

Not included:

- Full raw Markdown documents in every prompt
- Private personal data
- Old implementation instructions that no longer apply to the Netlify build
- Full HealthKit or Health Connect integration code

## Photos, Screenshots, and Voice Notes

Sven can use photos and screenshots as evidence, not decoration.

Good user inputs:

- "Hotel breakfast. Eggs, toast, fruit. Not sure on portions." plus a food photo
- "Apple Health sleep from last night" plus a sleep screenshot
- "Workout from this morning" plus a workout screenshot
- A voice note explaining the day, energy, hunger, training, stress, travel, and what they actually ate

Food photos:

- Sven gives rough calories/macros with uncertainty.
- Sven asks for weights, volumes, brands, sauces, and cooking methods only when needed.
- More detail makes the estimate better.

Health/workout screenshots:

- Sven extracts only visible data.
- Sven should connect sleep debt, tiredness, fatigue, soreness, steps, training load, and recovery to the user's eating and fitness goals.
- Sven should not pretend to have live tracker access.

Voice notes:

- Users can monologue instead of typing.
- Sven transcribes the audio with that user's own OpenAI key, then replies like normal.
- The transcript becomes part of that user's private Sven memory.

## Behavioural Science Nudges

Sven now carries the behavioural science layer in the base prompt:

- Diagnose friction before motivation.
- Use tiny next actions and if-then plans.
- Make good defaults easier and bad defaults slightly harder.
- Track enough to learn, not enough to create shame.
- Reinforce identity through evidence, not empty affirmations.
- Reset after messy days with the next meal, next walk, or next session.
- Pair habits with existing routines and reduce decision load.
- Treat user input as a feedback loop that gets smarter over time.

## User Support

Friends should report broken flows in Telegram:

```text
/bug what happened, what they expected, and what they tapped or typed before it broke
```

These tickets appear in the Admin Support Inbox and the weekly report.

## Deletion

`/delete_me confirm` removes the user's profile, API key, messages, usage rows, credit rows, feedback rows, support tickets, safety flags, and learning queue records linked to that user hash.

## Stripe / Prepaid Credits

Bring-your-own-key is the beta path.

Prepaid credits are disabled unless `SVEN_ENABLE_PREPAID_CREDITS=true` is deliberately added in Netlify.

Leave this unset for the friend beta. The point is that you provide the Sven harness, while testers provide their own OpenAI API key and see their own usage/value directly.

If prepaid credits are reintroduced later, they need:

```text
SVEN_ENABLE_PREPAID_CREDITS=true
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

After those are added to Netlify, redeploy and run a real low-value Stripe checkout test before sharing prepaid credits.

## Credit Monitoring

Credits are measured in model tokens, not pounds. Stripe controls how much a user pays; Netlify environment variables control how many Sven tokens that payment grants.

Monitor prepaid usage in Sven Admin:

- Users: current funding mode and remaining token balance
- Recent Usage: each model call, funding mode, model, input tokens, output tokens, total tokens
- Credit Ledger: positive paid grants and negative model-usage deductions
- Stripe Checkout Sessions: created and paid Stripe sessions

Sven grants credits only after the signed Stripe webhook confirms `checkout.session.completed` with `payment_status=paid`.

Sven spends Harry's central OpenAI key only when prepaid credits have been explicitly re-enabled and:

- the user has no BYOK key,
- the user has a positive prepaid credit balance,
- `CENTRAL_OPENAI_API_KEY` is configured,
- and the balance is high enough for a conservative next-response reserve.

If the balance is too low, Sven sends the user back to `/setup` before calling OpenAI.

## Pre-Share Smoke Test

Before inviting friends:

1. Message `t.me/Sven_DadFit_Bot`.
2. Run `/start`.
3. Complete onboarding.
4. Run `/setup`.
5. Add an OpenAI API key.
6. Send `/status` and confirm the API key says connected.
7. Send one normal coaching question.
8. Send a food photo with a short caption.
9. Send a Telegram voice note.
10. Send `/bug test support inbox`.
11. Confirm the ticket appears in Sven Admin.
12. Run `/delete_key` if you want to remove the test key.
