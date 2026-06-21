// Deterministic plan engine — shared types.

export type Sex = "male" | "female" | "other" | "prefer_not";
export type Goal = "lose_fat" | "build_muscle" | "maintain" | "recomp" | "general_health";
export type Experience = "beginner" | "intermediate" | "advanced";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type CardioPref = "none" | "light" | "moderate" | "lots";

export interface PlanInput {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  targetWeightKg?: number | null;
  /** Weeks until target date, if the user gave one. Server computes from target_date. */
  weeksToTarget?: number | null;
  experience: Experience;
  daysPerWeek: number;
  preferredDays?: string[];
  sessionMinutes: number;
  equipment?: string[];
  injuries?: string | null;
  cardioPref?: CardioPref;
  activityLevel?: ActivityLevel;
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calorieFloor: number;
  maintenanceCalories: number;
  dailyAdjustment: number; // negative = deficit, positive = surplus
  weeklyRateKg: number; // expected weight change per week (signed)
}

export interface TrainingDay {
  day: string; // e.g. "Mon" or "Day 1"
  focus: string; // e.g. "Upper body"
  exercises: string[];
}

export interface TrainingPlan {
  daysPerWeek: number;
  restDays: number;
  splitName: string;
  days: TrainingDay[];
}

export interface CardioPlan {
  sessionsPerWeek: number;
  minutesPerSession: number;
  type: string;
}

export interface FitnessPlan {
  summary: string;
  goal: Goal;
  targets: MacroTargets;
  training: TrainingPlan;
  cardio: CardioPlan;
  notes: string[];
  safetyFlags: string[];
}
