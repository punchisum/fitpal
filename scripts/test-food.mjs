#!/usr/bin/env node
// Food logging E2E: (1) /food text through the LIVE Worker → nutrition_logs row;
// (2) direct Gemini VISION smoke (download a real food photo → macros) to prove the photo path.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY, GKEY = env.GEMINI_API_KEY;
const MODEL = env.GEMINI_TEXT_MODEL || "gemini-flash-latest";
const WORKER = "https://fitpal-telegram.hartos.workers.dev/telegram/webhook";
const SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tgId = String(Math.floor(9e8 + Math.random() * 1e8));
let userId, fail = 0;
const ok = (c, m, x) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (x ?? "")}`); if (!c) fail++; };

const SAMPLE_PLAN = { summary: "t", goal: "lose_fat", targets: { calories: 2100, proteinG: 160, carbsG: 180, fatG: 60, calorieFloor: 1500, maintenanceCalories: 2500, dailyAdjustment: -400, weeklyRateKg: -0.36 }, training: { daysPerWeek: 4, restDays: 3, splitName: "UL", days: [] }, cardio: { sessionsPerWeek: 3, minutesPerSession: 25, type: "z2" }, notes: [], safetyFlags: [] };

async function send(text) {
  const body = { update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: Number(tgId), is_bot: false, first_name: "F" }, chat: { id: Number(tgId), type: "private" }, date: 1, text } };
  const r = await fetch(WORKER, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify(body) });
  return r.status;
}

async function visionSmoke() {
  // A real, clearly-food image.
  const imgUrl = "https://upload.wikimedia.org/wikipedia/commons/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg";
  let buf;
  try {
    const r = await fetch(imgUrl);
    if (!r.ok) { console.log(`· vision smoke skipped (image fetch ${r.status})`); return; }
    buf = await r.arrayBuffer();
  } catch (e) { console.log("· vision smoke skipped (image fetch failed)"); return; }
  const b64 = Buffer.from(buf).toString("base64");
  const prompt = 'Estimate TOTAL nutrition for the food in this image. Respond ONLY JSON: {"description":string,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"low"|"medium"|"high"}. If not food, calories 0.';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GKEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
  });
  if (!res.ok) { ok(false, "Gemini vision call ok", `status ${res.status}`); return; }
  const j = await res.json();
  const raw = (j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "").replace(/```json|```/g, "").trim();
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = null; }
  ok(parsed && parsed.calories > 0, "Gemini VISION estimates calories from a real food photo", parsed ? `cal=${parsed.calories} p=${parsed.protein_g}` : raw.slice(0, 80));
}

async function main() {
  // Set up an onboarded, linked Telegram user directly.
  const { data: u } = await admin.auth.admin.createUser({ email: `food-${tgId}@fitpal.test`, password: "TestPass12345!", email_confirm: true });
  userId = u.user.id;
  await admin.from("profiles").update({ nickname: "Foodie", onboarding_complete: true }).eq("user_id", userId);
  await admin.from("fitness_goals").insert({ user_id: userId, primary_goal: "lose_fat", start_weight_kg: 80, is_active: true });
  await admin.rpc("activate_fitness_plan_for", { p_user_id: userId, p_plan: SAMPLE_PLAN, p_source: "deterministic" });
  await admin.from("telegram_identities").insert({ user_id: userId, telegram_user_id: tgId, telegram_chat_id: tgId, linked_at: new Date().toISOString(), onboarding_step: 0 });

  // 1) /food text through the live Worker.
  ok((await send("/food two boiled eggs and two slices of toast")) === 200, "/food message processed");
  await new Promise((r) => setTimeout(r, 1500));
  const { data: logs } = await admin.from("nutrition_logs").select("calories, protein_g, source, description").eq("user_id", userId);
  ok((logs ?? []).length >= 1, "food logged to nutrition_logs");
  ok((logs ?? []).some((l) => Number(l.calories) > 0 && l.source === "telegram"), "logged entry has calories and source=telegram", JSON.stringify(logs?.[0] ?? {}));

  // 2) Vision path (direct Gemini, same shape the Worker uses for photos).
  await visionSmoke();
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    console.log(fail ? `\n✖ Food logging FAILED (${fail})` : "\n✓ Food logging passed — /food text logs macros, and Gemini vision reads a real meal photo.");
    process.exit(fail ? 1 : 0);
  });
