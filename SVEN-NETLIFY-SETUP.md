# Sven Netlify Setup

Sven is now built into this Netlify site as Functions.

For the beta operating model, user-separation notes, learning workflow, and launch checklist, see `SVEN-BETA-READINESS.md`.

## Public Endpoints

- Telegram webhook: `/api/sven-telegram?secret=SVEN_WEBHOOK_SECRET_PATH`
- Setup page: `/api/sven-setup?token=...`
- Billing checkout: `/api/sven-billing?token=...&pack=starter` (disabled unless prepaid credits are explicitly enabled)
- Stripe webhook: `/api/sven-stripe-webhook` (future prepaid-credit mode)
- Admin: `/api/sven-admin?token=SVEN_ADMIN_TOKEN`
- Set Telegram webhook: `/api/sven-set-webhook?token=SVEN_ADMIN_TOKEN`

## Required Netlify Environment Variables

Minimum BYOK beta:

```text
TELEGRAM_BOT_TOKEN
SVEN_PUBLIC_BASE_URL=https://harrysharman.com
SVEN_WEBHOOK_SECRET_PATH
SVEN_SECRET
SVEN_ADMIN_TOKEN
OPENAI_DEFAULT_MODEL=gpt-5-nano
SVEN_DAILY_TOKEN_LIMIT=120000
SETUP_TOKEN_TTL_MINUTES=60
```

Optional BYOK beta tuning:

```text
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Optional future prepaid credits:

```text
SVEN_ENABLE_PREPAID_CREDITS=true
CENTRAL_OPENAI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_STARTER
STRIPE_PRICE_ID_STANDARD
CREDIT_TOKENS_STARTER=250000
CREDIT_TOKENS_STANDARD=750000
```

## Launch Steps

1. Set the environment variables in Netlify project settings.
2. Deploy `main`.
3. Open:

   ```text
   https://harrysharman.com/api/sven-set-webhook?token=SVEN_ADMIN_TOKEN
   ```

4. Message:

   ```text
   https://t.me/Sven_DadFit_Bot
   ```

5. Open admin:

   ```text
   https://harrysharman.com/api/sven-admin?token=SVEN_ADMIN_TOKEN
   ```

## Notes

- Production storage uses Netlify Blobs.
- Local tests use `.sven-data/`.
- User API keys are encrypted with `SVEN_SECRET`.
- Friends can use BYOK immediately once Telegram webhook is set.
- Telegram text, voice notes, food photos, and screenshots are supported.
- Sven is not directly connected to Apple Health or Google Fit yet. Users should send screenshots or context messages for health, workout, sleep, and recovery data.
- Raw Telegram photos, screenshots, and audio files are downloaded temporarily for model calls and are not stored by Sven.
- Prepaid Stripe checkout is disabled for the beta unless `SVEN_ENABLE_PREPAID_CREDITS=true` is deliberately configured.
- Friends can report broken flows with `/bug what happened`; these appear in the admin Support Inbox and weekly report.
