import { describe, it, expect } from "vitest";
import { computeAdjustment, applyAdjustment } from "./adjust";
import type { FitnessPlan } from "./types";

const plan: FitnessPlan = {
  summary: "A lose fat plan: 2200 kcal/day, 160 g protein.",
  goal: "lose_fat",
  targets: { calories: 2200, proteinG: 160, carbsG: 200, fatG: 60, calorieFloor: 1500, maintenanceCalories: 2600, dailyAdjustment: -400, weeklyRateKg: -0.4 },
  training: { daysPerWeek: 4, restDays: 3, splitName: "Upper / Lower", days: [] },
  cardio: { sessionsPerWeek: 3, minutesPerSession: 25, type: "z2" },
  notes: [], safetyFlags: [],
};

describe("computeAdjustment", () => {
  it("losing too fast → suggests MORE calories", () => {
    const adj = computeAdjustment(plan, [{ date: "2026-06-07", kg: 82 }, { date: "2026-06-21", kg: 80 }]); // -1 kg/wk vs -0.4 target
    expect(adj).not.toBeNull();
    expect(adj!.deltaKcal).toBeGreaterThan(0);
    expect(adj!.newCalories).toBeGreaterThan(2200);
    expect(adj!.rationale).toMatch(/faster/i);
  });

  it("losing too slow → suggests FEWER calories", () => {
    const adj = computeAdjustment(plan, [{ date: "2026-06-07", kg: 80.1 }, { date: "2026-06-21", kg: 80 }]); // ~-0.05 kg/wk
    expect(adj).not.toBeNull();
    expect(adj!.deltaKcal).toBeLessThan(0);
    expect(adj!.newCalories).toBeLessThan(2200);
  });

  it("on track → no proposal", () => {
    const adj = computeAdjustment(plan, [{ date: "2026-06-07", kg: 80.8 }, { date: "2026-06-21", kg: 80 }]); // -0.4 kg/wk ≈ target
    expect(adj).toBeNull();
  });

  it("not enough data → null", () => {
    expect(computeAdjustment(plan, [{ date: "2026-06-20", kg: 80 }])).toBeNull();
    expect(computeAdjustment(plan, [{ date: "2026-06-20", kg: 80 }, { date: "2026-06-22", kg: 79 }])).toBeNull(); // <5 days
  });

  it("never swings more than 250 kcal, respects the floor", () => {
    const adj = computeAdjustment(plan, [{ date: "2026-06-07", kg: 85 }, { date: "2026-06-21", kg: 80 }]); // wildly fast
    expect(Math.abs(adj!.deltaKcal)).toBeLessThanOrEqual(250);
  });

  it("applyAdjustment recomputes calories + carbs and updates summary", () => {
    const adj = computeAdjustment(plan, [{ date: "2026-06-07", kg: 82 }, { date: "2026-06-21", kg: 80 }])!;
    const np = applyAdjustment(plan, adj);
    expect(np.targets.calories).toBe(adj.newCalories);
    expect(np.targets.carbsG).toBe(adj.newCarbsG);
    expect(np.summary).toContain(`${adj.newCalories} kcal/day`);
    expect(np.targets.proteinG).toBe(160); // protein preserved
  });
});
