import Link from "next/link";
import { getProfile, getActivePlan, getActiveGoal, getTodayCheckin, getTodayNutrition } from "@/lib/data";
import { TargetsCard } from "@/components/PlanView";

export default async function DashboardPage() {
  const [profile, active, goal, checkin, nutrition] = await Promise.all([
    getProfile(), getActivePlan(), getActiveGoal(), getTodayCheckin(), getTodayNutrition(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">Hi {profile?.nickname ?? "there"} 👋</h1>
      <p className="hint mt-1">Here&apos;s your day at a glance.</p>

      {!active ? (
        <div className="card mt-6 text-center">
          <p className="text-sm text-neutral-600">You don&apos;t have an active plan yet.</p>
          <Link href="/onboarding" className="btn-primary mt-3">Build my plan</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="card">
            <p className="text-sm text-neutral-600">{active.plan.summary}</p>
          </div>

          <TargetsCard plan={active.plan} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/today" className="card transition-colors hover:bg-neutral-50">
              <div className="text-sm font-semibold">📅 Today&apos;s check-in</div>
              <p className="hint mt-1">{checkin ? "Logged ✓" : "Not logged yet — tap to add"}</p>
              <p className="mt-2 text-sm text-neutral-700">
                Eaten today: {Math.round(nutrition.sum.calories)} / {active.plan.targets.calories} kcal · {Math.round(nutrition.sum.protein)} / {active.plan.targets.proteinG} g protein
              </p>
            </Link>
            <Link href="/workout" className="card transition-colors hover:bg-neutral-50">
              <div className="text-sm font-semibold">🏋️ Workout</div>
              <p className="hint mt-1">{active.plan.training.splitName}</p>
              <p className="mt-2 text-sm text-neutral-700">Log today&apos;s session →</p>
            </Link>
          </div>

          {goal && (
            <div className="card">
              <div className="text-sm font-semibold">🎯 Goal</div>
              <p className="hint mt-1">
                {goal.primary_goal.replace("_", " ")}
                {goal.target_weight_kg ? ` → ${goal.target_weight_kg} kg` : ""}
                {goal.target_date ? ` by ${goal.target_date}` : ""}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Link href="/progress" className="btn-ghost flex-1">📈 Progress</Link>
            <Link href="/chat" className="btn-ghost flex-1">💬 Ask your coach</Link>
          </div>
        </div>
      )}
    </div>
  );
}
