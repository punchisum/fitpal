import { describe, it, expect } from "vitest";
import { detectSafetySignal } from "./safety";

describe("safety signal detection", () => {
  it("flags eating-disorder language and refers to a professional", () => {
    const s = detectSafetySignal("I've been making myself vomit after meals to lose weight");
    expect(s?.flag).toBe("eating_disorder");
    expect(s?.response).toMatch(/professional|dietitian|doctor/i);
  });

  it("flags self-harm with crisis guidance, not coaching", () => {
    const s = detectSafetySignal("honestly I want to die");
    expect(s?.flag).toBe("self_harm");
    expect(s?.response).toMatch(/crisis|professional|emergency|trust/i);
  });

  it("flags acute medical symptoms", () => {
    const s = detectSafetySignal("I get chest pain when I run");
    expect(s?.flag).toBe("medical");
    expect(s?.response).toMatch(/doctor|emergency|professional/i);
  });

  it("does NOT flag ordinary fitness questions", () => {
    expect(detectSafetySignal("how much protein should I eat to build muscle?")).toBeNull();
    expect(detectSafetySignal("I missed two workouts this week, what now?")).toBeNull();
    expect(detectSafetySignal("can you explain progressive overload?")).toBeNull();
  });
});
