#!/usr/bin/env node
// E2E for the feature wave through the LIVE Worker: /again, /review (+Apply), /barcode, /chart, /streak.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY, SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const BASE = "https://fitpal-telegram.hartos.workers.dev";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tgId = String(Math.floor(3e8 + Math.random() * 1e8));
const today = new Date().toISOString().slice(0, 10);
let userId, fail = 0;
const ok = (c, m, x) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (x ?? "")}`); if (!c) fail++; };
const PLAN = { summary: "A lose fat plan: 2100 kcal/day, 160 g protein.", goal: "lose_fat", targets: { calories: 2100, proteinG: 160, carbsG: 180, fatG: 60, calorieFloor: 1500, maintenanceCalories: 2500, dailyAdjustment: -400, weeklyRateKg: -0.36 }, training: { daysPerWeek: 4, restDays: 3, splitName: "UL", days: [] }, cardio: { sessionsPerWeek: 3, minutesPerSession: 25, type: "z" }, notes: [], safetyFlags: [] };
const sendText = (text) => fetch(`${BASE}/telegram/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: Number(tgId) }, chat: { id: Number(tgId), type: "private" }, date: 1, text } }) }).then((r) => r.status);
const sendCb = (data) => fetch(`${BASE}/telegram/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), callback_query: { id: "c" + Math.random(), from: { id: Number(tgId) }, message: { message_id: 1, chat: { id: Number(tgId) } }, data } }) }).then((r) => r.status);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function main() {
  const { data: u } = await admin.auth.admin.createUser({ email: `ft-${tgId}@fitpal.test`, password: "TestPass12345!", email_confirm: true });
  userId = u.user.id;
  await admin.from("profiles").update({ nickname: "F", onboarding_complete: true }).eq("user_id", userId);
  await admin.from("fitness_goals").insert({ user_id: userId, primary_goal: "lose_fat", start_weight_kg: 82, is_active: true });
  await admin.rpc("activate_fitness_plan_for", { p_user_id: userId, p_plan: PLAN, p_source: "deterministic" });
  await admin.from("telegram_identities").insert({ user_id: userId, telegram_user_id: tgId, telegram_chat_id: tgId, linked_at: new Date().toISOString() });

  // /again: seed a food log, then /again should add another.
  await admin.from("nutrition_logs").insert({ user_id: userId, log_date: today, description: "oats", calories: 300, protein_g: 12, source: "telegram" });
  await sendText("/again");
  await new Promise((r) => setTimeout(r, 600));
  let logs = (await admin.from("nutrition_logs").select("id").eq("user_id", userId)).data;
  ok((logs ?? []).length === 2, "/again re-logs the last meal (2 logs now)", `${(logs ?? []).length}`);

  // /barcode: real Open Food Facts product (Nutella) → draft.
  ok((await sendText("/barcode 3017620422003")) === 200, "/barcode processed");
  await new Promise((r) => setTimeout(r, 1200));
  let drafts = (await admin.from("nutrition_drafts").select("description,calories").eq("user_id", userId)).data;
  ok((drafts ?? []).length >= 1 && Number(drafts[0].calories) > 0, "/barcode created a draft from Open Food Facts", JSON.stringify(drafts?.[0] ?? {}));

  // /chart: needs >=2 weigh-ins.
  await admin.from("daily_checkins").upsert({ user_id: userId, checkin_date: daysAgo(14), bodyweight_kg: 82 }, { onConflict: "user_id,checkin_date" });
  await admin.from("daily_checkins").upsert({ user_id: userId, checkin_date: today, bodyweight_kg: 80 }, { onConflict: "user_id,checkin_date" });
  ok((await sendText("/chart")) === 200, "/chart processed (sends image)");

  // /streak: any log today → streak >= 1; command responds.
  ok((await sendText("/streak")) === 200, "/streak processed");

  // /review: 82→80 over 14 days = -1kg/wk vs -0.36 target → proposal to EAT MORE.
  await sendText("/review");
  await new Promise((r) => setTimeout(r, 800));
  const prop = (await admin.from("plan_adjustment_proposals").select("id,proposed_change,status").eq("user_id", userId).eq("status", "pending").maybeSingle()).data;
  ok(!!prop, "/review created a pending proposal");
  ok(prop && prop.proposed_change?.targets?.calories > 2100, "proposal increases calories (losing too fast)", String(prop?.proposed_change?.targets?.calories));

  // Apply it.
  await sendCb(`pp:ok:${prop.id}`);
  await new Promise((r) => setTimeout(r, 800));
  const active = (await admin.from("fitness_plans").select("plan").eq("user_id", userId).eq("is_active", true).maybeSingle()).data;
  ok(Number(active?.plan?.targets?.calories) === Number(prop.proposed_change.targets.calories), "Apply button activated the new plan", String(active?.plan?.targets?.calories));
  const applied = (await admin.from("plan_adjustment_proposals").select("status").eq("id", prop.id).maybeSingle()).data;
  ok(applied?.status === "applied", "proposal marked applied");
  const actives = (await admin.from("fitness_plans").select("id").eq("user_id", userId).eq("is_active", true)).data;
  ok((actives ?? []).length === 1, "still exactly one active plan");
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log(fail ? `\n✖ Feature wave FAILED (${fail})` : "\n✓ Feature wave passed — /again, /barcode, /chart, /streak, /review + Apply all work live.");
    process.exit(fail ? 1 : 0);
  });
