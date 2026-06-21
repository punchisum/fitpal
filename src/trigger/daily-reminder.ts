import { schedules, logger } from "@trigger.dev/sdk/v3";
import { linkedUsers, sbGet, sbRpc, tgSend, todayUTC, daysAgoUTC } from "./_shared";
import { computeReadiness } from "../../lib/recovery";

type FP = { targets?: { calories: number; proteinG: number }; training?: { splitName: string; daysPerWeek: number } };

// Morning briefing: one proactive message/day per linked user — recovery readiness + nutrition nudge.
// Idempotent: increment_usage_for(reminder:<date>, limit 1) guarantees at most one send/day.
export const dailyReminder = schedules.task({
  id: "daily-reminder",
  cron: "0 23 * * *", // 23:00 UTC ≈ 7am UTC+8 (morning)
  maxDuration: 300,
  run: async () => {
    const users = await linkedUsers();
    const today = todayUTC();
    let sent = 0;

    for (const u of users) {
      const allowed = await sbRpc<boolean>("increment_usage_for", { p_user_id: u.user_id, p_window_key: `reminder:${today}`, p_limit: 1 });
      if (allowed === false) continue;

      const [prof, planRows, ck, hm, base, nut] = await Promise.all([
        sbGet<{ nickname?: string }>(`profiles?user_id=eq.${u.user_id}&select=nickname`),
        sbGet<{ plan: FP }>(`fitness_plans?user_id=eq.${u.user_id}&is_active=eq.true&select=plan`),
        sbGet<{ sleep_hours?: number; energy?: number; soreness?: number }>(`daily_checkins?user_id=eq.${u.user_id}&checkin_date=eq.${today}&select=sleep_hours,energy,soreness`),
        sbGet<{ hrv_ms?: number; resting_hr?: number; sleep_hours?: number }>(`health_metrics?user_id=eq.${u.user_id}&metric_date=eq.${today}&select=hrv_ms,resting_hr,sleep_hours`),
        sbGet<{ hrv_ms?: number; resting_hr?: number }>(`health_metrics?user_id=eq.${u.user_id}&metric_date=gte.${daysAgoUTC(7)}&select=hrv_ms,resting_hr`),
        sbGet<{ protein_g?: number }>(`nutrition_logs?user_id=eq.${u.user_id}&log_date=eq.${today}&select=protein_g`),
      ]);
      const name = prof[0]?.nickname ?? "there";
      const p = planRows[0]?.plan;
      const c = ck[0], h = hm[0];
      const avg = (xs: (number | undefined)[]) => { const v = xs.filter((n): n is number => typeof n === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

      const lines = [`☀️ Morning, ${name}!`];
      if (c || h) {
        const v = computeReadiness({
          sleepHours: h?.sleep_hours ?? c?.sleep_hours ?? null, energy: c?.energy ?? null, soreness: c?.soreness ?? null,
          hrvMs: h?.hrv_ms ?? null, restingHr: h?.resting_hr ?? null,
          hrvBaseline: avg(base.map((b) => b.hrv_ms)), rhrBaseline: avg(base.map((b) => b.resting_hr)),
        });
        if (v.band !== "unknown") lines.push(`🧭 ${v.reason}`, v.directive);
      } else {
        lines.push("How'd you sleep? Run /checkin and I'll call your readiness for today.");
      }
      if (p?.training) lines.push(`Today: ${p.training.splitName} (${p.training.daysPerWeek}×/wk).`);
      if (p?.targets) {
        const prot = nut.reduce((a, r) => a + Number(r.protein_g ?? 0), 0);
        lines.push(`Protein target ${p.targets.proteinG}g${prot > 0 ? ` (${Math.round(prot)} so far)` : ""} — hit it. Snap your meals 📸`);
      }
      await tgSend(u.telegram_chat_id, lines.join("\n"));
      sent++;
    }
    logger.log("morning-briefing done", { audience: users.length, sent });
    return { audience: users.length, sent };
  },
});
