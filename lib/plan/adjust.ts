// Deterministic weekly plan adjustment: compare actual weight change vs the plan's target rate
// and propose a calorie nudge (capped, safe). The LLM never sets this — it only re-phrases it.
import type { FitnessPlan } from "./types";

export interface WeighIn { date: string; kg: number }

export interface Adjustment {
  deltaKcal: number; // applied change (signed), after clamping/floor
  newCalories: number;
  newCarbsG: number;
  actualRateKg: number; // observed kg/week (signed)
  targetRateKg: number; // plan target kg/week (signed)
  rationale: string;
}

const KCAL_PER_KG_PER_WEEK = 1100; // ~7700 kcal/kg ÷ 7

export function computeAdjustment(plan: FitnessPlan, weighIns: WeighIn[]): Adjustment | null {
  const w = [...weighIns].filter((x) => Number.isFinite(x.kg)).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 2) return null;
  const first = w[0], last = w[w.length - 1];
  const days = (Date.parse(last.date) - Date.parse(first.date)) / 86400000;
  if (days < 5) return null; // not enough span to judge a trend

  const actualRateKg = (last.kg - first.kg) / (days / 7);
  const targetRateKg = plan.targets.weeklyRateKg;

  let deltaKcal = Math.round(((targetRateKg - actualRateKg) * KCAL_PER_KG_PER_WEEK) / 50) * 50;
  deltaKcal = Math.max(-250, Math.min(250, deltaKcal)); // never swing a plan by more than 250 kcal/wk
  if (Math.abs(deltaKcal) < 75) return null; // close enough — on track

  const newCalories = Math.max(plan.targets.calorieFloor, plan.targets.calories + deltaKcal);
  const realDelta = newCalories - plan.targets.calories;
  if (Math.abs(realDelta) < 50) return null; // floor ate the change

  const newCarbsG = Math.max(0, Math.round((newCalories - plan.targets.proteinG * 4 - plan.targets.fatG * 9) / 4));

  const r = (n: number) => Math.abs(Number(n.toFixed(2)));
  const goalLosing = targetRateKg < 0;
  let why: string;
  if (realDelta > 0) {
    why = goalLosing
      ? `You're losing ~${r(actualRateKg)} kg/wk — faster than your ~${r(targetRateKg)} kg/wk target. Going too fast risks muscle and burnout.`
      : `You're under your ~${r(targetRateKg)} kg/wk gain target (actual ~${r(actualRateKg)}).`;
  } else {
    why = goalLosing
      ? `You're losing ~${r(actualRateKg)} kg/wk — slower than your ~${r(targetRateKg)} kg/wk target.`
      : `You're gaining faster than target — let's trim it to stay lean.`;
  }
  const rationale = `${why} I suggest ${realDelta > 0 ? "+" : ""}${realDelta} kcal/day → ${newCalories} kcal.`;

  return { deltaKcal: realDelta, newCalories, newCarbsG, actualRateKg: Number(actualRateKg.toFixed(2)), targetRateKg, rationale };
}

/** Apply an adjustment to a plan, returning the new plan object to store/activate. */
export function applyAdjustment(plan: FitnessPlan, adj: Adjustment): FitnessPlan {
  return {
    ...plan,
    summary: plan.summary.replace(/\d+ kcal\/day/, `${adj.newCalories} kcal/day`),
    targets: {
      ...plan.targets,
      calories: adj.newCalories,
      carbsG: adj.newCarbsG,
      dailyAdjustment: plan.targets.dailyAdjustment + adj.deltaKcal,
    },
  };
}
