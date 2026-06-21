#!/usr/bin/env node
// E2E for the food draft-confirm protocol through the LIVE Worker:
// /food → draft (no log yet) → adjust +25% → confirm (logs adjusted) ; and a cancel path.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER = "https://fitpal-telegram.hartos.workers.dev/telegram/webhook";
const SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tgId = String(Math.floor(5e8 + Math.random() * 1e8));
let userId, fail = 0;
const ok = (c, m, x) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (x ?? "")}`); if (!c) fail++; };
const PLAN = { summary: "t", goal: "lose_fat", targets: { calories: 2100, proteinG: 160, carbsG: 180, fatG: 60, calorieFloor: 1500, maintenanceCalories: 2500, dailyAdjustment: -400, weeklyRateKg: -0.36 }, training: { daysPerWeek: 4, restDays: 3, splitName: "UL", days: [] }, cardio: { sessionsPerWeek: 3, minutesPerSession: 25, type: "z" }, notes: [], safetyFlags: [] };
const post = (b) => fetch(WORKER, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify(b) }).then((r) => r.status);
const sendText = (text) => post({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: Number(tgId) }, chat: { id: Number(tgId), type: "private" }, date: 1, text } });
const sendCb = (data) => post({ update_id: Math.floor(Math.random() * 1e9), callback_query: { id: "cb" + Math.random(), from: { id: Number(tgId) }, message: { message_id: 1, chat: { id: Number(tgId) } }, data } });
const drafts = async () => (await admin.from("nutrition_drafts").select("*").eq("user_id", userId).order("created_at", { ascending: false })).data ?? [];
const logs = async () => (await admin.from("nutrition_logs").select("*").eq("user_id", userId)).data ?? [];

async function main() {
  const { data: u } = await admin.auth.admin.createUser({ email: `dr-${tgId}@fitpal.test`, password: "TestPass12345!", email_confirm: true });
  userId = u.user.id;
  await admin.from("profiles").update({ nickname: "Dr", onboarding_complete: true }).eq("user_id", userId);
  await admin.from("fitness_goals").insert({ user_id: userId, primary_goal: "lose_fat", start_weight_kg: 80, is_active: true });
  await admin.rpc("activate_fitness_plan_for", { p_user_id: userId, p_plan: PLAN, p_source: "deterministic" });
  await admin.from("telegram_identities").insert({ user_id: userId, telegram_user_id: tgId, telegram_chat_id: tgId, linked_at: new Date().toISOString() });

  // 1) /food creates a DRAFT, not a log.
  await sendText("/food grilled chicken breast and rice");
  let d = await drafts();
  ok(d.length === 1, "/food creates a draft");
  ok((await logs()).length === 0, "nothing logged yet (draft pending)");
  const draftId = d[0]?.id;
  const base = Number(d[0]?.calories);
  ok(base > 0, "draft has an estimated calorie value", String(base));
  ok(Array.isArray(d[0]?.items) && d[0].items.length >= 1 && d[0].items[0].name, "draft has an itemized breakdown", JSON.stringify(d[0]?.items?.[0] ?? {}));

  // 2) Adjust +25%.
  await sendCb(`fd:p25:${draftId}`);
  d = await drafts();
  ok(Math.abs(Number(d[0]?.calories) - Math.round(base * 1.25)) <= 1, "+25% button scales the draft calories", `${base}→${d[0]?.calories}`);
  const adjusted = Number(d[0]?.calories);

  // 3) Confirm → logs the adjusted value, draft removed.
  await sendCb(`fd:ok:${draftId}`);
  ok((await drafts()).length === 0, "confirm removes the draft");
  const L = await logs();
  ok(L.length === 1 && Math.abs(Number(L[0].calories) - adjusted) <= 1, "confirm logs the ADJUSTED calories", `logged ${L[0]?.calories} vs ${adjusted}`);

  // 4) Cancel path.
  await sendText("/food a chocolate bar");
  const d2 = await drafts();
  ok(d2.length === 1, "second /food creates a new draft");
  await sendCb(`fd:no:${d2[0].id}`);
  ok((await drafts()).length === 0, "cancel discards the draft");
  ok((await logs()).length === 1, "cancel logs nothing (still just the 1 confirmed)");
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log(fail ? `\n✖ Draft-confirm FAILED (${fail})` : "\n✓ Draft-confirm protocol passed — estimate → adjust ±% → confirm/cancel all work through the live bot.");
    process.exit(fail ? 1 : 0);
  });
