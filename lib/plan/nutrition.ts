// Nutrition math — Mifflin-St Jeor BMR, TDEE, goal-adjusted calories + macros, with safety clamps.
import type { PlanInput, MacroTargets, Sex, ActivityLevel, Goal } from "./types";

const KCAL_PER_KG_FAT = 7700;

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Mifflin-St Jeor. "other"/"prefer_not" use the average of the male/female constants. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  return base + (5 - 161) / 2; // -78
}

export function tdee(input: PlanInput): number {
  const mult = ACTIVITY_MULTIPLIER[input.activityLevel ?? "moderate"];
  return bmr(input.sex, input.weightKg, input.heightCm, input.age) * mult;
}

/** Absolute calorie floor — never prescribe below this. */
export function calorieFloor(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const sexFloor = sex === "female" ? 1200 : 1400; // conservative public-safety floors
  return Math.max(sexFloor, Math.round(bmr(sex, weightKg, heightCm, age) * 1.1));
}

function proteinPerKg(goal: Goal): number {
  switch (goal) {
    case "lose_fat":
    case "recomp": return 2.0; // preserve lean mass in/near a deficit
    case "build_muscle": return 1.8;
    default: return 1.6;
  }
}

/**
 * Daily calorie adjustment for the goal, with safety caps:
 *  - fat-loss deficit capped at 20% of TDEE and ~1% bodyweight/week
 *  - muscle-gain surplus capped at +400 kcal (~0.35 kg/week)
 *  - never drops below the calorie floor
 */
export function computeTargets(input: PlanInput): MacroTargets {
  const maintenance = Math.round(tdee(input));
  const floor = calorieFloor(input.sex, input.weightKg, input.heightCm, input.age);
  let adjustment = 0;

  if (input.goal === "lose_fat" || input.goal === "recomp") {
    // Default ~0.5 kg/week; if a target+timeline given, derive but clamp to safe max (1%/week).
    let weeklyRate = 0.5;
    if (input.goal === "recomp") weeklyRate = 0.25;
    if (input.targetWeightKg != null && input.weeksToTarget && input.weeksToTarget > 0) {
      const need = input.weightKg - input.targetWeightKg;
      if (need > 0) weeklyRate = need / input.weeksToTarget;
    }
    const maxWeekly = Math.min(1.0, input.weightKg * 0.01); // ≤1% bodyweight/week
    weeklyRate = Math.min(weeklyRate, maxWeekly);
    weeklyRate = Math.max(weeklyRate, 0.1);
    let deficit = (weeklyRate * KCAL_PER_KG_FAT) / 7;
    deficit = Math.min(deficit, maintenance * 0.2); // ≤20% of TDEE
    adjustment = -Math.round(deficit);
  } else if (input.goal === "build_muscle") {
    let weeklyRate = 0.25;
    if (input.targetWeightKg != null && input.weeksToTarget && input.weeksToTarget > 0) {
      const need = input.targetWeightKg - input.weightKg;
      if (need > 0) weeklyRate = Math.min(need / input.weeksToTarget, 0.35);
    }
    let surplus = (weeklyRate * KCAL_PER_KG_FAT) / 7;
    surplus = Math.min(surplus, 400);
    adjustment = Math.round(surplus);
  }

  let calories = Math.round(maintenance + adjustment);
  if (calories < floor) {
    calories = floor;
    adjustment = calories - maintenance;
  }

  const proteinG = Math.round(proteinPerKg(input.goal) * input.weightKg);
  const fatG = Math.max(Math.round((calories * 0.25) / 9), Math.round(0.5 * input.weightKg));
  const remaining = calories - (proteinG * 4 + fatG * 9);
  const carbsG = Math.max(0, Math.round(remaining / 4));

  // Expected weekly rate from the final (clamped) adjustment.
  const weeklyRateKg = Number(((adjustment * 7) / KCAL_PER_KG_FAT).toFixed(2));

  return {
    calories,
    proteinG,
    carbsG,
    fatG,
    calorieFloor: floor,
    maintenanceCalories: maintenance,
    dailyAdjustment: adjustment,
    weeklyRateKg,
  };
}
