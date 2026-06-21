"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";

export type LogState = { error?: string; ok?: boolean };

async function uid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

const num = (min: number, max: number) =>
  z.coerce.number().min(min).max(max).optional().or(z.literal("").transform(() => undefined));

const checkinSchema = z.object({
  sleep_hours: num(0, 24),
  energy: num(1, 5),
  soreness: num(1, 5),
  mood: num(1, 5),
  bodyweight_kg: num(25, 400),
  notes: z.string().trim().max(500).optional().transform((v) => (v && v.length ? v : undefined)),
});

export async function saveCheckin(_prev: LogState, formData: FormData): Promise<LogState> {
  const { supabase, userId } = await uid();
  const parsed = checkinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check your check-in values." };
  const { error } = await supabase.from("daily_checkins").upsert(
    { user_id: userId, checkin_date: todayISO(), ...parsed.data },
    { onConflict: "user_id,checkin_date" }
  );
  if (error) return { error: "Could not save your check-in." };
  revalidatePath("/today");
  revalidatePath("/dashboard");
  return { ok: true };
}

const workoutSchema = z.object({
  type: z.string().trim().max(80).optional().transform((v) => (v && v.length ? v : undefined)),
  duration_min: num(0, 600),
  perceived_effort: num(1, 10),
  notes: z.string().trim().max(500).optional().transform((v) => (v && v.length ? v : undefined)),
  completed: z.coerce.boolean().optional().default(true),
});

export async function logWorkout(_prev: LogState, formData: FormData): Promise<LogState> {
  const { supabase, userId } = await uid();
  const parsed = workoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check your workout values." };
  const { error } = await supabase.from("workout_logs").insert({
    user_id: userId, workout_date: todayISO(), exercises: [], ...parsed.data,
  });
  if (error) return { error: "Could not save your workout." };
  revalidatePath("/workout");
  revalidatePath("/progress");
  revalidatePath("/dashboard");
  return { ok: true };
}

const nutritionSchema = z.object({
  description: z.string().trim().max(200).optional().transform((v) => (v && v.length ? v : undefined)),
  calories: num(0, 20000),
  protein_g: num(0, 1000),
  carbs_g: num(0, 2000),
  fat_g: num(0, 1000),
});

export async function logNutrition(_prev: LogState, formData: FormData): Promise<LogState> {
  const { supabase, userId } = await uid();
  const parsed = nutritionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check your food values." };
  const { error } = await supabase.from("nutrition_logs").insert({
    user_id: userId, log_date: todayISO(), source: "manual", ...parsed.data,
  });
  if (error) return { error: "Could not save your food log." };
  revalidatePath("/today");
  revalidatePath("/progress");
  return { ok: true };
}

export async function deleteRow(table: "workout_logs" | "nutrition_logs" | "daily_checkins", id: string): Promise<void> {
  const { supabase } = await uid();
  await supabase.from(table).delete().eq("id", id);
  revalidatePath("/today");
  revalidatePath("/workout");
  revalidatePath("/progress");
}
