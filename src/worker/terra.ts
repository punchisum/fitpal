// Terra aggregator: connect-widget URL + webhook parsing + signature verification.
// Lets users connect cloud wearables (Oura / Whoop / Garmin / Fitbit / Google / Withings…) with one tap,
// no app. Field paths per Terra docs: heart_rate_data.summary.avg_hrv_rmssd / resting_hr_bpm,
// sleep_durations_data.asleep.duration_asleep_state_seconds.

export type TerraMetric = { hrv_ms?: number; resting_hr?: number; sleep_hours?: number; metric_date?: string };
export type TerraParse = { referenceId?: string; type?: string; metrics: TerraMetric[] };

const enc = (s: string) => new TextEncoder().encode(s);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export const TERRA_PROVIDERS = "OURA,WHOOP,GARMIN,FITBIT,GOOGLE,WITHINGS,POLAR,SUUNTO,SAMSUNG";

/** Generate a Connect widget session; returns the URL to send the user, or null if unconfigured/failed. */
export async function terraWidgetUrl(devId: string, apiKey: string, referenceId: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.tryterra.co/v2/auth/generateWidgetSession", {
      method: "POST",
      headers: { "dev-id": devId, "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ reference_id: referenceId, providers: TERRA_PROVIDERS, language: "en" }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { url?: string };
    return j.url ?? null;
  } catch {
    return null;
  }
}

/** Verify the `terra-signature: t=<ts>,v1=<hex>` header over `<ts>.<rawBody>` with HMAC-SHA256. */
export async function verifyTerraSignature(secret: string, header: string | null, rawBody: string): Promise<boolean> {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const p of header.split(",")) { const [k, v] = p.split("="); if (k && v) parts[k.trim()] = v.trim(); }
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc(`${t}.${rawBody}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time compare
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

/** Pull HRV / resting HR / sleep out of a Terra webhook payload (sleep or daily). */
export function parseTerraPayload(body: unknown): TerraParse {
  const b = (body ?? {}) as Record<string, unknown>;
  const user = (b.user ?? {}) as Record<string, unknown>;
  const referenceId = typeof user.reference_id === "string" ? user.reference_id : undefined;
  const type = typeof b.type === "string" ? b.type : undefined;
  const records = Array.isArray(b.data) ? (b.data as Record<string, unknown>[]) : [];
  const metrics: TerraMetric[] = [];

  for (const rec of records) {
    const hr = (rec.heart_rate_data as { summary?: Record<string, unknown> } | undefined)?.summary ?? {};
    const hrv = num(hr.avg_hrv_rmssd) ?? num(hr.avg_hrv_sdnn);
    const rhr = num(hr.resting_hr_bpm);
    const asleep = (rec.sleep_durations_data as { asleep?: Record<string, unknown> } | undefined)?.asleep;
    const sleepSec = num(asleep?.duration_asleep_state_seconds);
    const sleep_hours = sleepSec != null ? Number((sleepSec / 3600).toFixed(2)) : undefined;
    const meta = (rec.metadata ?? {}) as Record<string, unknown>;
    const ts = typeof meta.end_time === "string" ? meta.end_time : typeof meta.start_time === "string" ? meta.start_time : undefined;
    const metric_date = ts ? ts.slice(0, 10) : undefined;

    const m: TerraMetric = {};
    if (hrv != null && hrv > 0 && hrv <= 500) m.hrv_ms = Math.round(hrv);
    if (rhr != null && rhr >= 20 && rhr <= 200) m.resting_hr = Math.round(rhr);
    if (sleep_hours != null && sleep_hours > 0 && sleep_hours <= 24) m.sleep_hours = sleep_hours;
    if (metric_date) m.metric_date = metric_date;
    if (m.hrv_ms != null || m.resting_hr != null || m.sleep_hours != null) metrics.push(m);
  }
  return { referenceId, type, metrics };
}
