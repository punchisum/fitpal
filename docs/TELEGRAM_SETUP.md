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
- **📸 send a photo of a meal** — Gemini Vision estimates calories + macros and logs it (`source=photo`)
- `/food` (alias `/log`) `2 eggs and toast` — log food by text · `/undo` removes the last food log
- `/today` — food vs targets + today's check-in + recovery readiness
- `/checkin` — guided daily check-in (sleep, energy, soreness, mood, weight)
- `/sleep 7.5` · `/energy 4` · `/soreness 3` · `/mood 4` — quick check-in logs
- `/weight 80.5` — log weight · `/weight` (no arg) — weight trend
- `/weekly` — 7-day review (workouts, sleep, calories, weight change)
- `/plan` — current plan & targets · `/restart` — rebuild the plan
- `/help` — command list · `/link CODE` — (optional) link a web-dashboard account
- "should I train today?" — deterministic **recovery readiness** from today's check-in
- any other text — grounded AI coaching (recovery-aware, rate-limited, safety-gated)

## Recovery readiness (`lib/recovery.ts`)
Deterministic verdict from the subjective check-in (sleep + energy + soreness) → score 0-100 → band
(green/amber/red) → readiness (full/controlled/easy) + a directive. The public analog of HartOS's
HRV/RHR recovery score (no wearable needed). The LLM only re-phrases it; it never decides it.
Surfaced in `/today`, after each check-in, and for "should I train?". Unit-tested (`lib/recovery.test.ts`).

## Owner notifications (optional)
Set Worker secrets `ADMIN_BOT_TOKEN` (e.g. @HartOS_Command_Bot) + `ADMIN_CHAT_ID` to get a Telegram
ping on every completed signup (name, goal, plan, total users). No-op if unset. Sent via a separate
admin bot — keeps owner alerts off the public bot.

## Food logging (`src/worker/food.ts`) — draft-confirm protocol
`estimateFood(apiKey, model, { text | imageBase64 })` calls Gemini (multimodal) and returns
`{ description, calories, protein_g, carbs_g, fat_g, confidence }` as JSON. Photos are downloaded from
Telegram (`getFile` → file URL → `toBase64`) and sent inline.

**Nothing is logged immediately.** `/food` or a photo creates a row in `nutrition_drafts` and replies with
inline buttons: `[-50%] [-25%] [+25%] [+50%]` and `[✅ Confirm] [✖ Cancel]`. Adjust buttons scale the draft
(calories + macros) and `editMessageText` re-renders it; Confirm moves it to `nutrition_logs` and clears the
draft; Cancel discards it. Requires `allowed_updates: ["message","callback_query"]` on the webhook.
Verified by `node scripts/test-draft.mjs` (draft → +25% → confirm/cancel) and `test-food.mjs` (+ vision smoke).

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
