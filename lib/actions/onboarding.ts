"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema, weeksUntil } from "@/lib/validation";
import { generatePlan } from "@/lib/plan";
import type { PlanInput } from "@/lib/plan";

export type OnboardingState = { error?: string };

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = onboardingSchema.safeParse({
    nickname: formData.get("nickname"),
    age: formData.get("age"),
    sex: formData.get("sex") || "prefer_not",
    heightCm: formData.get("heightCm"),
    weightKg: formData.get("weightKg"),
    primaryGoal: formData.get("primaryGoal"),
    targetWeightKg: formData.get("targetWeightKg") || "",
    targetDate: formData.get("targetDate") || "",
    experience: formData.get("experience"),
    daysPerWeek: formData.get("daysPerWeek"),
    preferredDays: formData.getAll("preferredDays").map(String),
    sessionMinutes: formData.get("sessionMinutes"),
    equipment: formData.getAll("equipment").map(String),
    injuries: formData.get("injuries") || "",
    cardioPref: formData.get("cardioPref") || "light",
    dietPref: formData.get("dietPref") || "none",
    sleepHoursAvg: formData.get("sleepHoursAvg") || "",
    activityLevel: formData.get("activityLevel") || "moderate",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  const v = parsed.data;

  const planInput: PlanInput = {
    age: v.age,
    sex: v.sex,
    heightCm: v.heightCm,
    weightKg: v.weightKg,
    goal: v.primaryGoal,
    targetWeightKg: v.targetWeightKg ?? null,
    weeksToTarget: weeksUntil(v.targetDate),
    experience: v.experience,
    daysPerWeek: v.daysPerWeek,
    preferredDays: v.preferredDays,
    sessionMinutes: v.sessionMinutes,
    equipment: v.equipment,
    injuries: v.injuries ?? null,
    cardioPref: v.cardioPref,
    activityLevel: v.activityLevel,
  };
  const plan = generatePlan(planInput);
  const birthYear = new Date().getFullYear() - v.age;

  // 1) profile
  const { error: pErr } = await supabase.from("profiles").update({
    nickname: v.nickname,
    sex: v.sex,
    birth_year: birthYear,
    height_cm: v.heightCm,
    onboarding_complete: true,
  }).eq("user_id", user.id);
  if (pErr) return { error: "Could not save your profile. Please try again." };

  // 2) raw responses (audit / re-derivation source)
  await supabase.from("onboarding_responses").insert({ user_id: user.id, payload: v });

  // 3) goal — deactivate any prior, insert active
  await supabase.from("fitness_goals").update({ is_active: false }).eq("user_id", user.id).eq("is_active", true);
  await supabase.from("fitness_goals").insert({
    user_id: user.id,
    primary_goal: v.primaryGoal,
    start_weight_kg: v.weightKg,
    target_weight_kg: v.targetWeightKg ?? null,
    target_date: v.targetDate ?? null,
    is_active: true,
  });

  // 4) preferences
  await supabase.from("training_preferences").insert({
    user_id: user.id,
    experience: v.experience,
    days_per_week: v.daysPerWeek,
    preferred_days: v.preferredDays,
    session_minutes: v.sessionMinutes,
    equipment: v.equipment,
    cardio_pref: v.cardioPref,
    injuries: v.injuries ?? null,
    diet_pref: v.dietPref,
    sleep_hours_avg: v.sleepHoursAvg ?? null,
    activity_level: v.activityLevel,
  });

  // 5) activate the generated plan atomically (SECURITY DEFINER, owner = auth.uid())
  const { error: planErr } = await supabase.rpc("activate_fitness_plan", { p_plan: plan, p_source: "deterministic" });
  if (planErr) return { error: "Saved your profile, but plan generation failed. Try again from settings." };

  await supabase.rpc("append_audit_log", { p_action: "onboarding_complete", p_meta: { goal: v.primaryGoal } });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
