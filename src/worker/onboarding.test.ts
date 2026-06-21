import { describe, it, expect } from "vitest";
import { parseStep, buildPlanInput, STEP_COUNT, type Answers } from "./onboarding";

describe("onboarding parsers", () => {
  it("validates age range", () => {
    expect(parseStep(2, "28")).toMatchObject({ ok: true, value: 28 });
    expect(parseStep(2, "9")).toMatchObject({ ok: false });
    expect(parseStep(2, "abc")).toMatchObject({ ok: false });
  });

  it("maps goal by number or keyword", () => {
    expect(parseStep(6, "1")).toMatchObject({ ok: true, value: "lose_fat" });
    expect(parseStep(6, "build muscle")).toMatchObject({ ok: true, value: "build_muscle" });
    expect(parseStep(6, "9")).toMatchObject({ ok: false });
  });

  it("maps experience", () => {
    expect(parseStep(7, "2")).toMatchObject({ ok: true, value: "intermediate" });
    expect(parseStep(7, "advanced")).toMatchObject({ ok: true, value: "advanced" });
  });

  it("parses equipment from free text, defaults to bodyweight", () => {
    expect(parseStep(9, "barbell and dumbbells at the gym")).toMatchObject({ ok: true });
    const r = parseStep(9, "barbell and dumbbells at the gym");
    if (r.ok) expect(r.value).toEqual(expect.arrayContaining(["barbell", "dumbbell", "machines"]));
    const none = parseStep(9, "nothing");
    if (none.ok) expect(none.value).toEqual(["bodyweight"]);
  });

  it("treats 'none' injuries as empty", () => {
    expect(parseStep(10, "none")).toMatchObject({ ok: true, value: "" });
    const r = parseStep(10, "left knee pain");
    if (r.ok) expect(r.value).toBe("left knee pain");
  });

  it("builds a valid plan input with defaults", () => {
    const answers: Answers = { nickname: "A", age: 28, sex: "male", heightCm: 180, weightKg: 82, goal: "lose_fat", experience: "intermediate", daysPerWeek: 4, equipment: ["barbell"], injuries: "" };
    const input = buildPlanInput(answers);
    expect(input.age).toBe(28);
    expect(input.goal).toBe("lose_fat");
    expect(input.daysPerWeek).toBe(4);
    expect(input.sessionMinutes).toBe(45); // default
    expect(input.activityLevel).toBe("moderate"); // default
  });

  it("has the expected number of steps", () => {
    expect(STEP_COUNT).toBe(10);
  });
});
