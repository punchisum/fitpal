import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Downloads everything Fitpal holds about the logged-in user (RLS-scoped to them).
const TABLES = [
  "profiles", "onboarding_responses", "fitness_goals", "training_preferences",
  "fitness_plans", "daily_checkins", "workout_logs", "nutrition_logs",
  "agent_messages", "plan_adjustment_proposals", "telegram_identities", "audit_logs",
] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id: user.id };
  for (const t of TABLES) {
    const { data } = await supabase.from(t).select("*");
    out[t] = data ?? [];
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="fitpal-export.json"`,
    },
  });
}
