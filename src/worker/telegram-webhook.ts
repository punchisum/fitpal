// Fitpal Telegram bot — Cloudflare Worker.
// Thin, synchronous handler: verify the secret header, process the update, reply.
// Talks to Supabase via service-role REST (always user-scoped) and Gemini via REST.
// No Trigger.dev dependency: the bot's request/response path is self-contained.
import { SAFETY_SYSTEM_PROMPT, detectSafetySignal } from "../../lib/llm/safety";

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
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}
async function sbGet(env: Env, path: string): Promise<unknown[]> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env) });
  if (!r.ok) return [];
  return (await r.json()) as unknown[];
}
async function sbInsert(env: Env, table: string, row: Record<string, unknown>, upsert = false): Promise<boolean> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...sbHeaders(env), Prefer: upsert ? "resolution=merge-duplicates" : "return=minimal" },
    body: JSON.stringify(row),
  });
  return r.ok;
}
async function sbRpc<T>(env: Env, fn: string, body: Record<string, unknown>): Promise<T | null> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: sbHeaders(env), body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const text = await r.text();
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

// ── Telegram ──
async function tgSend(env: Env, chatId: number | string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

const HELP = "Commands:\n/plan — your current plan & targets\n/weight 80.5 — log today's bodyweight\n/help — this list\n\nOr just message me anything about your training, food, or recovery and I'll coach you.";

async function buildGrounding(env: Env, userId: string): Promise<string> {
  const enc = encodeURIComponent;
  const [profile, plan, goal, checkins] = await Promise.all([
    sbGet(env, `profiles?user_id=eq.${userId}&select=nickname,birth_year,height_cm`),
    sbGet(env, `fitness_plans?user_id=eq.${userId}&is_active=eq.true&select=plan`),
    sbGet(env, `fitness_goals?user_id=eq.${userId}&is_active=eq.true&select=primary_goal,target_weight_kg`),
    sbGet(env, `daily_checkins?user_id=eq.${enc(userId)}&select=checkin_date,bodyweight_kg,energy&order=checkin_date.desc&limit=3`),
  ]);
  const p = (plan[0] as { plan?: { targets?: { calories: number; proteinG: number }; training?: { splitName: string; daysPerWeek: number } } } | undefined)?.plan;
  const prof = profile[0] as { nickname?: string } | undefined;
  const g = goal[0] as { primary_goal?: string; target_weight_kg?: number } | undefined;
  const lines = [`USER: ${prof?.nickname ?? "user"}.`];
  if (g) lines.push(`GOAL: ${g.primary_goal}${g.target_weight_kg ? ` → ${g.target_weight_kg} kg` : ""}.`);
  if (p?.targets) lines.push(`PLAN: ${p.targets.calories} kcal, ${p.targets.proteinG} g protein; ${p.training?.splitName} ${p.training?.daysPerWeek}×/wk.`);
  if (checkins.length) lines.push("RECENT: " + (checkins as { checkin_date: string; bodyweight_kg?: number }[]).map((c) => `${c.checkin_date}${c.bodyweight_kg ? ` ${c.bodyweight_kg}kg` : ""}`).join("; "));
  return "CONTEXT (this user only):\n" + lines.join("\n");
}

async function handleUpdate(env: Env, update: Record<string, unknown>): Promise<void> {
  const msg = update.message as { text?: string; chat?: { id: number }; from?: { id: number } } | undefined;
  const text = msg?.text?.trim();
  const chatId = msg?.chat?.id;
  const fromId = msg?.from?.id != null ? String(msg.from.id) : undefined;
  if (!text || chatId == null || !fromId) return;

  const today = new Date().toISOString().slice(0, 10);

  if (text.startsWith("/start")) {
    await tgSend(env, chatId, "👋 I'm Fitpal, your fitness coach.\n\nTo connect your account: open the Fitpal app → Settings → Telegram → Generate link code, then send it here as:\n/link YOURCODE\n\nUntil you link, I can't see any of your data.");
    return;
  }

  if (text.startsWith("/link")) {
    const code = text.split(/\s+/)[1];
    if (!code) { await tgSend(env, chatId, "Send it like: /link ABCD1234"); return; }
    const res = await sbRpc<{ ok: boolean; reason?: string }>(env, "link_telegram_account", { p_code: code, p_telegram_user_id: fromId, p_chat_id: String(chatId) });
    if (res?.ok) await tgSend(env, chatId, "✅ Linked! You're all set.\n\n" + HELP);
    else await tgSend(env, chatId, "That code is invalid or expired. Generate a fresh one in the app (Settings → Telegram).");
    return;
  }

  // Everything else requires a linked account.
  const userId = await sbRpc<string | null>(env, "resolve_telegram_user", { p_telegram_user_id: fromId });
  if (!userId || typeof userId !== "string") {
    await tgSend(env, chatId, "Please link your account first: app → Settings → Telegram, then send /link YOURCODE here.");
    return;
  }

  if (text.startsWith("/help")) { await tgSend(env, chatId, HELP); return; }

  if (text.startsWith("/plan")) {
    const plan = await sbGet(env, `fitness_plans?user_id=eq.${userId}&is_active=eq.true&select=plan`);
    const p = (plan[0] as { plan?: { summary: string; targets: { calories: number; proteinG: number }; training: { splitName: string; daysPerWeek: number; restDays: number } } } | undefined)?.plan;
    if (!p) { await tgSend(env, chatId, "No active plan yet — finish onboarding in the app first."); return; }
    await tgSend(env, chatId, `📋 ${p.summary}\n\nTargets: ${p.targets.calories} kcal · ${p.targets.proteinG} g protein\nTraining: ${p.training.splitName}, ${p.training.daysPerWeek}×/week, ${p.training.restDays} rest day(s).`);
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

  const signal = detectSafetySignal(text);
  if (signal) {
    await sbInsert(env, "agent_messages", { user_id: userId, role: "assistant", channel: "telegram", content: signal.response });
    await tgSend(env, chatId, signal.response);
    return;
  }

  const grounding = await buildGrounding(env, userId);
  const hist = (await sbGet(env, `agent_messages?user_id=eq.${userId}&channel=eq.telegram&select=role,content&order=created_at.desc&limit=7`)) as { role: string; content: string }[];
  const history = hist.reverse().slice(0, -1);
  const reply = await gemini(env, `${SAFETY_SYSTEM_PROMPT}\n\n${grounding}`, history, text);
  await sbInsert(env, "agent_messages", { user_id: userId, role: "assistant", channel: "telegram", content: reply });
  await tgSend(env, chatId, reply);
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
