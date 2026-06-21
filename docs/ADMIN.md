# Admin & feedback

Two channels connect you (the owner) and your users.

## 📢 `/announcement` — broadcast to all users
Send `/announcement <message>` to your **private command bot** (`@HartOS_Command_Bot`).
The bot replies `✅ Announced to N/M users` and every Fitpal user receives the message
**from `@Fitpal_beta_bot`** prefixed with 📢.

- **Owner-only.** The handler checks `from.id == ADMIN_CHAT_ID`; anyone else gets `⛔ Private admin bot`.
- The command bot's webhook (`/admin/webhook`) is protected by `ADMIN_WEBHOOK_SECRET`.
- Every broadcast is logged to the `announcements` table (`message`, `sent_count`).
- Broadcast targets all rows in `telegram_identities` with a `telegram_chat_id` (active).

Example:
```
/announcement New: send /menu when eating out for an order that fits your macros 🍽️
```

## 💬 `/feedback` — users → you
Users send `/feedback <message>` in `@Fitpal_beta_bot`. It is:
1. stored in the `feedback` table (`user_id`, `message`, `created_at`), and
2. forwarded to you instantly via `@HartOS_Command_Bot` (`💬 Feedback from <nickname>: …`).

You also receive **new-signup** notifications on the same command bot.

## Setup (already wired)
- Worker secrets: `ADMIN_BOT_TOKEN`, `ADMIN_CHAT_ID`, `ADMIN_WEBHOOK_SECRET`.
- Command-bot webhook: `setWebhook` → `https://fitpal-telegram.hartos.workers.dev/admin/webhook`
  with `secret_token = ADMIN_WEBHOOK_SECRET` and `allowed_updates=["message"]`.
- Command menu: `/announcement`, `/help`.

## Tests
`node scripts/test-admin.mjs` — verifies `/feedback` storage + forwarding and that the
admin webhook enforces auth (wrong secret → 401; non-owner → no broadcast). The real
broadcast is owner-triggered to avoid messaging live users from a test.

> Scaling note: broadcasts send sequentially. Telegram allows ~30 msg/s; for a large user
> base, move the send loop into `ctx.waitUntil` with chunked batching.
