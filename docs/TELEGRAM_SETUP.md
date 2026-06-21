# Telegram bot — Fitpal

Bot: **@Fitpal_beta_bot**. The bot is a self-contained Cloudflare Worker (`src/worker/telegram-webhook.ts`)
that talks directly to Supabase (service role, user-scoped) and Gemini. No Trigger.dev dependency for
the request/response path.

## Live deployment (already done)
- Worker: `https://fitpal-telegram.hartos.workers.dev`
- Webhook registered with the bot, secured by `x-telegram-bot-api-secret-token` = `TELEGRAM_WEBHOOK_SECRET`.
- Worker secrets set: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. Var: `GEMINI_TEXT_MODEL`.

## Redeploy after changes
```bash
export CLOUDFLARE_API_TOKEN=...   # from .env.local
export CLOUDFLARE_ACCOUNT_ID=...
npm run worker:deploy
```
Secrets persist across deploys. To rotate one: `printf '%s' "VALUE" | npx wrangler secret put NAME`.

## Re-register the webhook (only if the URL changes)
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -H "Content-Type: application/json" \
  -d '{"url":"https://fitpal-telegram.hartos.workers.dev/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

## Commands
- `/start` — intro + how to link
- `/link CODE` — link the Telegram account to a Fitpal account (code from app → Settings → Telegram)
- `/plan` — current plan & targets
- `/weight 80.5` — log today's bodyweight
- `/help` — command list
- any other text — grounded AI coaching (rate-limited, safety-gated)

## Safety
Unlinked accounts can only `/start` and `/link` — no data access. Eating-disorder / self-harm / acute-medical
messages bypass the LLM and return safe guidance + a professional referral (same logic as the web app).

## Test
`node scripts/test-telegram.mjs` drives real updates through the live Worker and verifies DB effects (link, log, coach, safety), then cleans up.

## Scheduled jobs (Trigger.dev — deploy separately)
`src/trigger/daily-reminder.ts` (daily nudge) and `src/trigger/weekly-review.ts` (Monday summary) deploy via:
```bash
npx trigger.dev login    # one-time, opens browser (personal access token)
npm run trigger:deploy
```
Env vars (`SUPABASE_*`, `TELEGRAM_BOT_TOKEN`) are already set in the Trigger.dev dashboard.
