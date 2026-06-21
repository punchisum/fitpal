import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCoachProvider, type ChatTurn } from "./provider";
import { SAFETY_SYSTEM_PROMPT, detectSafetySignal } from "./safety";
import type { FitnessPlan } from "@/lib/plan";
import { todayISO } from "@/lib/date";

const CHAT_DAILY_LIMIT = 40;
const HISTORY_TURNS = 8;

type DB = SupabaseClient;

/** Build a compact grounding block from ONLY the requesting user's RLS-scoped data. */
async function buildGrounding(supabase: DB, userId: string): Promise<string> {
  const [{ data: profile }, { data: plan }, { data: goal }, { data: checkins }, { data: workouts }, { data: nutrition }] = await Promise.all([
    supabase.from("profiles").select("nickname, sex, birth_year, height_cm, units").eq("user_id", userId).maybeSingle(),
    supabase.from("fitness_plans").select("plan").eq("is_active", true).maybeSingle(),
    supabase.from("fitness_goals").select("primary_goal, target_weight_kg, target_date, start_weight_kg").eq("is_active", true).maybeSingle(),
    supabase.from("daily_checkins").select("checkin_date, bodyweight_kg, sleep_hours, energy, soreness").order("checkin_date", { ascending: false }).limit(5),
    supabase.from("workout_logs").select("workout_date, type, duration_min, perceived_effort").order("workout_date", { ascending: false }).limit(5),
    supabase.from("nutrition_logs").select("calories, protein_g").eq("log_date", todayISO()),
  ]);

  const p = plan?.plan as FitnessPlan | undefined;
  const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null;
  const todayCals = (nutrition ?? []).reduce((a, r) => a + Number(r.calories ?? 0), 0);
  const todayProt = (nutrition ?? []).reduce((a, r) => a + Number(r.protein_g ?? 0), 0);

  const lines: string[] = [];
  lines.push(`USER: ${profile?.nickname ?? "user"}${age ? `, age ${age}` : ""}${profile?.sex && profile.sex !== "prefer_not" ? `, ${profile.sex}` : ""}${profile?.height_cm ? `, ${profile.height_cm} cm` : ""}.`);
  if (goal) lines.push(`GOAL: ${goal.primary_goal}${goal.target_weight_kg ? ` → ${goal.target_weight_kg} kg` : ""}${goal.target_date ? ` by ${goal.target_date}` : ""} (start ${goal.start_weight_kg ?? "?"} kg).`);
  if (p) {
    lines.push(`ACTIVE PLAN: ${p.targets.calories} kcal/day, ${p.targets.proteinG} g protein, ${p.targets.carbsG} g carbs, ${p.targets.fatG} g fat. Training: ${p.training.splitName}, ${p.training.daysPerWeek}×/week, ${p.training.restDays} rest day(s).`);
    if (p.safetyFlags.length) lines.push(`PLAN SAFETY FLAGS: ${p.safetyFlags.join(", ")}.`);
  } else {
    lines.push("ACTIVE PLAN: none yet.");
  }
  lines.push(`TODAY SO FAR: ${Math.round(todayCals)} kcal, ${Math.round(todayProt)} g protein logged.`);
  if (checkins?.length) lines.push("RECENT CHECK-INS: " + checkins.map((c) => `${c.checkin_date}${c.bodyweight_kg ? ` ${c.bodyweight_kg}kg` : ""}${c.energy ? ` energy${c.energy}/5` : ""}`).join("; ") + ".");
  if (workouts?.length) lines.push("RECENT WORKOUTS: " + workouts.map((w) => `${w.workout_date} ${w.type ?? "session"}${w.perceived_effort ? ` RPE${w.perceived_effort}` : ""}`).join("; ") + ".");

  return "CONTEXT (this user only):\n" + lines.join("\n");
}

export type CoachResult = { reply: string; flag?: string; limited?: boolean };

/** Full coaching turn: rate limit → safety gate → grounded LLM → persist both messages. */
export async function runCoachTurn(userMessage: string): Promise<CoachResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { reply: "Please log in." };

  // Rate limit (atomic, server-side).
  const { data: allowed } = await supabase.rpc("increment_usage", { p_window_key: `chat:${todayISO()}`, p_limit: CHAT_DAILY_LIMIT });
  if (allowed === false) {
    return { reply: "You've reached today's coaching limit. It resets tomorrow — your plan, logs, and progress are all still here in the meantime.", limited: true };
  }

  // Persist the user's message first (so nothing is lost even if the model errors).
  await supabase.from("agent_messages").insert({ user_id: user.id, role: "user", channel: "web", content: userMessage });

  // Safety gate — never call the LLM on a tripped signal.
  const signal = detectSafetySignal(userMessage);
  if (signal) {
    await supabase.from("agent_messages").insert({ user_id: user.id, role: "assistant", channel: "web", content: signal.response, grounding: { safety_flag: signal.flag } });
    await supabase.rpc("append_audit_log", { p_action: "safety_signal", p_meta: { flag: signal.flag } });
    return { reply: signal.response, flag: signal.flag };
  }

  // Grounded LLM call.
  try {
    const grounding = await buildGrounding(supabase, user.id);
    const { data: hist } = await supabase
      .from("agent_messages").select("role, content").eq("channel", "web")
      .order("created_at", { ascending: false }).limit(HISTORY_TURNS * 2 + 1);
    const history: ChatTurn[] = (hist ?? [])
      .reverse()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -1) // drop the message we just inserted; it's passed separately
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const reply = await getCoachProvider().coach(`${SAFETY_SYSTEM_PROMPT}\n\n${grounding}`, history, userMessage);
    await supabase.from("agent_messages").insert({ user_id: user.id, role: "assistant", channel: "web", content: reply, grounding: { grounded: true } });
    return { reply };
  } catch {
    const fallback = "I'm having trouble reaching my coaching brain right now. Your message is saved — please try again in a moment. Meanwhile, your plan and targets are on your dashboard.";
    await supabase.from("agent_messages").insert({ user_id: user.id, role: "assistant", channel: "web", content: fallback, grounding: { error: true } });
    return { reply: fallback };
  }
}
