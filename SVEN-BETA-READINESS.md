# Sven Beta Readiness

## Current Launch Mode

Sven is ready for a small Telegram beta using bring-your-own OpenAI keys only.

Friends message the same bot, but each Telegram chat is treated as a separate user workspace. Their profile, messages, API key, credits, usage, and onboarding state are stored under their own Telegram chat ID.

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

2. Redacted learning queue
   - Stores anonymized signals from onboarding, messages, feedback, support, and safety flags.
   - Keeps up to 5,000 recent learning signals during beta.
   - Uses a hashed user reference, not the raw Telegram chat ID.
   - Redacts API keys, emails, phone numbers, and token-like URL parameters.
   - This queue is for admin review and is not automatically shown to other users.

3. Reviewed Sven Core learnings
   - Manually added in Sven Admin after review.
   - These are the only shared lessons injected into every user's Sven prompt.
   - This is the safety boundary that lets everyone make Sven smarter without leaking one user's raw data into another user's experience.

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

Good Sven Core examples:

- "For busy parents, start with two repeatable full-body sessions before adding optional extras."
- "When a user resists calorie tracking, offer protein/fibre/meal-pattern tracking first."
- "If the user reports guilt or shame around food, switch to neutral language and one next meal action."

Bad Sven Core examples:

- Raw user stories
- Identifiable health details
- A specific user's injury, weight, medication, or schedule
- Anything copied directly from private onboarding fields

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
8. Send `/bug test support inbox`.
9. Confirm the ticket appears in Sven Admin.
10. Run `/delete_key` if you want to remove the test key.
