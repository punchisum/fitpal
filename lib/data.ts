import { createClient } from "@/lib/supabase/server";
import type { FitnessPlan } from "@/lib/plan";
import { todayISO, daysAgoISO } from "@/lib/date";

export type Profile = {
  user_id: string;
  nickname: string | null;
  sex: string | null;
  birth_year: number | null;
  height_cm: number | null;
  units: string;
  onboarding_complete: boolean;
};

export type ActivePlan = { id: string; plan: FitnessPlan; created_at: string; source: string } | null;

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  return (data as Profile) ?? null;
}

export async function getActivePlan(): Promise<ActivePlan> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fitness_plans")
    .select("id, plan, created_at, source")
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, plan: data.plan as FitnessPlan, created_at: data.created_at, source: data.source };
}

export async function getActiveGoal() {
  const supabase = await createClient();
  const { data } = await supabase.from("fitness_goals").select("*").eq("is_active", true).maybeSingle();
  return data;
}

export async function getTodayCheckin() {
  const supabase = await createClient();
  const { data } = await supabase.from("daily_checkins").select("*").eq("checkin_date", todayISO()).maybeSingle();
  return data;
}

export async function getRecentCheckins(limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_checkins")
    .select("*")
    .gte("checkin_date", daysAgoISO(90))
    .order("checkin_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getRecentWorkouts(limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_logs")
    .select("*")
    .order("workout_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getTodayNutrition() {
  const supabase = await createClient();
  const { data } = await supabase.from("nutrition_logs").select("*").eq("log_date", todayISO());
  const rows = data ?? [];
  const sum = rows.reduce(
    (acc, r) => ({
      calories: acc.calories + Number(r.calories ?? 0),
      protein: acc.protein + Number(r.protein_g ?? 0),
    }),
    { calories: 0, protein: 0 }
  );
  return { rows, sum };
}

export async function getRecentNutrition(limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_logs")
    .select("*")
    .order("log_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}
