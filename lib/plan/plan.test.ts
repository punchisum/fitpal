import { describe, it, expect } from "vitest";
import { generatePlan } from "./generate";
import { bmr, computeTargets, calorieFloor } from "./nutrition";
import type { PlanInput } from "./types";

const base: PlanInput = {
  age: 30,
  sex: "male",
  heightCm: 178,
  weightKg: 80,
  goal: "lose_fat",
  experience: "intermediate",
  daysPerWeek: 4,
  sessionMinutes: 60,
  equipment: ["barbell", "dumbbell", "machines"],
  cardioPref: "moderate",
  activityLevel: "moderate",
};

describe("BMR (Mifflin-St Jeor)", () => {
  it("matches the known male formula", () => {
    // 10*80 + 6.25*178 - 5*30 + 5 = 800 + 1112.5 - 150 + 5 = 1767.5
    expect(bmr("male", 80, 178, 30)).toBeCloseTo(1767.5, 1);
  });
  it("female is 166 kcal lower than male", () => {
    expect(bmr("male", 80, 178, 30) - bmr("female", 80, 178, 30)).toBeCloseTo(166, 1);
  });
});

describe("safety clamps", () => {
  it("never prescribes below the calorie floor", () => {
    const tiny: PlanInput = { ...base, weightKg: 50, heightCm: 150, sex: "female", goal: "lose_fat", activityLevel: "sedentary" };
    const t = computeTargets(tiny);
    expect(t.calories).toBeGreaterThanOrEqual(t.calorieFloor);
    expect(t.calorieFloor).toBeGreaterThanOrEqual(1200);
  });

  it("caps fat-loss deficit at ~20% of maintenance", () => {
    const t = computeTargets({ ...base, targetWeightKg: 60, weeksToTarget: 4 }); // wildly aggressive request
    expect(Math.abs(t.dailyAdjustment)).toBeLessThanOrEqual(t.maintenanceCalories * 0.2 + 1);
    expect(Math.abs(t.weeklyRateKg)).toBeLessThanOrEqual(1.0);
  });

  it("caps muscle-gain surplus at 400 kcal", () => {
    const t = computeTargets({ ...base, goal: "build_muscle", targetWeightKg: 95, weeksToTarget: 4 });
    expect(t.dailyAdjustment).toBeLessThanOrEqual(400);
    expect(t.dailyAdjustment).toBeGreaterThan(0);
  });

  it("always leaves at least one rest day (max 6 training days)", () => {
    const p = generatePlan({ ...base, daysPerWeek: 7 });
    expect(p.training.daysPerWeek).toBeLessThanOrEqual(6);
    expect(p.training.restDays).toBeGreaterThanOrEqual(1);
    expect(p.training.days.length).toBe(p.training.daysPerWeek);
  });
});

describe("minors", () => {
  it("under-16 is forced to maintenance + general health with a safety flag", () => {
    const p = generatePlan({ ...base, age: 14, goal: "lose_fat" });
    expect(p.safetyFlags).toContain("minor_under_16");
    expect(p.goal).toBe("general_health");
    expect(p.targets.dailyAdjustment).toBe(0);
  });
  it("16-17 gets a conservative flag but keeps the goal", () => {
    const p = generatePlan({ ...base, age: 17, goal: "build_muscle" });
    expect(p.safetyFlags).toContain("minor_16_17");
    expect(p.goal).toBe("build_muscle");
  });
});

describe("macros", () => {
  it("protein scales with bodyweight and goal", () => {
    const cut = computeTargets({ ...base, goal: "lose_fat" });
    const maintain = computeTargets({ ...base, goal: "maintain" });
    expect(cut.proteinG).toBe(160); // 2.0 * 80
    expect(maintain.proteinG).toBe(128); // 1.6 * 80
  });
  it("macros are non-negative and roughly reconcile to calories", () => {
    const t = computeTargets(base);
    const kcalFromMacros = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(t.carbsG).toBeGreaterThanOrEqual(0);
    expect(Math.abs(kcalFromMacros - t.calories)).toBeLessThanOrEqual(60);
  });
});

describe("splits", () => {
  it("3 days → full body, 4 → upper/lower, 6 → PPL 2×", () => {
    expect(generatePlan({ ...base, daysPerWeek: 3 }).training.splitName).toMatch(/Full body/);
    expect(generatePlan({ ...base, daysPerWeek: 4 }).training.splitName).toMatch(/Upper/);
    expect(generatePlan({ ...base, daysPerWeek: 6 }).training.splitName).toMatch(/Push/);
  });
  it("bodyweight-only users get bodyweight exercises", () => {
    const p = generatePlan({ ...base, equipment: [] });
    const all = p.training.days.flatMap((d) => d.exercises).join(" ");
    expect(all).toMatch(/Push-ups|squats/i);
    expect(all).not.toMatch(/Barbell/);
  });
});

describe("injuries", () => {
  it("flags injuries and adds a professional-referral note", () => {
    const p = generatePlan({ ...base, injuries: "left knee pain" });
    expect(p.safetyFlags).toContain("has_injuries");
    expect(p.notes.join(" ")).toMatch(/professional|physio|doctor/i);
  });
});
