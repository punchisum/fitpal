// Fitpal Telegram bot — Cloudflare Worker. TELEGRAM-FIRST.
// /start auto-creates an account and runs onboarding in chat; then log + coach in chat.
// Self-contained: Supabase via service-role REST (user-scoped) + Gemini via REST. No Trigger dependency.
import { SAFETY_SYSTEM_PROMPT, detectSafetySignal } from "../../lib/llm/safety";
import { generatePlan } from "../../lib/plan";
import type { FitnessPlan } from "../../lib/plan/types";
import { STEP_COUNT, firstPrompt, promptForStep, parseStep, buildPlanInput, type Answers } from "./onboarding";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_TEXT_MODEL?: string;
};

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

const HELP = "Here's what I can do:\n/plan — your plan & targets\n/weight 80.5 — log today's bodyweight\n/restart — rebuild your plan from scratch\n/help — this list\n\nOr just message me anything about training, food, or recovery and I'll coach you.";
const WELCOME = "👋 Welcome to Fitpal! I'm your personal fitness coach.\n\nI'll ask a few quick questions to build your plan — about a minute. Ready?";

// ── Identity / onboarding state ──
type Identity = { user_id: string; onboarding_step: number; onboarding_answers: Answers };
async function getIdentity(env: Env, fromId: string): Promise<Identity | null> {
  const rows = await sbGet(env, `telegram_identities?telegram_user_id=eq.${fromId}&select=user_id,onboarding_step,onboarding_answers&limit=1`);
  return (rows[0] as Identity) ?? null;
}
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

async function handleUpdate(env: Env, update: Record<string, unknown>): Promise<void> {
  const msg = update.message as { text?: string; chat?: { id: number }; from?: { id: number } } | undefined;
  const text = msg?.text?.trim();
  const chatId = msg?.chat?.id;
  const fromId = msg?.from?.id != null ? String(msg.from.id) : undefined;
  if (!text || chatId == null || !fromId) return;
  const today = new Date().toISOString().slice(0, 10);

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
      await tgSend(env, chatId, planSummary(plan));
      if (plan.safetyFlags.length) await tgSend(env, chatId, "⚠️ Fitpal gives general fitness guidance, not medical advice. For injuries, illness, or eating concerns, please talk to a qualified professional.");
      await tgSend(env, chatId, "You're all set! 💪\n\n" + HELP);
      return;
    }
    await setStep(env, fromId, step + 1, answers);
    await tgSend(env, chatId, promptForStep(step + 1));
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
  if (text.startsWith("/plan")) {
    const rows = await sbGet(env, `fitness_plans?user_id=eq.${userId}&is_active=eq.true&select=plan`);
    const p = (rows[0]?.plan as FitnessPlan | undefined);
    if (!p) { await tgSend(env, chatId, "No active plan yet. Send /restart to build one."); return; }
    await tgSend(env, chatId, planSummary(p));
    return;
  }
  if (text.startsWith("/weight")) {
    const w = parseFloat(text.split(/\s+/)[1] ?? "");
    if (!isFinite(w) || w < 25 || w > 400) { await tgSend(env, chatId, "Send it like: /weight 80.5"); return; }
    const ok = await sbInsert(env, "daily_checkins", { user_id: userId, checkin_date: today, bodyweight_kg: w }, true);
    await tgSend(env, chatId, ok ? `✅ Logged ${w} kg for today.` : "Couldn't save that — try again.");
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
  const [profile, plan, goal, checkins] = await Promise.all([
    sbGet(env, `profiles?user_id=eq.${userId}&select=nickname,birth_year`),
    sbGet(env, `fitness_plans?user_id=eq.${userId}&is_active=eq.true&select=plan`),
    sbGet(env, `fitness_goals?user_id=eq.${userId}&is_active=eq.true&select=primary_goal,target_weight_kg`),
    sbGet(env, `daily_checkins?user_id=eq.${userId}&select=checkin_date,bodyweight_kg,energy&order=checkin_date.desc&limit=3`),
  ]);
  const p = plan[0]?.plan as FitnessPlan | undefined;
  const prof = profile[0] as { nickname?: string } | undefined;
  const g = goal[0] as { primary_goal?: string; target_weight_kg?: number } | undefined;
  const lines = [`USER: ${prof?.nickname ?? "user"}.`];
  if (g) lines.push(`GOAL: ${g.primary_goal}${g.target_weight_kg ? ` → ${g.target_weight_kg} kg` : ""}.`);
  if (p?.targets) lines.push(`PLAN: ${p.targets.calories} kcal, ${p.targets.proteinG} g protein; ${p.training?.splitName} ${p.training?.daysPerWeek}×/wk.`);
  if (checkins.length) lines.push("RECENT: " + (checkins as { checkin_date: string; bodyweight_kg?: number }[]).map((c) => `${c.checkin_date}${c.bodyweight_kg ? ` ${c.bodyweight_kg}kg` : ""}`).join("; "));
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
