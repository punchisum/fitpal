import { schedules, logger } from "@trigger.dev/sdk/v3";
import { linkedUsers, sbGet, sbRpc, tgSend, todayUTC } from "./_shared";

// Daily check-in nudge: for each linked user with no check-in today, send one reminder.
// Idempotent: increment_usage_for with a per-day key + limit 1 guarantees at most one send/day.
export const dailyReminder = schedules.task({
  id: "daily-reminder",
  cron: "0 17 * * *", // 17:00 UTC daily
  maxDuration: 300,
  run: async () => {
    const users = await linkedUsers();
    let sent = 0;
    for (const u of users) {
      const today = todayUTC();
      const checkins = await sbGet(`daily_checkins?user_id=eq.${u.user_id}&checkin_date=eq.${today}&select=id`);
      if (checkins.length > 0) continue; // already checked in

      const allowed = await sbRpc<boolean>("increment_usage_for", { p_user_id: u.user_id, p_window_key: `reminder:${today}`, p_limit: 1 });
      if (allowed === false) continue; // already reminded today

      await tgSend(u.telegram_chat_id, "👋 Quick check-in? Reply /weight 80.5 to log today's bodyweight, or just tell me how training and food went. Small daily logs = big progress.");
      sent++;
    }
    logger.log("daily-reminder done", { audience: users.length, sent });
    return { audience: users.length, sent };
  },
});
