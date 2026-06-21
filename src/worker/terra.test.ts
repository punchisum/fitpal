import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { parseTerraPayload, verifyTerraSignature } from "./terra";

describe("parseTerraPayload", () => {
  it("extracts HRV / resting HR / sleep from a Terra sleep payload", () => {
    const body = {
      type: "sleep",
      user: { user_id: "terra-123", reference_id: "fitpal-user-uuid" },
      data: [{
        metadata: { start_time: "2026-06-20T23:10:00Z", end_time: "2026-06-21T07:00:00Z" },
        heart_rate_data: { summary: { avg_hrv_rmssd: 44.6, resting_hr_bpm: 53 } },
        sleep_durations_data: { asleep: { duration_asleep_state_seconds: 25200 } }, // 7h
      }],
    };
    const r = parseTerraPayload(body);
    expect(r.referenceId).toBe("fitpal-user-uuid");
    expect(r.metrics).toHaveLength(1);
    expect(r.metrics[0]).toMatchObject({ hrv_ms: 45, resting_hr: 53, sleep_hours: 7, metric_date: "2026-06-21" });
  });

  it("ignores connection/auth events with no metrics", () => {
    const r = parseTerraPayload({ type: "auth", status: "success", user: { reference_id: "u1" }, data: [] });
    expect(r.metrics).toHaveLength(0);
    expect(r.referenceId).toBe("u1");
  });

  it("drops out-of-range values", () => {
    const r = parseTerraPayload({ user: { reference_id: "u" }, data: [{ heart_rate_data: { summary: { avg_hrv_rmssd: 9999, resting_hr_bpm: 5 } } }] });
    expect(r.metrics).toHaveLength(0);
  });
});

describe("verifyTerraSignature", () => {
  const secret = "test_signing_secret";
  const body = '{"type":"sleep","data":[]}';

  it("accepts a correctly signed payload", async () => {
    const t = "1723808700";
    const hex = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(await verifyTerraSignature(secret, `t=${t},v1=${hex}`, body)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const t = "1723808700";
    const hex = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(await verifyTerraSignature(secret, `t=${t},v1=${hex}`, body + "x")).toBe(false);
  });

  it("rejects a missing/garbage header", async () => {
    expect(await verifyTerraSignature(secret, null, body)).toBe(false);
    expect(await verifyTerraSignature(secret, "nope", body)).toBe(false);
  });
});
