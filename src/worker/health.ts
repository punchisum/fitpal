// Parse a health "satellite" payload into normalized metrics.
// Supports the simple Shortcut shape AND the Auto Health Export REST shape.

export type HealthMetrics = { hrv_ms?: number; resting_hr?: number; sleep_hours?: number; metric_date?: string };

function avg(nums: number[]): number | undefined {
  const v = nums.filter((n) => Number.isFinite(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

export function parseHealthPayload(body: unknown): HealthMetrics {
  const out: HealthMetrics = {};
  if (!body || typeof body !== "object") return out;
  const b = body as Record<string, unknown>;

  // Simple Shortcut shape: { hrv_ms, resting_hr, sleep_hours, date }
  const numOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
  out.hrv_ms = numOf(b.hrv_ms) ?? numOf(b.hrv) ?? numOf((b as { heart_rate_variability?: unknown }).heart_rate_variability);
  out.resting_hr = numOf(b.resting_hr) ?? numOf(b.rhr) ?? numOf((b as { resting_heart_rate?: unknown }).resting_heart_rate);
  out.sleep_hours = numOf(b.sleep_hours) ?? numOf(b.sleep) ?? numOf((b as { sleep_analysis?: unknown }).sleep_analysis);
  if (typeof b.date === "string") out.metric_date = b.date.slice(0, 10);

  // Auto Health Export shape: { data: { metrics: [{ name, data:[{date, qty/asleep/totalSleep}] }] } }
  const metrics = (b.data as { metrics?: unknown[] } | undefined)?.metrics ?? (b.metrics as unknown[] | undefined);
  if (Array.isArray(metrics)) {
    for (const m of metrics) {
      const mm = m as { name?: string; data?: Record<string, unknown>[] };
      const name = (mm.name ?? "").toLowerCase();
      const data = Array.isArray(mm.data) ? mm.data : [];
      if (!data.length) continue;
      const lastDate = typeof data[data.length - 1].date === "string" ? (data[data.length - 1].date as string).slice(0, 10) : undefined;
      if (lastDate && !out.metric_date) out.metric_date = lastDate;
      if (name.includes("heart_rate_variability") || name === "hrv") {
        out.hrv_ms = avg(data.map((d) => Number(d.qty ?? d.Avg ?? d.avg)));
      } else if (name.includes("resting_heart_rate")) {
        out.resting_hr = avg(data.map((d) => Number(d.qty ?? d.Avg ?? d.avg)));
      } else if (name.includes("sleep_analysis") || name.includes("sleep")) {
        // AHE sleep can be hours of asleep, or totalSleep, or qty.
        const hrs = data.map((d) => Number(d.asleep ?? d.totalSleep ?? d.total_sleep ?? d.qty ?? d.value));
        const total = hrs.filter((n) => Number.isFinite(n)).reduce((a, b) => a + b, 0);
        if (total > 0) out.sleep_hours = total > 24 ? total / 60 : total; // minutes → hours if huge
      }
    }
  }

  // Clamp to sane ranges; drop nonsense.
  if (out.hrv_ms != null && (out.hrv_ms <= 0 || out.hrv_ms > 500)) delete out.hrv_ms;
  if (out.resting_hr != null && (out.resting_hr < 20 || out.resting_hr > 200)) delete out.resting_hr;
  if (out.sleep_hours != null && (out.sleep_hours < 0 || out.sleep_hours > 24)) delete out.sleep_hours;
  return out;
}
