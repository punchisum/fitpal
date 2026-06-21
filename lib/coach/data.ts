import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FitnessPlan } from "@/lib/plan";
import { computeReadiness } from "@/lib/recovery";
import { todayISO, daysAgoISO } from "@/lib/date";

// ---- list view ------------------------------------------------------------

export type CoachUserSummary = {
  user_id: string;
  nickname: string | null;
  goal: string | null;
  onboarded: boolean;
  linked: boolean;
  joined: string | null;
  lastActive: string | null;
  todayCalories: number;
  todayProtein: number;
  calorieTarget: number | null;
  proteinTarget: number | null;
  streak: number;
};

function streakFromDays(days: Set<string>, today: string): number {
  let streak = 0;
  const d = new Date(today + "T00:00:00Z");
  if (!days.has(today)) d.setUTCDate(d.getUTCDate() - 1); // grace: count from yesterday
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

/** Every user with a roll-up of today's intake, last activity, streak, plan targets. */
export async function listUsers(): Promise<CoachUserSummary[]> {
  const db = createAdminClient();
  const today = todayISO();
  const since = daysAgoISO(30);

  const [profiles, goals, plans, nutri, links] = await Promise.all([
    db.from("profiles").select("user_id,nickname,onboarding_complete"),
    db.from("fitness_goals").select("user_id,primary_goal").eq("is_active", true),
    db.from("fitness_plans").select("user_id,plan").eq("is_active", true),
    db.from("nutrition_logs").select("user_id,log_date,calories,protein_g").gte("log_date", since),
    db.from("telegram_identities").select("user_id,linked_at").eq("is_active", true),
  ]);

  const goalBy = new Map((goals.data ?? []).map((g) => [g.user_id, g.primary_goal as string]));
  const planBy = new Map((plans.data ?? []).map((p) => [p.user_id, p.plan as FitnessPlan]));
  const linkBy = new Map((links.data ?? []).map((l) => [l.user_id, l.linked_at as string]));
  const nutBy = new Map<string, { log_date: string; calories: number; protein_g: number }[]>();
  for (const r of nutri.data ?? []) {
    const a = nutBy.get(r.user_id) ?? [];
    a.push(r as { log_date: string; calories: number; protein_g: number });
    nutBy.set(r.user_id, a);
  }

  return (profiles.data ?? [])
    .map((p): CoachUserSummary => {
      const rows = nutBy.get(p.user_id) ?? [];
      const todayRows = rows.filter((r) => r.log_date === today);
      const days = new Set(rows.map((r) => r.log_date));
      const lastLog = rows.length ? rows.map((r) => r.log_date).sort().at(-1)! : null;
      const plan = planBy.get(p.user_id);
      return {
        user_id: p.user_id,
        nickname: p.nickname ?? null,
        goal: goalBy.get(p.user_id) ?? null,
        onboarded: !!p.onboarding_complete,
        linked: linkBy.has(p.user_id),
        joined: linkBy.get(p.user_id) ?? null,
        lastActive: lastLog,
        todayCalories: Math.round(todayRows.reduce((a, r) => a + Number(r.calories ?? 0), 0)),
        todayProtein: Math.round(todayRows.reduce((a, r) => a + Number(r.protein_g ?? 0), 0)),
        calorieTarget: plan?.targets?.calories ?? null,
        proteinTarget: plan?.targets?.proteinG ?? null,
        streak: streakFromDays(days, today),
      };
    })
    .sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));
}

// ---- detail view ----------------------------------------------------------

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((n): n is number => typeof n === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export async function getUserDetail(userId: string) {
  const db = createAdminClient();
  const today = todayISO();

  const [profileR, goalR, planR, nutR, ckR, hmR, woR, fbR, linkR] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("fitness_goals").select("*").eq("user_id", userId).eq("is_active", true).maybeSingle(),
    db.from("fitness_plans").select("plan,created_at,source").eq("user_id", userId).eq("is_active", true).maybeSingle(),
    db.from("nutrition_logs").select("*").eq("user_id", userId).gte("log_date", daysAgoISO(14)).order("log_date", { ascending: false }),
    db.from("daily_checkins").select("*").eq("user_id", userId).gte("checkin_date", daysAgoISO(90)).order("checkin_date", { ascending: false }),
    db.from("health_metrics").select("*").eq("user_id", userId).gte("metric_date", daysAgoISO(7)).order("metric_date", { ascending: false }),
    db.from("workout_logs").select("*").eq("user_id", userId).order("workout_date", { ascending: false }).limit(10),
    db.from("feedback").select("message,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    db.from("telegram_identities").select("telegram_user_id,linked_at").eq("user_id", userId).maybeSingle(),
  ]);

  if (!profileR.data) return null;

  const checkins = ckR.data ?? [];
  const hm = hmR.data ?? [];
  const todayCk = checkins.find((c) => c.checkin_date === today);
  const todayHm = hm.find((h) => h.metric_date === today);

  const readiness = (todayCk || todayHm)
    ? computeReadiness({
        sleepHours: todayHm?.sleep_hours ?? todayCk?.sleep_hours ?? null,
        energy: todayCk?.energy ?? null,
        soreness: todayCk?.soreness ?? null,
        hrvMs: todayHm?.hrv_ms ?? null,
        restingHr: todayHm?.resting_hr ?? null,
        hrvBaseline: avg(hm.map((h) => h.hrv_ms)),
        rhrBaseline: avg(hm.map((h) => h.resting_hr)),
      })
    : null;

  // Oldest → newest weights for the sparkline.
  const weights = [...checkins].reverse().filter((c) => c.bodyweight_kg != null).map((c) => Number(c.bodyweight_kg));

  // Per-day nutrition roll-up (newest first) for the food timeline.
  const nutrition = nutR.data ?? [];
  const byDay = new Map<string, { calories: number; protein: number; items: typeof nutrition }>();
  for (const r of nutrition) {
    const e = byDay.get(r.log_date) ?? { calories: 0, protein: 0, items: [] };
    e.calories += Number(r.calories ?? 0);
    e.protein += Number(r.protein_g ?? 0);
    e.items.push(r);
    byDay.set(r.log_date, e);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return {
    profile: profileR.data,
    goal: goalR.data,
    plan: (planR.data?.plan ?? null) as FitnessPlan | null,
    planSource: planR.data?.source ?? null,
    readiness,
    weights,
    days,
    checkins,
    workouts: woR.data ?? [],
    feedback: fbR.data ?? [],
    link: linkR.data,
  };
}
