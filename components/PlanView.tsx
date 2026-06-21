import type { FitnessPlan } from "@/lib/plan";

export function TargetsCard({ plan }: { plan: FitnessPlan }) {
  const t = plan.targets;
  const items = [
    { label: "Calories", value: `${t.calories}`, unit: "kcal" },
    { label: "Protein", value: `${t.proteinG}`, unit: "g" },
    { label: "Carbs", value: `${t.carbsG}`, unit: "g" },
    { label: "Fat", value: `${t.fatG}`, unit: "g" },
  ];
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-neutral-800">Daily targets</h2>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl bg-neutral-50 py-3">
            <div className="text-lg font-bold text-neutral-900">{i.value}</div>
            <div className="text-[11px] text-neutral-500">{i.unit}</div>
            <div className="mt-0.5 text-[11px] font-medium text-neutral-600">{i.label}</div>
          </div>
        ))}
      </div>
      <p className="hint mt-3">
        Maintenance ≈ {t.maintenanceCalories} kcal · {t.dailyAdjustment === 0 ? "maintenance" : t.dailyAdjustment < 0 ? `${t.dailyAdjustment} kcal deficit` : `+${t.dailyAdjustment} kcal surplus`} ·
        target ~{t.weeklyRateKg} kg/week
      </p>
    </div>
  );
}

export function TrainingCard({ plan }: { plan: FitnessPlan }) {
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-neutral-800">{plan.training.splitName} · {plan.training.daysPerWeek}×/week</h2>
      <div className="mt-3 space-y-3">
        {plan.training.days.map((d, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{d.day} · {d.focus}</span>
            </div>
            <ul className="mt-1.5 list-inside list-disc text-sm text-neutral-600">
              {d.exercises.map((e, j) => <li key={j}>{e}</li>)}
            </ul>
          </div>
        ))}
        <p className="hint">{plan.training.restDays} rest day(s). {plan.cardio.sessionsPerWeek > 0 ? `Cardio: ${plan.cardio.sessionsPerWeek}× ${plan.cardio.minutesPerSession} min — ${plan.cardio.type}.` : "No structured cardio."}</p>
      </div>
    </div>
  );
}

export function NotesCard({ plan }: { plan: FitnessPlan }) {
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-neutral-800">Why this plan</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-neutral-700">
        {plan.notes.map((n, i) => <li key={i} className="flex gap-2"><span>•</span><span>{n}</span></li>)}
      </ul>
      {plan.safetyFlags.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          ⚠️ Fitpal gives general fitness guidance, not medical advice. For injuries, illness, or eating concerns, please talk to a qualified professional.
        </p>
      )}
    </div>
  );
}
