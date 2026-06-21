import { describe, it, expect } from "vitest";
import { computeReadiness } from "./recovery";

describe("recovery readiness", () => {
  it("good sleep + high energy → green / full", () => {
    const v = computeReadiness({ sleepHours: 8, energy: 5, soreness: 1 });
    expect(v.band).toBe("green");
    expect(v.readiness).toBe("full");
    expect(v.score).toBeGreaterThanOrEqual(80);
  });

  it("poor sleep + sore → red / easy", () => {
    const v = computeReadiness({ sleepHours: 4.5, energy: 2, soreness: 5 });
    expect(v.band).toBe("red");
    expect(v.readiness).toBe("easy");
    expect(v.directive).toMatch(/easy|walk|recovery/i);
  });

  it("moderate → amber / controlled", () => {
    const v = computeReadiness({ sleepHours: 6.5, energy: 3, soreness: 3 });
    expect(v.band).toBe("amber");
    expect(v.readiness).toBe("controlled");
  });

  it("no signals → unknown with a prompt to check in", () => {
    const v = computeReadiness({});
    expect(v.band).toBe("unknown");
    expect(v.score).toBeNull();
    expect(v.directive).toMatch(/checkin/i);
  });

  it("cites drivers in the reason", () => {
    const v = computeReadiness({ sleepHours: 5, soreness: 4 });
    expect(v.reason).toMatch(/slept 5h/);
    expect(v.reason).toMatch(/soreness 4\/5/);
  });
});
