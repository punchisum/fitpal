# Apple Health → Fitpal recovery (the "satellite")

Fitpal computes recovery readiness from **real HRV, resting HR, and sleep** when a user connects Apple
Health, and falls back to the subjective `/checkin` otherwise. Because Apple Health is on-device, a tiny
on-phone "satellite" pushes the data up to a **per-user token URL**.

## The ground station (server side — built)
- Each user runs `/connect` in the bot → gets a personal token `ht_…` and a sync URL:
  `https://fitpal-telegram.hartos.workers.dev/health/ingest?token=<token>`
- The Worker route `POST /health/ingest?token=…` resolves the token → user, parses the payload, and
  upserts `health_metrics(user_id, metric_date, hrv_ms, resting_hr, sleep_hours)` (one row/day, merge).
- Recovery (`lib/recovery.ts`) blends HRV/RHR vs a 7-day baseline with the check-in; surfaced in `/today`,
  after `/checkin`, and for "should I train today?".
- Accepts **two payload shapes**: the simple Shortcut JSON and Auto Health Export's metrics array.
- Verified live: `node scripts/test-health.mjs` (token, both shapes, per-user storage, 401 on bad token).

## Route A — Auto Health Export (easiest if you own the app; what Hart uses)
1. In the bot: `/connect` → copy your sync URL (with your token).
2. Auto Health Export app → **Automations** → add a **REST API** automation:
   - URL: your personal `…/health/ingest?token=…`
   - Method: `POST`, Format: JSON
   - Metrics: Heart Rate Variability, Resting Heart Rate, Sleep Analysis
   - Schedule: daily (morning)
3. Done. It posts each morning; Fitpal recovery uses real data.

## Route B — Apple Shortcut (free, no paid app)
Build once on the iPhone (Shortcuts app → new shortcut):
1. **Find Health Samples** → *Heart Rate Variability* → Limit **1**, Sort by **End Date**, **Latest First**.
   Then **Get Details of Health Samples → Value** → set variable `HRV`.
2. **Find Health Samples** → *Resting Heart Rate* → Limit 1, latest → Value → variable `RHR`.
3. **Find Health Samples** → *Sleep Analysis* → Today → (sum asleep hours) → variable `SLEEP`.
4. **Text** action with this JSON (insert the variables):
   ```json
   {"hrv_ms": HRV, "resting_hr": RHR, "sleep_hours": SLEEP}
   ```
5. **Get Contents of URL**:
   - URL: your personal `…/health/ingest?token=…`
   - Method: `POST` · Header `Content-Type: application/json` · Request Body: **File** = the Text above.
6. **Automation** tab → **Personal Automation** → **Time of Day 7:00am**, daily → Run this shortcut →
   turn **Ask Before Running OFF**. (Grant Health read access on first run.)

That's the satellite: every morning it reads last night's numbers and beams them to Fitpal.

## Route C — Cloud wearables via Terra (Oura / Whoop / Garmin / Fitbit / Google Fit) — NO app
These have real cloud APIs, so the user taps one link and authorizes — no phone app, no Shortcut.
`/connect` shows a "tap to connect" link when Terra is configured. Built + tested
(`src/worker/terra.ts`, `terra.test.ts`); webhook is signature-verified and **inert (503) until configured.**

### Activate (owner, ~10 min)
1. Sign up at **tryterra.co** (free dev tier) → Dashboard → get **dev-id**, **x-api-key**, and a destination **signing secret**.
2. Add a **webhook destination** in Terra pointing to:
   `https://fitpal-telegram.hartos.workers.dev/terra-webhook`  (copy that destination's signing secret).
3. Set Worker secrets (or hand the 3 values to the agent):
   ```bash
   printf '%s' "<dev-id>"        | npx wrangler secret put TERRA_DEV_ID         -c wrangler.telegram.jsonc
   printf '%s' "<x-api-key>"     | npx wrangler secret put TERRA_API_KEY        -c wrangler.telegram.jsonc
   printf '%s' "<signing-secret>"| npx wrangler secret put TERRA_SIGNING_SECRET -c wrangler.telegram.jsonc
   ```
4. Done. `/connect` now shows the watch link; a user taps it → picks Oura/Whoop/etc. → authorizes →
   Terra webhooks normalized HRV/RHR/sleep to us → recovery uses it. (`reference_id` = the Fitpal user id.)

How it maps: `/connect` calls `POST api.tryterra.co/v2/auth/generateWidgetSession` with
`reference_id = <user_id>`; the webhook verifies `terra-signature` (HMAC-SHA256 of `t.body`) and reads
`heart_rate_data.summary.avg_hrv_rmssd` / `resting_hr_bpm` and
`sleep_durations_data.asleep.duration_asleep_state_seconds`.

## Notes
- HRV in Shortcuts is the SDNN sample (ms). Sleep on newer watches splits into stages — summing the
  "Asleep" samples gives total sleep.
- Recovery still works without any of this — `/checkin` (sleep/energy/soreness) is the universal fallback.
- All three routes write the same `health_metrics` table and feed the same recovery math.
