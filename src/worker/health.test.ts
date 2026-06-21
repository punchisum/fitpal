import { describe, it, expect } from "vitest";
import { parseHealthPayload } from "./health";

describe("parseHealthPayload", () => {
  it("parses the simple Shortcut shape", () => {
    const m = parseHealthPayload({ hrv_ms: 42, resting_hr: 54, sleep_hours: 7.3, date: "2026-06-21" });
    expect(m).toMatchObject({ hrv_ms: 42, resting_hr: 54, sleep_hours: 7.3, metric_date: "2026-06-21" });
  });

  it("coerces numeric strings", () => {
    const m = parseHealthPayload({ hrv_ms: "41.5", resting_hr: "52" });
    expect(m.hrv_ms).toBeCloseTo(41.5);
    expect(m.resting_hr).toBe(52);
  });

  it("pulls numbers out of value+unit strings (raw Shortcut output)", () => {
    const m = parseHealthPayload({ hrv_ms: "42 ms", resting_hr: "54 bpm", sleep_hours: "6.8 hr" });
    expect(m.hrv_ms).toBe(42);
    expect(m.resting_hr).toBe(54);
    expect(m.sleep_hours).toBeCloseTo(6.8);
  });

  it("parses the Auto Health Export metrics shape", () => {
    const m = parseHealthPayload({
      data: {
        metrics: [
          { name: "heart_rate_variability", units: "ms", data: [{ date: "2026-06-21 07:00:00 +0800", qty: 39 }] },
          { name: "resting_heart_rate", units: "bpm", data: [{ date: "2026-06-21 06:00:00 +0800", qty: 56 }] },
          { name: "sleep_analysis", units: "hr", data: [{ date: "2026-06-21 06:00:00 +0800", asleep: 6.8 }] },
        ],
      },
    });
    expect(m.hrv_ms).toBe(39);
    expect(m.resting_hr).toBe(56);
    expect(m.sleep_hours).toBeCloseTo(6.8);
    expect(m.metric_date).toBe("2026-06-21");
  });

  it("drops out-of-range nonsense", () => {
    const m = parseHealthPayload({ hrv_ms: 9999, resting_hr: 5, sleep_hours: 40 });
    expect(m.hrv_ms).toBeUndefined();
    expect(m.resting_hr).toBeUndefined();
    expect(m.sleep_hours).toBeUndefined();
  });

  it("returns empty for non-food/garbage", () => {
    expect(parseHealthPayload(null)).toEqual({});
    expect(parseHealthPayload("nope")).toEqual({});
  });
});
