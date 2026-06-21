import { getActivePlan, getRecentWorkouts } from "@/lib/data";
import { TrainingCard } from "@/components/PlanView";
import { WorkoutForm } from "@/components/WorkoutForm";
import { shortDate } from "@/lib/date";

export default async function WorkoutPage() {
  const [active, workouts] = await Promise.all([getActivePlan(), getRecentWorkouts(15)]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">Workout</h1>
      <p className="hint mt-1">Your split, and a place to log each session.</p>

      <div className="mt-6 space-y-6">
        {active ? <TrainingCard plan={active.plan} /> : <div className="card"><p className="hint">No plan yet.</p></div>}

        <WorkoutForm suggestedType={active?.plan.training.days[0]?.focus} />

        <div>
          <h2 className="mb-2 text-sm font-semibold">Recent sessions</h2>
          {workouts.length === 0 ? (
            <p className="hint">No workouts logged yet. Your first one shows up here.</p>
          ) : (
            <ul className="space-y-2">
              {workouts.map((w) => (
                <li key={w.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm">
                  <span className="font-medium">{shortDate(w.workout_date)} · {w.type ?? "Session"}</span>
                  <span className="text-neutral-500">{w.duration_min ? `${w.duration_min} min` : ""}{w.perceived_effort ? ` · RPE ${w.perceived_effort}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
