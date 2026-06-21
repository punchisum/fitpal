import { getActivePlan, getRecentCheckins, getRecentWorkouts, getRecentNutrition } from "@/lib/data";
import { Sparkline } from "@/components/Sparkline";
import { daysAgoISO, shortDate } from "@/lib/date";

export default async function ProgressPage() {
  const [active, checkins, workouts, nutrition] = await Promise.all([
    getActivePlan(), getRecentCheckins(60), getRecentWorkouts(60), getRecentNutrition(60),
  ]);

  // Bodyweight series (oldest → newest) from check-ins that recorded weight.
  const weighed = [...checkins].reverse().filter((c) => c.bodyweight_kg != null);
  const weights = weighed.map((c) => Number(c.bodyweight_kg));
  const firstW = weights[0];
  const lastW = weights[weights.length - 1];
  const deltaW = firstW != null && lastW != null ? Number((lastW - firstW).toFixed(1)) : null;

  // Workouts in the last 7 days.
  const weekAgo = daysAgoISO(7);
  const workoutsThisWeek = workouts.filter((w) => w.workout_date >= weekAgo).length;

  // Avg calories over the last 7 days vs target.
  const recentNut = nutrition.filter((n) => n.log_date >= weekAgo);
  const byDay = new Map<string, number>();
  for (const n of recentNut) byDay.set(n.log_date, (byDay.get(n.log_date) ?? 0) + Number(n.calories ?? 0));
  const avgCals = byDay.size ? Math.round([...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size) : null;
  const target = active?.plan.targets.calories;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">Progress</h1>
      <p className="hint mt-1">Trends from your check-ins and logs.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Weight change" value={deltaW != null ? `${deltaW > 0 ? "+" : ""}${deltaW} kg` : "—"} hint={weights.length ? `over ${weights.length} weigh-ins` : "log your weight"} />
        <Stat label="Workouts (7d)" value={`${workoutsThisWeek}`} hint={active ? `target ${active.plan.training.daysPerWeek}/wk` : ""} />
        <Stat label="Avg kcal (7d)" value={avgCals != null ? `${avgCals}` : "—"} hint={target ? `target ${target}` : ""} />
      </div>

      <div className="card mt-4">
        <h2 className="text-sm font-semibold">Bodyweight trend</h2>
        <Sparkline points={weights} />
        {weights.length >= 2 && (
          <p className="hint mt-1">{shortDate(weighed[0].checkin_date)} → {shortDate(weighed[weighed.length - 1].checkin_date)}</p>
        )}
      </div>

      <div className="card mt-4">
        <h2 className="text-sm font-semibold">Recent check-ins</h2>
        {checkins.length === 0 ? (
          <p className="hint mt-2">No check-ins yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 text-sm">
            {checkins.slice(0, 10).map((c) => (
              <li key={c.id} className="flex justify-between py-2">
                <span className="font-medium">{shortDate(c.checkin_date)}</span>
                <span className="text-neutral-500">
                  {c.bodyweight_kg ? `${c.bodyweight_kg} kg · ` : ""}{c.sleep_hours ? `${c.sleep_hours}h sleep · ` : ""}{c.energy ? `energy ${c.energy}/5` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-neutral-600">{label}</div>
      {hint && <div className="hint mt-0.5">{hint}</div>}
    </div>
  );
}
