import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/coach/data";
import { Sparkline } from "@/components/Sparkline";

export const dynamic = "force-dynamic";

const BAND: Record<string, { emoji: string; cls: string }> = {
  green: { emoji: "🟢", cls: "text-emerald-700 bg-emerald-50" },
  amber: { emoji: "🟡", cls: "text-amber-700 bg-amber-50" },
  red: { emoji: "🔴", cls: "text-red-700 bg-red-50" },
  unknown: { emoji: "⚪", cls: "text-neutral-600 bg-neutral-100" },
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-neutral-800">{value}</div>
    </div>
  );
}

export default async function CoachUserDetail({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const d = await getUserDetail(userId);
  if (!d) notFound();

  const { profile, goal, plan, planSource, readiness, weights, days, checkins, workouts, feedback, link } = d;
  const age = profile.birth_year ? new Date().getUTCFullYear() - profile.birth_year : null;
  const band = BAND[readiness?.band ?? "unknown"];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach" className="text-xs text-neutral-500 hover:text-neutral-800">← All users</Link>
        <h1 className="mt-1 text-xl font-bold">{profile.nickname ?? "Unnamed user"}</h1>
        <p className="text-sm text-neutral-500">
          {[profile.sex, age ? `${age}y` : null, profile.height_cm ? `${profile.height_cm}cm` : null, link ? "Telegram linked" : "no telegram"]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/* Readiness + goal */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`rounded-xl px-4 py-3 ${band.cls}`}>
          <div className="text-sm font-semibold">{band.emoji} Readiness {readiness ? `(${readiness.band})` : "— no data today"}</div>
          {readiness && <p className="mt-1 text-sm">{readiness.reason}</p>}
          {readiness && <p className="mt-1 text-sm font-medium">{readiness.directive}</p>}
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <div className="text-sm font-semibold">🎯 Goal</div>
          <p className="mt-1 text-sm capitalize text-neutral-600">
            {goal?.primary_goal?.replace(/_/g, " ") ?? "—"}
            {goal?.start_weight_kg ? ` · from ${goal.start_weight_kg}kg` : ""}
            {goal?.target_weight_kg ? ` → ${goal.target_weight_kg}kg` : ""}
            {goal?.target_date ? ` by ${goal.target_date}` : ""}
          </p>
        </div>
      </div>

      {/* Plan targets */}
      {plan && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">📋 Active plan</div>
            <span className="text-[11px] text-neutral-400">{planSource}</span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">{plan.summary}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Calories" value={`${plan.targets.calories} kcal`} />
            <Stat label="Protein" value={`${plan.targets.proteinG} g`} />
            <Stat label="Training" value={`${plan.training.splitName} ${plan.training.daysPerWeek}×`} />
            <Stat label="Weekly rate" value={`${plan.targets.weeklyRateKg ?? 0} kg`} />
          </div>
        </div>
      )}

      {/* Weight trend */}
      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
        <div className="text-sm font-semibold">⚖️ Weight ({weights.length} weigh-ins)</div>
        {weights.length >= 2 ? (
          <>
            <Sparkline points={weights} />
            <p className="mt-1 text-xs text-neutral-500">{weights[0]}kg → {weights[weights.length - 1]}kg</p>
          </>
        ) : (
          <p className="hint mt-1">Not enough weigh-ins yet.</p>
        )}
      </div>

      {/* Food timeline */}
      <div>
        <h2 className="mb-2 text-sm font-bold">🍽️ Food log (14 days)</h2>
        {days.length === 0 ? (
          <p className="hint">No food logged in the last 14 days.</p>
        ) : (
          <div className="space-y-3">
            {days.map(([date, e]) => (
              <div key={date} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{date}</span>
                  <span className="text-xs text-neutral-500">
                    {Math.round(e.calories)} kcal · {Math.round(e.protein)}g protein · {e.items.length} item{e.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {e.items.map((it) => (
                    <li key={it.id} className="flex justify-between text-sm text-neutral-600">
                      <span>{it.description ?? "—"} <span className="text-[10px] text-neutral-400">({it.source})</span></span>
                      <span className="tabular-nums text-neutral-500">{Math.round(Number(it.calories ?? 0))} kcal</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Check-ins */}
      <div>
        <h2 className="mb-2 text-sm font-bold">📅 Recent check-ins</h2>
        {checkins.length === 0 ? (
          <p className="hint">No check-ins yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Weight</th><th className="px-3 py-2">Sleep</th><th className="px-3 py-2">Energy</th><th className="px-3 py-2">Soreness</th></tr>
              </thead>
              <tbody>
                {checkins.slice(0, 14).map((c) => (
                  <tr key={c.id} className="border-t border-neutral-100">
                    <td className="px-3 py-1.5">{c.checkin_date}</td>
                    <td className="px-3 py-1.5">{c.bodyweight_kg ? `${c.bodyweight_kg}kg` : "—"}</td>
                    <td className="px-3 py-1.5">{c.sleep_hours ? `${c.sleep_hours}h` : "—"}</td>
                    <td className="px-3 py-1.5">{c.energy ?? "—"}</td>
                    <td className="px-3 py-1.5">{c.soreness ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Workouts + feedback */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <div className="text-sm font-semibold">🏋️ Recent workouts</div>
          {workouts.length === 0 ? (
            <p className="hint mt-1">None logged.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-neutral-600">
              {workouts.map((w) => (
                <li key={w.id} className="flex justify-between">
                  <span>{w.workout_date} · {w.type ?? "session"}</span>
                  <span className="text-neutral-500">{w.duration_min ? `${w.duration_min}min` : ""} {w.completed ? "✓" : "skipped"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <div className="text-sm font-semibold">💬 Feedback</div>
          {feedback.length === 0 ? (
            <p className="hint mt-1">No feedback submitted.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-neutral-600">
              {feedback.map((f, i) => (
                <li key={i} className="border-l-2 border-emerald-300 pl-2">
                  <span>{f.message}</span>
                  <div className="text-[10px] text-neutral-400">{new Date(f.created_at).toISOString().slice(0, 10)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
