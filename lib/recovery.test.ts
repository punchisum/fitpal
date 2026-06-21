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

  it("suppressed HRV vs baseline drags readiness down and flags wearable", () => {
    const v = computeReadiness({ hrvMs: 38, hrvBaseline: 50, restingHr: 60, rhrBaseline: 52, sleepHours: 7 });
    expect(v.usedWearable).toBe(true);
    expect(v.band).not.toBe("green"); // HRV -24% + RHR +8 should bite
    expect(v.reason).toMatch(/HRV 38ms/);
    expect(v.reason).toMatch(/RHR 60/);
  });

  it("good HRV above baseline stays green", () => {
    const v = computeReadiness({ hrvMs: 58, hrvBaseline: 50, restingHr: 50, rhrBaseline: 52, sleepHours: 8 });
    expect(v.band).toBe("green");
    expect(v.usedWearable).toBe(true);
  });

  it("HRV without a baseline still records the driver, no false penalty", () => {
    const v = computeReadiness({ hrvMs: 45, sleepHours: 8 });
    expect(v.usedWearable).toBe(true);
    expect(v.reason).toMatch(/HRV 45ms/);
    expect(v.band).toBe("green");
  });
});
