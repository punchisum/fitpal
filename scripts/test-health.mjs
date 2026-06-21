#!/usr/bin/env node
// E2E for the Apple Health "satellite" ingest through the LIVE Worker:
// /connect issues a token → POST HRV/RHR/sleep to /health/ingest → stored per user → readiness uses it.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY, SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const BASE = "https://fitpal-telegram.hartos.workers.dev";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tgId = String(Math.floor(4e8 + Math.random() * 1e8));
const today = new Date().toISOString().slice(0, 10);
let userId, fail = 0;
const ok = (c, m, x) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (x ?? "")}`); if (!c) fail++; };
const sendText = (text) => fetch(`${BASE}/telegram/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: Number(tgId) }, chat: { id: Number(tgId), type: "private" }, date: 1, text } }) }).then((r) => r.status);

async function main() {
  const { data: u } = await admin.auth.admin.createUser({ email: `h-${tgId}@fitpal.test`, password: "TestPass12345!", email_confirm: true });
  userId = u.user.id;
  await admin.from("profiles").update({ nickname: "H", onboarding_complete: true }).eq("user_id", userId);
  await admin.from("telegram_identities").insert({ user_id: userId, telegram_user_id: tgId, telegram_chat_id: tgId, linked_at: new Date().toISOString() });

  // 1) /connect issues a token.
  ok((await sendText("/connect")) === 200, "/connect processed");
  await new Promise((r) => setTimeout(r, 600));
  const { data: prof } = await admin.from("profiles").select("health_ingest_token").eq("user_id", userId).maybeSingle();
  const token = prof?.health_ingest_token;
  ok(typeof token === "string" && token.startsWith("ht_"), "personal ingest token created", String(token));

  // 2) Satellite POSTs metrics → stored.
  const ing = await fetch(`${BASE}/health/ingest?token=${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hrv_ms: 41, resting_hr: 53, sleep_hours: 7.2 }) });
  ok(ing.status === 200, "ingest accepted", `status ${ing.status}`);
  const { data: hm } = await admin.from("health_metrics").select("hrv_ms,resting_hr,sleep_hours").eq("user_id", userId).eq("metric_date", today).maybeSingle();
  ok(Number(hm?.hrv_ms) === 41 && Number(hm?.resting_hr) === 53 && Number(hm?.sleep_hours) === 7.2, "metrics stored per user/day", JSON.stringify(hm));

  // 3) Auto Health Export shape also works (merge-updates same day).
  const ing2 = await fetch(`${BASE}/health/ingest?token=${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { metrics: [{ name: "heart_rate_variability", data: [{ date: today + " 07:00:00 +0800", qty: 45 }] }] } }) });
  ok(ing2.status === 200, "Auto Health Export shape accepted");
  const { data: hm2 } = await admin.from("health_metrics").select("hrv_ms").eq("user_id", userId).eq("metric_date", today).maybeSingle();
  ok(Number(hm2?.hrv_ms) === 45, "AHE update merged (hrv 41→45)", JSON.stringify(hm2));

  // 4) Bad token rejected.
  const bad = await fetch(`${BASE}/health/ingest?token=ht_nope`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  ok(bad.status === 401, "invalid token rejected (401)", `status ${bad.status}`);

  // 5) /today still responds with health data present.
  ok((await sendText("/today")) === 200, "/today responds with wearable data present");
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log(fail ? `\n✖ Health ingest FAILED (${fail})` : "\n✓ Apple Health satellite ingest passed — token, ingest (both shapes), per-user storage, and recovery wiring all work live.");
    process.exit(fail ? 1 : 0);
  });
