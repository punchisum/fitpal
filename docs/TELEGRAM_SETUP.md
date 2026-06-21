# Telegram bot — Fitpal (PRIMARY interface)

Bot: **@Fitpal_beta_bot**. Telegram-first, like HartOS but multi-user. A friend just opens the bot:
`/start` → the bot **auto-creates their account** and runs **onboarding as a chat conversation**
(10 questions) → generates their plan → then they log + coach in chat. No website signup needed.

The bot is a self-contained Cloudflare Worker (`src/worker/telegram-webhook.ts` + `onboarding.ts`)
that talks directly to Supabase (service role, user-scoped) + Gemini. No Trigger.dev dependency for
the request/response path. The web app is an OPTIONAL dashboard.

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
- `/start` — new users: auto-creates account + starts onboarding. Existing: resumes / greets.
- `/plan` — current plan & targets
- `/weight 80.5` — log today's bodyweight
- `/restart` — rebuild the plan from scratch (re-runs onboarding)
- `/help` — command list
- `/link CODE` — (optional) link to an account created on the web dashboard
- any other text — grounded AI coaching (rate-limited, safety-gated)

Command menu is registered via `setMyCommands` (the ⋮ menu in Telegram).

## Onboarding flow (in chat)
`src/worker/onboarding.ts` is a 10-step state machine (name, age, sex, height, weight, goal, experience,
days/week, equipment, injuries). Progress is stored on `telegram_identities.onboarding_step/_answers`.
On completion the Worker runs the deterministic planner and writes profile/goal/prefs/plan. Verified by
`node scripts/test-onboarding.mjs` (live, full conversation → generated plan).

## Safety
A GLOBAL safety net runs on every non-command message (onboarding, commands, or coaching): eating-disorder /
self-harm / acute-medical signals never reach the LLM and return safe guidance + a professional referral.

## Test
`node scripts/test-telegram.mjs` drives real updates through the live Worker and verifies DB effects (link, log, coach, safety), then cleans up.

## Scheduled jobs (Trigger.dev — deploy separately)
`src/trigger/daily-reminder.ts` (daily nudge) and `src/trigger/weekly-review.ts` (Monday summary) deploy via:
```bash
npx trigger.dev login    # one-time, opens browser (personal access token)
npm run trigger:deploy
```
Env vars (`SUPABASE_*`, `TELEGRAM_BOT_TOKEN`) are already set in the Trigger.dev dashboard.
