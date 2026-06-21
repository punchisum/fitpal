#!/usr/bin/env node
// End-to-end onboarding data-path test: replicates exactly what completeOnboarding() writes,
// against the live schema, as a real authenticated user. Catches column/RPC contract drift.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const creds = { email: `flow-${Math.random().toString(36).slice(2, 8)}@fitpal.test`, password: "TestPass12345!" };
let uid, fail = 0;
const ok = (c, m, extra) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (extra ?? "")}`); if (!c) fail++; };

const samplePlan = {
  summary: "test", goal: "lose_fat",
  targets: { calories: 2200, proteinG: 160, carbsG: 200, fatG: 60, calorieFloor: 1500, maintenanceCalories: 2600, dailyAdjustment: -400, weeklyRateKg: -0.36 },
  training: { daysPerWeek: 4, restDays: 3, splitName: "Upper / Lower", days: [] },
  cardio: { sessionsPerWeek: 3, minutesPerSession: 25, type: "Zone-2" },
  notes: ["n"], safetyFlags: [],
};

async function main() {
  const { data: u, error: ce } = await admin.auth.admin.createUser({ ...creds, email_confirm: true });
  if (ce) throw new Error("createUser: " + ce.message);
  uid = u.user.id;

  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: se } = await c.auth.signInWithPassword(creds);
  ok(!se, "user can sign in", se?.message);

  const p = await c.from("profiles").update({ nickname: "Test", sex: "male", birth_year: 1996, height_cm: 178, onboarding_complete: true }).eq("user_id", uid);
  ok(!p.error, "profiles.update (onboarding fields)", p.error?.message);

  const o = await c.from("onboarding_responses").insert({ user_id: uid, payload: { nickname: "Test" } });
  ok(!o.error, "onboarding_responses.insert", o.error?.message);

  const g = await c.from("fitness_goals").insert({ user_id: uid, primary_goal: "lose_fat", start_weight_kg: 80, target_weight_kg: 75, is_active: true });
  ok(!g.error, "fitness_goals.insert", g.error?.message);

  const pr = await c.from("training_preferences").insert({ user_id: uid, experience: "intermediate", days_per_week: 4, preferred_days: ["Mon"], session_minutes: 60, equipment: ["barbell"], cardio_pref: "moderate", diet_pref: "none", activity_level: "moderate" });
  ok(!pr.error, "training_preferences.insert", pr.error?.message);

  const act = await c.rpc("activate_fitness_plan", { p_plan: samplePlan, p_source: "deterministic" });
  ok(!act.error && act.data, "rpc activate_fitness_plan returns a plan id", act.error?.message);

  const au = await c.rpc("append_audit_log", { p_action: "onboarding_complete", p_meta: { goal: "lose_fat" } });
  ok(!au.error, "rpc append_audit_log", au.error?.message);

  // Read back exactly what the dashboard reads.
  const plan = await c.from("fitness_plans").select("id, plan, source").eq("is_active", true).maybeSingle();
  ok(!plan.error && plan.data && plan.data.plan.targets.calories === 2200, "active plan reads back with correct targets", plan.error?.message);

  const prof = await c.from("profiles").select("onboarding_complete, nickname").eq("user_id", uid).maybeSingle();
  ok(prof.data?.onboarding_complete === true && prof.data?.nickname === "Test", "profile marked onboarded");

  // Activate a SECOND plan → only one active (unique partial index + supersede logic).
  await c.rpc("activate_fitness_plan", { p_plan: { ...samplePlan, summary: "v2" }, p_source: "deterministic" });
  const actives = await c.from("fitness_plans").select("id").eq("is_active", true);
  ok((actives.data ?? []).length === 1, "exactly one active plan after re-activation", `got ${(actives.data ?? []).length}`);
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (uid) await admin.auth.admin.deleteUser(uid);
    console.log(fail ? `\n✖ onboarding flow FAILED (${fail})` : "\n✓ onboarding data-path passed — signup→plan→dashboard contract is correct.");
    process.exit(fail ? 1 : 0);
  });
