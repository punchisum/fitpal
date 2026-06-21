// Orchestrator: turns onboarding input into a complete, safety-clamped plan.
import type { PlanInput, FitnessPlan, CardioPlan, CardioPref, Goal } from "./types";
import { computeTargets } from "./nutrition";
import { buildTraining } from "./training";

function buildCardio(pref: CardioPref | undefined, goal: Goal): CardioPlan {
  const base: Record<CardioPref, { s: number; m: number }> = {
    none: { s: 0, m: 0 },
    light: { s: 2, m: 20 },
    moderate: { s: 3, m: 25 },
    lots: { s: 4, m: 30 },
  };
  const b = base[pref ?? "light"];
  // Nudge fat-loss goals toward a little more easy cardio (never replaces lifting).
  const sessions = goal === "lose_fat" && b.s > 0 ? Math.min(b.s + 1, 5) : b.s;
  return {
    sessionsPerWeek: sessions,
    minutesPerSession: b.m,
    type: sessions > 0 ? "Zone-2 (brisk walk, cycle, or easy jog — conversational pace)" : "—",
  };
}

function goalLabel(g: Goal): string {
  return ({ lose_fat: "lose fat", build_muscle: "build muscle", maintain: "maintain", recomp: "body recomposition", general_health: "general health" } as const)[g];
}

export function generatePlan(rawInput: PlanInput): FitnessPlan {
  const notes: string[] = [];
  const safetyFlags: string[] = [];
  let input = rawInput;

  // ── Safety: minors ──
  if (input.age < 16) {
    safetyFlags.push("minor_under_16");
    notes.push(
      "You're under 16, so Fitpal keeps you at maintenance calories and general-health training only — no calorie deficits or aggressive programs. Please involve a parent/guardian and talk to a doctor before changing how you eat or train."
    );
    input = { ...input, goal: "general_health", targetWeightKg: null };
  } else if (input.age < 18) {
    safetyFlags.push("minor_16_17");
    notes.push("You're under 18 — Fitpal stays conservative. Growth and recovery matter more than fast results; loop in a parent/guardian and a doctor if you have any concerns.");
  }

  // ── Safety: injuries ──
  if (input.injuries && input.injuries.trim().length > 0) {
    safetyFlags.push("has_injuries");
    notes.push(
      "You noted injuries or limitations. Train pain-free, skip anything that hurts, and substitute movements as needed. If pain is sharp, persistent, or worsening, please see a qualified professional (physio or doctor) before continuing."
    );
  }

  const targets = computeTargets(input);
  const training = buildTraining(input);
  const cardio = buildCardio(input.cardioPref, input.goal);

  // ── Notes about the numbers ──
  if (targets.dailyAdjustment < 0) {
    notes.push(`Your target is a moderate deficit of about ${Math.abs(targets.dailyAdjustment)} kcal/day (~${Math.abs(targets.weeklyRateKg)} kg/week). Slow and steady protects muscle and is easier to sustain.`);
  } else if (targets.dailyAdjustment > 0) {
    notes.push(`Your target is a lean surplus of about ${targets.dailyAdjustment} kcal/day (~${targets.weeklyRateKg} kg/week) to build muscle with minimal fat gain.`);
  } else {
    notes.push("Your target is maintenance calories — fuel performance and recovery while your body adapts.");
  }
  if (targets.calories === targets.calorieFloor && targets.maintenanceCalories > targets.calorieFloor) {
    notes.push(`Calories were raised to a safe floor of ${targets.calorieFloor} kcal — Fitpal won't prescribe extreme restriction.`);
  }
  notes.push(`Protein target ${targets.proteinG} g/day is the priority macro; hit it daily and stay roughly within calories.`);
  notes.push(`${training.splitName}: ${training.daysPerWeek} training day(s), ${training.restDays} rest day(s). Rest is where you actually grow.`);

  const summary = `A ${goalLabel(input.goal)} plan: ${targets.calories} kcal/day, ${targets.proteinG} g protein, ${training.daysPerWeek}× ${training.splitName.toLowerCase()} per week.`;

  return { summary, goal: input.goal, targets, training, cardio, notes, safetyFlags };
}
