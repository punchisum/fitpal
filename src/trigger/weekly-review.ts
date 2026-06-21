import { schedules, logger } from "@trigger.dev/sdk/v3";
import { linkedUsers, sbGet, sbInsert, sbRpc, tgSend, daysAgoUTC } from "./_shared";

// Weekly review: per linked user, summarise the past 7 days (workouts + weight trend), send it,
// and store it as an agent_message. Read-only on user data except the summary message it writes.
export const weeklyReview = schedules.task({
  id: "weekly-review",
  cron: "0 18 * * 1", // Mondays 18:00 UTC
  maxDuration: 300,
  run: async () => {
    const users = await linkedUsers();
    const weekAgo = daysAgoUTC(7);
    let sent = 0;

    for (const u of users) {
      const allowed = await sbRpc<boolean>("increment_usage_for", { p_user_id: u.user_id, p_window_key: `weekly:${weekAgo}`, p_limit: 1 });
      if (allowed === false) continue; // already reviewed this week

      const workouts = await sbGet<{ workout_date: string }>(`workout_logs?user_id=eq.${u.user_id}&workout_date=gte.${weekAgo}&select=workout_date`);
      const weights = await sbGet<{ bodyweight_kg: number; checkin_date: string }>(`daily_checkins?user_id=eq.${u.user_id}&bodyweight_kg=not.is.null&select=bodyweight_kg,checkin_date&order=checkin_date.asc&limit=60`);
      const recent = weights.filter((w) => w.checkin_date >= daysAgoUTC(14));
      const first = recent[0]?.bodyweight_kg;
      const last = recent[recent.length - 1]?.bodyweight_kg;
      const delta = first != null && last != null ? Number((last - first).toFixed(1)) : null;

      const lines = [
        "📊 Your week in review:",
        `• Workouts logged: ${workouts.length}`,
        delta != null ? `• Bodyweight change (2 wks): ${delta > 0 ? "+" : ""}${delta} kg` : "• Log your weight a couple times to see the trend.",
        "",
        workouts.length >= 3 ? "Strong consistency 💪 Keep the streak going." : "Aim for a couple more sessions next week — consistency beats intensity.",
      ];
      const text = lines.join("\n");

      await sbInsert("agent_messages", { user_id: u.user_id, role: "assistant", channel: "telegram", content: text, grounding: { weekly_review: true } });
      await tgSend(u.telegram_chat_id, text);
      sent++;
    }
    logger.log("weekly-review done", { audience: users.length, sent });
    return { audience: users.length, sent };
  },
});
