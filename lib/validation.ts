import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const strOpt = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v && v.length > 0 ? v : undefined));

export const onboardingSchema = z.object({
  nickname: z.string().trim().min(1, "Tell us what to call you.").max(40),
  age: z.coerce.number().int().min(13, "You must be at least 13 to use Fitpal.").max(100),
  sex: z.enum(["male", "female", "other", "prefer_not"]).default("prefer_not"),
  heightCm: z.coerce.number().min(80).max(260),
  weightKg: z.coerce.number().min(25).max(400),
  primaryGoal: z.enum(["lose_fat", "build_muscle", "maintain", "recomp", "general_health"]),
  targetWeightKg: z.coerce.number().min(25).max(400).optional().or(z.literal("").transform(() => undefined)),
  targetDate: z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  daysPerWeek: z.coerce.number().int().min(1).max(7),
  preferredDays: z.array(z.string()).optional().default([]),
  sessionMinutes: z.coerce.number().int().min(10).max(240),
  equipment: z.array(z.string()).optional().default([]),
  injuries: strOpt(500),
  cardioPref: z.enum(["none", "light", "moderate", "lots"]).default("light"),
  dietPref: z.enum(["none", "vegetarian", "vegan", "pescatarian", "halal", "kosher", "other"]).default("none"),
  sleepHoursAvg: z.coerce.number().min(0).max(24).optional().or(z.literal("").transform(() => undefined)),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).default("moderate"),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;

/** Whole-number weeks between today and an ISO date (UTC), or null. */
export function weeksUntil(isoDate: string | undefined, now = new Date()): number | null {
  if (!isoDate) return null;
  const target = new Date(isoDate + "T00:00:00Z");
  if (isNaN(target.getTime())) return null;
  const ms = target.getTime() - now.getTime();
  const weeks = ms / (1000 * 60 * 60 * 24 * 7);
  return weeks > 0 ? Math.round(weeks) : null;
}
