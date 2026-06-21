// Fitpal Telegram bot — Cloudflare Worker. TELEGRAM-FIRST.
// /start auto-creates an account and runs onboarding in chat; then log + coach in chat.
// Self-contained: Supabase via service-role REST (user-scoped) + Gemini via REST. No Trigger dependency.
import { SAFETY_SYSTEM_PROMPT, detectSafetySignal } from "../../lib/llm/safety";
import { generatePlan } from "../../lib/plan";
import type { FitnessPlan } from "../../lib/plan/types";
import { STEP_COUNT, firstPrompt, promptForStep, parseStep, buildPlanInput, type Answers } from "./onboarding";
import { estimateFood, toBase64, type FoodEstimate } from "./food";
import { computeReadiness } from "../../lib/recovery";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_TEXT_MODEL?: string;
  // Optional owner notifications (e.g. new signups) sent via a separate admin bot.
  ADMIN_BOT_TOKEN?: string;
  ADMIN_CHAT_ID?: string;
};

// Notify the owner via a separate admin bot (e.g. @HartOS_Command_Bot). No-op if unconfigured.
async function notifyAdmin(env: Env, text: string): Promise<void> {
  if (!env.ADMIN_BOT_TOKEN || !env.ADMIN_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.ADMIN_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.ADMIN_CHAT_ID, text, disable_web_page_preview: true }),
    });
  } catch { /* never let admin notify break the user flow */ }
}

// Count of fully-onboarded users (for the signup notification).
async function onboardedCount(env: Env): Promise<number | null> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?onboarding_complete=eq.true&select=user_id`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = r.headers.get("content-range"); // e.g. "0-0/42"
  const total = cr?.split("/")?.[1];
  return total ? Number(total) : null;
}

const CHAT_DAILY_LIMIT = 40;

// ── Supabase REST (service role) ──
function sbHeaders(env: Env) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
}
async function sbGet(env: Env, path: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env) });
  if (!r.ok) return [];
  return (await r.json()) as Record<string, unknown>[];
}
async function sbInsert(env: Env, table: string, row: Record<string, unknown>, upsert = false): Promise<boolean> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...sbHeaders(env), Prefer: upsert ? "resolution=merge-duplicates" : "return=minimal" }, body: JSON.stringify(row),
  });
  return r.ok;
}
async function sbPatch(env: Env, table: string, filter: string, body: Record<string, unknown>): Promise<boolean> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: "PATCH", headers: { ...sbHeaders(env), Prefer: "return=minimal" }, body: JSON.stringify(body) });
  return r.ok;
}
async function sbDelete(env: Env, table: string, filter: string): Promise<boolean> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: { ...sbHeaders(env), Prefer: "return=minimal" } });
  return r.ok;
}
function daysAgo(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
async function sbRpc<T>(env: Env, fn: string, body: Record<string, unknown>): Promise<T | null> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: sbHeaders(env), body: JSON.stringify(body) });
  if (!r.ok) return null;
  const text = await r.text();
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

// ── GoTrue admin (create accounts) ──
async function adminCreateUser(env: Env, email: string, telegramId: string): Promise<string | null> {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST", headers: sbHeaders(env),
    body: JSON.stringify({ email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true, user_metadata: { telegram_id: telegramId } }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { id?: string };
  return j.id ?? null;
}

// ── Telegram ──
async function tgSend(env: Env, chatId: number | string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

// ── Gemini ──
async function gemini(env: Env, system: string, history: { role: string; content: string }[], userText: string): Promise<string> {
  const model = env.GEMINI_TEXT_MODEL ?? "gemini-flash-latest";
  const contents = [
    ...history.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    { role: "user", parts: [{ text: userText }] },
  ];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.6, maxOutputTokens: 600 } }),
  });
  if (!r.ok) return "I'm having trouble reaching my coaching brain right now — try again in a moment.";
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } };
  if (j.promptFeedback?.blockReason) return "I can't help with that one, but I'm happy to help with your training, nutrition, or recovery.";
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() || "Sorry — could you rephrase?";
}

const HELP = [
  "Here's what I can do:",
  "",
  "🍽️ Food",
  "📸 Send a meal photo — I'll log the calories",
  "/food 2 eggs and toast — log food by text",
  "/today — today's food, check-in & readiness",
  "/undo — remove your last food log",
  "",
  "🛌 Daily check-in",
  "/checkin — guided sleep/energy/soreness/weight",
  "/sleep 7.5 — log last night's sleep",
  "/energy 4 · /soreness 3 · /mood 4 (1–5)",
  "/weight 80.5 — log bodyweight",
  "",
  "📈 Plan & progress",
  "/plan — your plan & targets",
  "/weekly — your 7-day review",
  "/restart — rebuild your plan",
  "",
  "Or ask me anything (\"should I train today?\") and I'll coach you.",
].join("\n");
const WELCOME = "👋 Welcome to Fitpal! I'm your personal fitness coach.\n\nI'll ask a few quick questions to build your plan — about a minute. Ready?";

// ── Identity / onboarding state ──
type Identity = { user_id: string; onboarding_step: number; onboarding_answers: Answers; checkin_step: number; checkin_answers: Answers };
async function getIdentity(env: Env, fromId: string): Promise<Identity | null> {
  const rows = await sbGet(env, `telegram_identities?telegram_user_id=eq.${fromId}&select=user_id,onboarding_step,onboarding_answers,checkin_step,checkin_answers&limit=1`);
  return (rows[0] as Identity) ?? null;
}
async function setCheckinState(env: Env, fromId: string, step: number, answers: Answers): Promise<void> {
  await sbPatch(env, "telegram_identities", `telegram_user_id=eq.${fromId}`, { checkin_step: step, checkin_answers: answers });
}

// Upsert today's check-in (merge — only the provided fields change).
async function upsertCheckin(env: Env, userId: string, fields: Record<string, unknown>): Promise<boolean> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/daily_checkins?on_conflict=user_id,checkin_date`, {
    method: "POST",
    headers: { ...sbHeaders(env), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, checkin_date: new Date().toISOString().slice(0, 10), ...fields }),
  });
  return r.ok;
}

// Today's readiness one-liner from the stored check-in.
async function readinessLine(env: Env, userId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await sbGet(env, `daily_checkins?user_id=eq.${userId}&checkin_date=eq.${today}&select=sleep_hours,energy,soreness,mood`);
  const c = rows[0] as { sleep_hours?: number; energy?: number; soreness?: number; mood?: number } | undefined;
  if (!c) return "";
  const v = computeReadiness({ sleepHours: c.sleep_hours ?? null, energy: c.energy ?? null, soreness: c.soreness ?? null, mood: c.mood ?? null });
  if (v.band === "unknown") return "";
  return `\n\n🧭 ${v.reason}\n${v.directive}`;
}

// ── /checkin guided flow ──
const CHECKIN_STEPS: { key: string; prompt: string; parse: (t: string) => { ok: true; value: unknown } | { ok: false; error: string } }[] = [
  { key: "sleep_hours", prompt: "🌙 How many hours did you sleep last night? (e.g. 7.5)", parse: (t) => { const n = parseFloat(t.replace(/[^\d.]/g, "")); return Number.isFinite(n) && n >= 0 && n <= 24 ? { ok: true, value: n } : { ok: false, error: "Reply with hours, e.g. 7.5" }; } },
  { key: "energy", prompt: "⚡ Energy today? 1 (drained) – 5 (great)", parse: (t) => { const n = parseInt(t, 10); return n >= 1 && n <= 5 ? { ok: true, value: n } : { ok: false, error: "Reply 1–5." }; } },
  { key: "soreness", prompt: "💪 Soreness? 1 (none) – 5 (very sore)", parse: (t) => { const n = parseInt(t, 10); return n >= 1 && n <= 5 ? { ok: true, value: n } : { ok: false, error: "Reply 1–5." }; } },
  { key: "mood", prompt: "🙂 Mood? 1 (low) – 5 (great)", parse: (t) => { const n = parseInt(t, 10); return n >= 1 && n <= 5 ? { ok: true, value: n } : { ok: false, error: "Reply 1–5." }; } },
  { key: "bodyweight_kg", prompt: "⚖️ Bodyweight in kg? (or reply 'skip')", parse: (t) => { if (/^skip$/i.test(t.trim())) return { ok: true, value: null }; const n = parseFloat(t.replace(/[^\d.]/g, "")); return Number.isFinite(n) && n >= 25 && n <= 400 ? { ok: true, value: n } : { ok: false, error: "Reply with kg, e.g. 80.5, or 'skip'." }; } },
];
async function isOnboarded(env: Env, userId: string): Promise<boolean> {
  const rows = await sbGet(env, `profiles?user_id=eq.${userId}&select=onboarding_complete&limit=1`);
  return rows[0]?.onboarding_complete === true;
}
async function setStep(env: Env, fromId: string, step: number, answers: Answers): Promise<void> {
  await sbPatch(env, "telegram_identities", `telegram_user_id=eq.${fromId}`, { onboarding_step: step, onboarding_answers: answers });
}

async function createAccount(env: Env, fromId: string, chatId: number): Promise<string | null> {
  let id = await adminCreateUser(env, `tg${fromId}@fitpal.bot`, fromId);
  if (!id) id = await adminCreateUser(env, `tg${fromId}.${crypto.randomUUID().slice(0, 6)}@fitpal.bot`, fromId);
  if (!id) return null;
  await sbInsert(env, "telegram_identities", {
    user_id: id, telegram_user_id: fromId, telegram_chat_id: String(chatId),
    linked_at: new Date().toISOString(), is_active: true, onboarding_step: 1, onboarding_answers: {},
  });
  return id;
}

function planSummary(plan: FitnessPlan): string {
  const t = plan.targets;
  const days = plan.training.days.map((d) => `• ${d.day}: ${d.focus}`).join("\n");
  return `🎉 Your plan is ready, ${""}here's the gist:\n\n📋 ${plan.summary}\n\nDaily targets: ${t.calories} kcal · ${t.proteinG}g protein · ${t.carbsG}g carbs · ${t.fatG}g fat\n\n🏋️ ${plan.training.splitName} (${plan.training.daysPerWeek}×/week, ${plan.training.restDays} rest):\n${days}\n\n${plan.notes[0] ?? ""}`;
}

async function finalizeOnboarding(env: Env, userId: string, answers: Answers): Promise<FitnessPlan> {
  const input = buildPlanInput(answers);
  const plan = generatePlan(input);
  const birthYear = new Date().getUTCFullYear() - Number(answers.age);

  await sbPatch(env, "profiles", `user_id=eq.${userId}`, {
    nickname: answers.nickname, sex: answers.sex, birth_year: birthYear, height_cm: answers.heightCm, onboarding_complete: true,
  });
  await sbInsert(env, "onboarding_responses", { user_id: userId, payload: answers });
  await sbInsert(env, "fitness_goals", { user_id: userId, primary_goal: answers.goal, start_weight_kg: answers.weightKg, is_active: true });
  await sbInsert(env, "training_preferences", {
    user_id: userId, experience: answers.experience, days_per_week: answers.daysPerWeek,
    equipment: answers.equipment, session_minutes: 45, cardio_pref: "light", diet_pref: "none",
    activity_level: "moderate", injuries: (answers.injuries as string) || null,
  });
  await sbRpc(env, "activate_fitness_plan_for", { p_user_id: userId, p_plan: plan, p_source: "deterministic" });
  return plan;
}

// ── Food logging ──
async function tgFilePath(env: Env, fileId: string): Promise<string | null> {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  if (!r.ok) return null;
  const j = (await r.json()) as { result?: { file_path?: string } };
  return j.result?.file_path ?? null;
}
async function tgDownload(env: Env, filePath: string): Promise<ArrayBuffer | null> {
  const r = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!r.ok) return null;
  return await r.arrayBuffer();
}
async function logFood(env: Env, userId: string, m: FoodEstimate, source: "telegram" | "photo"): Promise<boolean> {
  return sbInsert(env, "nutrition_logs", {
    user_id: userId, log_date: new Date().toISOString().slice(0, 10),
    description: m.description, calories: m.calories, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g,
    source, confidence: m.confidence,
  });
}
async function foodSummaryLine(env: Env, userId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await sbGet(env, `nutrition_logs?user_id=eq.${userId}&log_date=eq.${today}&select=calories,protein_g`);
  const cal = rows.reduce((a, r) => a + Number(r.calories ?? 0), 0);
  const prot = rows.reduce((a, r) => a + Number(r.protein_g ?? 0), 0);
  const planRows = await sbGet(env, `fitness_plans?user_id=eq.${userId}&is_active=eq.true&select=plan`);
  const t = (planRows[0]?.plan as FitnessPlan | undefined)?.targets;
  return t
    ? `\n\nToday: ${Math.round(cal)}/${t.calories} kcal · ${Math.round(prot)}/${t.proteinG}g protein (${rows.length} item${rows.length === 1 ? "" : "s"}).`
    : `\n\nToday: ${Math.round(cal)} kcal · ${Math.round(prot)}g protein.`;
}
function foodReply(m: FoodEstimate, summary: string): string {
  if (m.calories === 0 && /not food/i.test(m.description)) return "That doesn't look like food 🤔 Send a photo of a meal, or try /food <what you ate>.";
  return `🍽️ Logged: ${m.description} — ~${m.calories} kcal, ${m.protein_g}g protein, ${m.carbs_g}g carbs, ${m.fat_g}g fat (${m.confidence} confidence).${summary}`;
}

async function handleUpdate(env: Env, update: Record<string, unknown>): Promise<void> {
  const msg = update.message as { text?: string; caption?: string; photo?: { file_id: string }[]; chat?: { id: number }; from?: { id: number } } | undefined;
  const text = msg?.text?.trim();
  const photos = msg?.photo;
  const caption = msg?.caption?.trim();
  const chatId = msg?.chat?.id;
  const fromId = msg?.from?.id != null ? String(msg.from.id) : undefined;
  if (chatId == null || !fromId) return;
  const today = new Date().toISOString().slice(0, 10);
  const model = env.GEMINI_TEXT_MODEL ?? "gemini-flash-latest";

  // ── Photo of a meal → food log (needs an onboarded account) ──
  if (photos && photos.length > 0) {
    const identity = await getIdentity(env, fromId);
    if (!identity) { await createAccount(env, fromId, chatId); await tgSend(env, chatId, WELCOME + "\n\n" + firstPrompt()); return; }
    if (!(await isOnboarded(env, identity.user_id))) { await tgSend(env, chatId, "Let's finish your quick setup first — then send food photos anytime. " + promptForStep(identity.onboarding_step || 1)); return; }
    await tgSend(env, chatId, "📸 Analysing your meal…");
    const fileId = photos[photos.length - 1].file_id; // largest size
    const path = await tgFilePath(env, fileId);
    const buf = path ? await tgDownload(env, path) : null;
    if (!buf) { await tgSend(env, chatId, "I couldn't download that image — try again, or use /food <what you ate>."); return; }
    const est = await estimateFood(env.GEMINI_API_KEY, model, { imageBase64: toBase64(buf), text: caption });
    if (!est) { await tgSend(env, chatId, "I couldn't read that meal — try a clearer photo, or /food <what you ate>."); return; }
    await logFood(env, identity.user_id, est, "photo");
    await tgSend(env, chatId, foodReply(est, await foodSummaryLine(env, identity.user_id)));
    return;
  }

  if (!text) return;

  // GLOBAL safety net — catches ED / self-harm / acute-medical signals at ANY point
  // (onboarding, commands, or coaching). Never reaches the LLM; logs for existing users.
  if (!text.startsWith("/")) {
    const sig = detectSafetySignal(text);
    if (sig) {
      await tgSend(env, chatId, sig.response);
      const id = await getIdentity(env, fromId);
      if (id) {
        await sbInsert(env, "agent_messages", { user_id: id.user_id, role: "assistant", channel: "telegram", content: sig.response });
        await sbRpc(env, "increment_usage_for", { p_user_id: id.user_id, p_window_key: `safety:${today}`, p_limit: 1000 });
      }
      return;
    }
  }

  // Web-account linking (for users who signed up on the optional dashboard) still works.
  if (text.startsWith("/link")) {
    const code = text.split(/\s+/)[1];
    if (!code) { await tgSend(env, chatId, "Send it like: /link ABCD1234 (get a code in the app → Settings → Telegram)."); return; }
    const res = await sbRpc<{ ok: boolean }>(env, "link_telegram_account", { p_code: code, p_telegram_user_id: fromId, p_chat_id: String(chatId) });
    if (res?.ok) await tgSend(env, chatId, "✅ Linked to your existing account!\n\n" + HELP);
    else await tgSend(env, chatId, "That code is invalid or expired. Or just chat with me normally — you don't need an account to start.");
    return;
  }

  let identity = await getIdentity(env, fromId);

  // Brand new → auto-create account + begin onboarding.
  if (!identity) {
    const userId = await createAccount(env, fromId, chatId);
    if (!userId) { await tgSend(env, chatId, "Hmm, I hit a snag creating your profile. Please send /start to try again."); return; }
    await tgSend(env, chatId, WELCOME + "\n\n" + firstPrompt());
    return;
  }

  const userId = identity.user_id;
  const onboarded = await isOnboarded(env, userId);

  // Mid-onboarding: interpret the message as the answer to the current step.
  if (!onboarded) {
    const step = identity.onboarding_step || 1;
    if (text === "/start") { await tgSend(env, chatId, "Let's pick up where we left off.\n\n" + promptForStep(step)); return; }

    const parsed = parseStep(step, text);
    if (!parsed.ok) { await tgSend(env, chatId, parsed.error); return; }
    const answers: Answers = { ...(identity.onboarding_answers || {}), [parsed.key]: parsed.value };

    if (step >= STEP_COUNT) {
      await tgSend(env, chatId, "Perfect — building your plan now… 🛠️");
      const plan = await finalizeOnboarding(env, userId, answers);
      await setStep(env, fromId, 0, {});
      const total = await onboardedCount(env);
      await notifyAdmin(env, `🆕 New Fitpal signup\nName: ${answers.nickname}\nGoal: ${plan.goal}\nPlan: ${plan.targets.calories} kcal · ${plan.targets.proteinG}g protein · ${plan.training.daysPerWeek}×/wk${total != null ? `\nTotal users: ${total}` : ""}`);
      await tgSend(env, chatId, planSummary(plan));
      if (plan.safetyFlags.length) await tgSend(env, chatId, "⚠️ Fitpal gives general fitness guidance, not medical advice. For injuries, illness, or eating concerns, please talk to a qualified professional.");
      await tgSend(env, chatId, "You're all set! 💪\n\n" + HELP);
      return;
    }
    await setStep(env, fromId, step + 1, answers);
    await tgSend(env, chatId, promptForStep(step + 1));
    return;
  }

  // ── Mid /checkin flow → interpret as the answer to the current question ──
  if (identity.checkin_step && identity.checkin_step > 0) {
    if (text === "/cancel") { await setCheckinState(env, fromId, 0, {}); await tgSend(env, chatId, "Check-in cancelled."); return; }
    const cstep = identity.checkin_step;
    const def = CHECKIN_STEPS[cstep - 1];
    const r = def.parse(text);
    if (!r.ok) { await tgSend(env, chatId, r.error); return; }
    const answers: Answers = { ...(identity.checkin_answers || {}), [def.key]: r.value };
    if (cstep >= CHECKIN_STEPS.length) {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(answers)) if (v !== null && v !== undefined) fields[k] = v;
      await upsertCheckin(env, userId, fields);
      await setCheckinState(env, fromId, 0, {});
      await tgSend(env, chatId, "✅ Check-in saved!" + (await readinessLine(env, userId)));
      return;
    }
    await setCheckinState(env, fromId, cstep + 1, answers);
    await tgSend(env, chatId, CHECKIN_STEPS[cstep].prompt);
    return;
  }

  // ── Onboarded users: commands + coaching ──
  if (text === "/start") { await tgSend(env, chatId, "You're all set! 💪\n\n" + HELP); return; }
  if (text.startsWith("/help")) { await tgSend(env, chatId, HELP); return; }
  if (text.startsWith("/restart")) {
    await sbPatch(env, "profiles", `user_id=eq.${userId}`, { onboarding_complete: false });
    await setStep(env, fromId, 1, {});
    await tgSend(env, chatId, "Okay, let's rebuild your plan from scratch.\n\n" + firstPrompt());
    return;
  }
  if (text.startsWith("/checkin")) {
    await setCheckinState(env, fromId, 1, {});
    await tgSend(env, chatId, "Let's do your daily check-in 🛌 (send /cancel to stop)\n\n" + CHECKIN_STEPS[0].prompt);
    return;
  }
  if (text.startsWith("/sleep")) {
    const n = parseFloat((text.split(/\s+/)[1] ?? "").replace(/[^\d.]/g, ""));
    if (!isFinite(n) || n < 0 || n > 24) { await tgSend(env, chatId, "Send it like: /sleep 7.5"); return; }
    await upsertCheckin(env, userId, { sleep_hours: n });
    await tgSend(env, chatId, `✅ Logged ${n}h sleep.` + (await readinessLine(env, userId)));
    return;
  }
  for (const [cmd, key, label] of [["/energy", "energy", "energy"], ["/soreness", "soreness", "soreness"], ["/mood", "mood", "mood"]] as const) {
    if (text.startsWith(cmd)) {
      const n = parseInt(text.split(/\s+/)[1] ?? "", 10);
      if (!(n >= 1 && n <= 5)) { await tgSend(env, chatId, `Send it like: ${cmd} 4  (1–5)`); return; }
      await upsertCheckin(env, userId, { [key]: n });
      await tgSend(env, chatId, `✅ Logged ${label} ${n}/5.` + (await readinessLine(env, userId)));
      return;
    }
  }
  if (text.startsWith("/plan")) {
    const rows = await sbGet(env, `fitness_plans?user_id=eq.${userId}&is_active=eq.true&select=plan`);
    const p = (rows[0]?.plan as FitnessPlan | undefined);
    if (!p) { await tgSend(env, chatId, "No active plan yet. Send /restart to build one."); return; }
    await tgSend(env, chatId, planSummary(p));
    return;
  }
  if (text.startsWith("/weight")) {
    const arg = text.split(/\s+/)[1];
    if (!arg) { // no number → weight trend
      const rows = await sbGet(env, `daily_checkins?user_id=eq.${userId}&bodyweight_kg=not.is.null&select=checkin_date,bodyweight_kg&order=checkin_date.desc&limit=10`);
      if (!rows.length) { await tgSend(env, chatId, "No weight logged yet. Send /weight 80.5"); return; }
      const series = (rows as { checkin_date: string; bodyweight_kg: number }[]).reverse();
      const first = series[0], last = series[series.length - 1];
      const delta = Number((last.bodyweight_kg - first.bodyweight_kg).toFixed(1));
      const lines = series.slice(-7).map((s) => `${s.checkin_date.slice(5)}: ${s.bodyweight_kg} kg`).join("\n");
      await tgSend(env, chatId, `⚖️ Weight trend (${series.length} weigh-ins):\n${lines}\n\nChange: ${delta > 0 ? "+" : ""}${delta} kg`);
      return;
    }
    const w = parseFloat(arg);
    if (!isFinite(w) || w < 25 || w > 400) { await tgSend(env, chatId, "Send it like: /weight 80.5"); return; }
    await upsertCheckin(env, userId, { bodyweight_kg: w });
    await tgSend(env, chatId, `✅ Logged ${w} kg.`);
    return;
  }
  if (text.startsWith("/food") || text.startsWith("/log")) {
    const desc = text.replace(/^\/(food|log)\b/i, "").trim();
    if (!desc) { await tgSend(env, chatId, "Tell me what you ate, e.g. /food 2 eggs and toast — or just send a photo of your meal 📸"); return; }
    const est = await estimateFood(env.GEMINI_API_KEY, model, { text: desc });
    if (!est) { await tgSend(env, chatId, "I couldn't estimate that — try rephrasing, e.g. /food grilled chicken breast and rice."); return; }
    await logFood(env, userId, est, "telegram");
    await tgSend(env, chatId, foodReply(est, await foodSummaryLine(env, userId)));
    return;
  }
  if (text.startsWith("/undo")) {
    const rows = await sbGet(env, `nutrition_logs?user_id=eq.${userId}&select=id,description&order=created_at.desc&limit=1`);
    if (!rows.length) { await tgSend(env, chatId, "Nothing to undo."); return; }
    await sbDelete(env, "nutrition_logs", `id=eq.${rows[0].id}`);
    await tgSend(env, chatId, `↩️ Removed: ${rows[0].description ?? "last food log"}.${await foodSummaryLine(env, userId)}`);
    return;
  }
  if (text.startsWith("/today")) {
    const ciRows = await sbGet(env, `daily_checkins?user_id=eq.${userId}&checkin_date=eq.${today}&select=sleep_hours,energy,bodyweight_kg`);
    const ci = ciRows[0] as { sleep_hours?: number; energy?: number; bodyweight_kg?: number } | undefined;
    let body = "📊 Today" + (await foodSummaryLine(env, userId));
    if (ci) {
      const bits = [ci.sleep_hours ? `${ci.sleep_hours}h sleep` : "", ci.energy ? `energy ${ci.energy}/5` : "", ci.bodyweight_kg ? `${ci.bodyweight_kg}kg` : ""].filter(Boolean);
      if (bits.length) body += `\n\nCheck-in: ${bits.join(" · ")}`;
    } else {
      body += "\n\nNo check-in yet — /checkin or /sleep 7.5";
    }
    body += await readinessLine(env, userId);
    await tgSend(env, chatId, body);
    return;
  }
  if (text.startsWith("/weekly") || text.startsWith("/week")) {
    const wAgo = daysAgo(7);
    const [wk, sl, nut, wt] = await Promise.all([
      sbGet(env, `workout_logs?user_id=eq.${userId}&workout_date=gte.${wAgo}&select=id`),
      sbGet(env, `daily_checkins?user_id=eq.${userId}&checkin_date=gte.${wAgo}&sleep_hours=not.is.null&select=sleep_hours`),
      sbGet(env, `nutrition_logs?user_id=eq.${userId}&log_date=gte.${wAgo}&select=calories,log_date`),
      sbGet(env, `daily_checkins?user_id=eq.${userId}&bodyweight_kg=not.is.null&checkin_date=gte.${daysAgo(14)}&select=bodyweight_kg,checkin_date&order=checkin_date.asc`),
    ]);
    const sleeps = (sl as { sleep_hours: number }[]).map((s) => s.sleep_hours);
    const avgSleep = sleeps.length ? (sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1) : null;
    const byDay = new Map<string, number>();
    for (const n of nut as { calories: number; log_date: string }[]) byDay.set(n.log_date, (byDay.get(n.log_date) ?? 0) + Number(n.calories ?? 0));
    const avgCals = byDay.size ? Math.round([...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size) : null;
    const wseries = wt as { bodyweight_kg: number }[];
    const wDelta = wseries.length >= 2 ? Number((wseries[wseries.length - 1].bodyweight_kg - wseries[0].bodyweight_kg).toFixed(1)) : null;
    const lines = [
      "📊 Your 7-day review:",
      `• Workouts logged: ${wk.length}`,
      avgSleep ? `• Avg sleep: ${avgSleep}h` : "• Sleep: log it with /sleep",
      avgCals ? `• Avg calories: ${avgCals}/day` : "• Food: log meals to track calories",
      wDelta != null ? `• Bodyweight change (2 wks): ${wDelta > 0 ? "+" : ""}${wDelta} kg` : "• Weigh in a couple times to see the trend",
      "",
      wk.length >= 3 ? "Strong week 💪 keep the streak going." : "Aim for a couple more sessions next week — consistency wins.",
    ];
    await tgSend(env, chatId, lines.join("\n"));
    return;
  }

  // "Should I train today?" → deterministic readiness (mirrors HartOS: verdict is computed, not guessed).
  if (/\b(should i (train|rest|work\s?out)|train today|am i recovered|ready to train|rest today)\b/i.test(text)) {
    const line = await readinessLine(env, userId);
    if (line) { await tgSend(env, chatId, line.replace(/^\n\n/, "")); return; }
    await tgSend(env, chatId, "I don't have today's check-in yet — run /checkin (or /sleep 7.5) and I'll call your readiness.");
    return;
  }

  // Free-text → grounded coach (rate-limited + safety-gated).
  const allowed = await sbRpc<boolean>(env, "increment_usage_for", { p_user_id: userId, p_window_key: `chat:${today}`, p_limit: CHAT_DAILY_LIMIT });
  if (allowed === false) { await tgSend(env, chatId, "You've hit today's coaching limit — it resets tomorrow."); return; }
  await sbInsert(env, "agent_messages", { user_id: userId, role: "user", channel: "telegram", content: text });

  // (Safety signals are already handled by the global net above.)
  const grounding = await buildGrounding(env, userId);
  const histRows = await sbGet(env, `agent_messages?user_id=eq.${userId}&channel=eq.telegram&select=role,content&order=created_at.desc&limit=7`);
  const history = (histRows as { role: string; content: string }[]).reverse().slice(0, -1);
  const reply = await gemini(env, `${SAFETY_SYSTEM_PROMPT}\n\n${grounding}`, history, text);
  await sbInsert(env, "agent_messages", { user_id: userId, role: "assistant", channel: "telegram", content: reply });
  await tgSend(env, chatId, reply);
}

async function buildGrounding(env: Env, userId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const [profile, plan, goal, checkins, todayFood] = await Promise.all([
    sbGet(env, `profiles?user_id=eq.${userId}&select=nickname,birth_year`),
    sbGet(env, `fitness_plans?user_id=eq.${userId}&is_active=eq.true&select=plan`),
    sbGet(env, `fitness_goals?user_id=eq.${userId}&is_active=eq.true&select=primary_goal,target_weight_kg`),
    sbGet(env, `daily_checkins?user_id=eq.${userId}&select=checkin_date,bodyweight_kg,energy,sleep_hours,soreness&order=checkin_date.desc&limit=3`),
    sbGet(env, `nutrition_logs?user_id=eq.${userId}&log_date=eq.${today}&select=calories,protein_g`),
  ]);
  const p = plan[0]?.plan as FitnessPlan | undefined;
  const prof = profile[0] as { nickname?: string } | undefined;
  const g = goal[0] as { primary_goal?: string; target_weight_kg?: number } | undefined;
  const cks = checkins as { checkin_date: string; bodyweight_kg?: number; energy?: number; sleep_hours?: number; soreness?: number }[];
  const lines = [`USER: ${prof?.nickname ?? "user"}.`];
  if (g) lines.push(`GOAL: ${g.primary_goal}${g.target_weight_kg ? ` → ${g.target_weight_kg} kg` : ""}.`);
  if (p?.targets) lines.push(`PLAN: ${p.targets.calories} kcal, ${p.targets.proteinG} g protein; ${p.training?.splitName} ${p.training?.daysPerWeek}×/wk.`);
  const cal = (todayFood as { calories: number }[]).reduce((a, r) => a + Number(r.calories ?? 0), 0);
  const prot = (todayFood as { protein_g: number }[]).reduce((a, r) => a + Number(r.protein_g ?? 0), 0);
  lines.push(`TODAY EATEN: ${Math.round(cal)} kcal, ${Math.round(prot)} g protein.`);
  const todayCk = cks.find((c) => c.checkin_date === today);
  if (todayCk) {
    const v = computeReadiness({ sleepHours: todayCk.sleep_hours ?? null, energy: todayCk.energy ?? null, soreness: todayCk.soreness ?? null });
    if (v.band !== "unknown") lines.push(`TODAY READINESS: ${v.band} (${v.score}/100) — ${v.directive}`);
  }
  if (cks.length) lines.push("RECENT: " + cks.map((c) => `${c.checkin_date}${c.bodyweight_kg ? ` ${c.bodyweight_kg}kg` : ""}${c.sleep_hours ? ` ${c.sleep_hours}h` : ""}`).join("; "));
  return "CONTEXT (this user only):\n" + lines.join("\n");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "fitpal-telegram" }), { headers: { "Content-Type": "application/json" } });
    }
    if (request.method === "POST" && url.pathname === "/telegram/webhook") {
      if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      let update: Record<string, unknown>;
      try { update = await request.json(); } catch { return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }); }
      try { await handleUpdate(env, update); } catch { /* never 500 back to Telegram */ }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { "Content-Type": "application/json" } });
  },
};
