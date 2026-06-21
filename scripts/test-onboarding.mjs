#!/usr/bin/env node
// E2E: a brand-new Telegram user completes onboarding entirely in chat, through the LIVE Worker.
// Verifies auto-account, the full Q&A flow, and a generated active plan. Then cleans up.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER = "https://fitpal-telegram.hartos.workers.dev/telegram/webhook";
const SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tgId = String(Math.floor(8e8 + Math.random() * 1e8));
let fail = 0, userId;
const ok = (c, m, x) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (x ?? "")}`); if (!c) fail++; };

async function send(text) {
  const body = { update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: Number(tgId), is_bot: false, first_name: "T" }, chat: { id: Number(tgId), type: "private" }, date: 1, text } };
  const r = await fetch(WORKER, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify(body) });
  return r.status;
}

async function main() {
  // Full conversation: /start then 10 answers.
  const script = ["/start", "Alex", "28", "male", "180", "82", "1", "2", "4", "barbell dumbbell gym", "none"];
  for (const line of script) {
    const st = await send(line);
    if (st !== 200) { ok(false, `send "${line}" returned 200`, `got ${st}`); return; }
  }
  ok(true, "full onboarding conversation processed (11 messages, all 200)");

  // Resolve the auto-created account.
  const { data: idn } = await admin.from("telegram_identities").select("user_id, onboarding_step").eq("telegram_user_id", tgId).maybeSingle();
  ok(!!idn?.user_id, "auto-created account + linked identity exists");
  userId = idn?.user_id;
  ok(idn?.onboarding_step === 0, "onboarding marked finished (step reset to 0)");

  if (userId) {
    const { data: prof } = await admin.from("profiles").select("nickname, onboarding_complete, birth_year, height_cm").eq("user_id", userId).maybeSingle();
    ok(prof?.onboarding_complete === true, "profile.onboarding_complete = true");
    ok(prof?.nickname === "Alex" && Number(prof?.height_cm) === 180, "profile fields captured from chat (nickname, height)");

    const { data: goal } = await admin.from("fitness_goals").select("primary_goal, start_weight_kg, is_active").eq("user_id", userId).eq("is_active", true).maybeSingle();
    ok(goal?.primary_goal === "lose_fat" && Number(goal?.start_weight_kg) === 82, "active goal captured (lose_fat, 82 kg)");

    const { data: prefs } = await admin.from("training_preferences").select("experience, days_per_week, equipment").eq("user_id", userId).maybeSingle();
    ok(prefs?.experience === "intermediate" && prefs?.days_per_week === 4, "training prefs captured (intermediate, 4 days)");
    ok(Array.isArray(prefs?.equipment) && prefs.equipment.includes("barbell"), "equipment parsed from free text");

    const { data: plan } = await admin.from("fitness_plans").select("plan, is_active").eq("user_id", userId).eq("is_active", true).maybeSingle();
    ok(plan?.plan?.targets?.calories > 0 && plan?.plan?.targets?.proteinG > 0, "active plan generated with real targets", JSON.stringify(plan?.plan?.targets ?? {}));
    ok(plan?.plan?.training?.daysPerWeek === 4, "plan training matches 4 days/week");
  }
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log(fail ? `\n✖ Onboarding E2E FAILED (${fail})` : "\n✓ Telegram chat-onboarding E2E passed — /start → full Q&A → generated plan, no web app needed.");
    process.exit(fail ? 1 : 0);
  });
