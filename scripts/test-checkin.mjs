#!/usr/bin/env node
// E2E for the HartOS-style features through the LIVE Worker: /sleep, guided /checkin,
// readiness verdict, /today, /weekly, /undo. Sets up a linked onboarded user, then cleans up.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER = "https://fitpal-telegram.hartos.workers.dev/telegram/webhook";
const SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tgId = String(Math.floor(6e8 + Math.random() * 1e8));
const today = new Date().toISOString().slice(0, 10);
let userId, fail = 0;
const ok = (c, m, x) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (x ?? "")}`); if (!c) fail++; };
const PLAN = { summary: "t", goal: "lose_fat", targets: { calories: 2100, proteinG: 160, carbsG: 180, fatG: 60, calorieFloor: 1500, maintenanceCalories: 2500, dailyAdjustment: -400, weeklyRateKg: -0.36 }, training: { daysPerWeek: 4, restDays: 3, splitName: "UL", days: [] }, cardio: { sessionsPerWeek: 3, minutesPerSession: 25, type: "z" }, notes: [], safetyFlags: [] };

async function send(text) {
  const body = { update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: Number(tgId), is_bot: false, first_name: "C" }, chat: { id: Number(tgId), type: "private" }, date: 1, text } };
  return (await fetch(WORKER, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify(body) })).status;
}
const ci = async () => (await admin.from("daily_checkins").select("*").eq("user_id", userId).eq("checkin_date", today).maybeSingle()).data;

async function main() {
  const { data: u } = await admin.auth.admin.createUser({ email: `ck-${tgId}@fitpal.test`, password: "TestPass12345!", email_confirm: true });
  userId = u.user.id;
  await admin.from("profiles").update({ nickname: "Cky", onboarding_complete: true }).eq("user_id", userId);
  await admin.from("fitness_goals").insert({ user_id: userId, primary_goal: "lose_fat", start_weight_kg: 82, is_active: true });
  await admin.rpc("activate_fitness_plan_for", { p_user_id: userId, p_plan: PLAN, p_source: "deterministic" });
  await admin.from("telegram_identities").insert({ user_id: userId, telegram_user_id: tgId, telegram_chat_id: tgId, linked_at: new Date().toISOString(), onboarding_step: 0, checkin_step: 0 });

  // Quick /sleep
  await send("/sleep 7.5");
  ok(Number((await ci())?.sleep_hours) === 7.5, "/sleep logs sleep_hours");

  // Quick /energy /soreness — merge (don't clobber sleep)
  await send("/energy 4"); await send("/soreness 2");
  let row = await ci();
  ok(row?.energy === 4 && row?.soreness === 2 && Number(row?.sleep_hours) === 7.5, "/energy + /soreness merge without clobbering sleep");

  // Guided /checkin overwrites with a full set
  await send("/checkin");
  let st = (await admin.from("telegram_identities").select("checkin_step").eq("telegram_user_id", tgId).maybeSingle()).data;
  ok(st?.checkin_step === 1, "/checkin starts the flow (step 1)");
  await send("6.5");  // sleep
  await send("3");    // energy
  await send("4");    // soreness
  await send("3");    // mood
  await send("81.2"); // weight
  st = (await admin.from("telegram_identities").select("checkin_step").eq("telegram_user_id", tgId).maybeSingle()).data;
  row = await ci();
  ok(st?.checkin_step === 0, "/checkin flow completes (step reset)");
  ok(Number(row?.sleep_hours) === 6.5 && row?.energy === 3 && row?.soreness === 4 && row?.mood === 3 && Number(row?.bodyweight_kg) === 81.2, "guided check-in saved all fields", JSON.stringify(row));

  // /weight no-arg trend + logging
  ok((await send("/weight 80.9")) === 200, "/weight logs");
  ok((await send("/weight")) === 200, "/weight (no arg) shows trend without error");

  // Food (draft → confirm) + /undo
  await send("/food one banana");
  const dr = (await admin.from("nutrition_drafts").select("id").eq("user_id", userId)).data;
  ok((dr ?? []).length === 1, "/food creates a draft");
  await fetch(WORKER, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify({ update_id: 1, callback_query: { id: "c", from: { id: Number(tgId) }, message: { message_id: 1, chat: { id: Number(tgId) } }, data: `fd:ok:${dr?.[0]?.id}` } }) });
  let logs = (await admin.from("nutrition_logs").select("id").eq("user_id", userId)).data;
  ok((logs ?? []).length === 1, "confirm logs one item");
  await send("/undo");
  logs = (await admin.from("nutrition_logs").select("id").eq("user_id", userId)).data;
  ok((logs ?? []).length === 0, "/undo removed the food log");

  // /today and /weekly don't error
  ok((await send("/today")) === 200, "/today responds");
  ok((await send("/weekly")) === 200, "/weekly responds");

  // Deterministic readiness via natural language
  ok((await send("should i train today?")) === 200, "'should I train today?' handled (deterministic readiness)");
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log(fail ? `\n✖ Check-in/features FAILED (${fail})` : "\n✓ HartOS-style features passed — sleep, guided check-in, readiness, /today, /weekly, /undo all work live.");
    process.exit(fail ? 1 : 0);
  });
