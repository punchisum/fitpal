#!/usr/bin/env node
// E2E for /feedback (user→owner) and the admin /announcement webhook AUTH (does NOT broadcast,
// to avoid spamming real users). The real broadcast is owner-triggered.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY, SECRET = env.TELEGRAM_WEBHOOK_SECRET, ADMIN_SECRET = env.ADMIN_WEBHOOK_SECRET, ADMIN_CHAT = env.ADMIN_CHAT_ID;
const BASE = "https://fitpal-telegram.hartos.workers.dev";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tgId = String(Math.floor(7e8 + Math.random() * 1e8));
let userId, fail = 0;
const ok = (c, m, x) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (x ?? "")}`); if (!c) fail++; };
const sendFitpal = (text) => fetch(`${BASE}/telegram/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify({ update_id: 1, message: { message_id: 1, from: { id: Number(tgId) }, chat: { id: Number(tgId), type: "private" }, date: 1, text } }) }).then((r) => r.status);
const sendAdmin = (secret, fromId, text) => fetch(`${BASE}/admin/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 1, message: { message_id: 1, from: { id: Number(fromId) }, chat: { id: Number(fromId), type: "private" }, date: 1, text } }) }).then((r) => r.status);

async function main() {
  const { data: u } = await admin.auth.admin.createUser({ email: `ad-${tgId}@fitpal.test`, password: "TestPass12345!", email_confirm: true });
  userId = u.user.id;
  await admin.from("profiles").update({ nickname: "FBTester", onboarding_complete: true }).eq("user_id", userId);
  await admin.from("telegram_identities").insert({ user_id: userId, telegram_user_id: tgId, telegram_chat_id: tgId, linked_at: new Date().toISOString() });

  // /feedback stores + (forwards to owner).
  ok((await sendFitpal("/feedback (automated test — please ignore)")) === 200, "/feedback processed");
  await new Promise((r) => setTimeout(r, 600));
  const fb = (await admin.from("feedback").select("message").eq("user_id", userId)).data;
  ok((fb ?? []).length === 1 && /automated test/i.test(fb[0].message), "feedback stored in DB", JSON.stringify(fb?.[0] ?? {}));

  // Admin webhook: wrong secret → 401.
  ok((await sendAdmin("wrong", ADMIN_CHAT, "/announcement hi")) === 401, "admin webhook rejects wrong secret (401)");

  // Admin webhook: correct secret but NON-admin sender → must NOT broadcast (no announcement row).
  const before = (await admin.from("announcements").select("id", { count: "exact", head: true })).count ?? 0;
  ok((await sendAdmin(ADMIN_SECRET, "999999999", "/announcement should be blocked")) === 200, "non-admin /announcement returns 200 (handled)");
  await new Promise((r) => setTimeout(r, 600));
  const after = (await admin.from("announcements").select("id", { count: "exact", head: true })).count ?? 0;
  ok(after === before, "non-admin sender did NOT create an announcement (auth enforced)", `before ${before} after ${after}`);
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log(fail ? `\n✖ Admin/feedback FAILED (${fail})` : "\n✓ Feedback + admin auth passed. (Owner triggers the real /announcement broadcast.)");
    process.exit(fail ? 1 : 0);
  });
