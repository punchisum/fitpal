import { getActivePlan, getTodayCheckin, getTodayNutrition } from "@/lib/data";
import { CheckinForm } from "@/components/CheckinForm";
import { NutritionForm } from "@/components/NutritionForm";

export default async function TodayPage() {
  const [active, checkin, nutrition] = await Promise.all([getActivePlan(), getTodayCheckin(), getTodayNutrition()]);
  const target = active?.plan.targets;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold">Today</h1>
      <p className="hint mt-1">Check in, log your food, stay on track.</p>

      {target && (
        <div className="card mt-6">
          <h2 className="text-sm font-semibold">Eaten vs target</h2>
          <div className="mt-3 space-y-3">
            <Bar label="Calories" value={Math.round(nutrition.sum.calories)} target={target.calories} unit="kcal" />
            <Bar label="Protein" value={Math.round(nutrition.sum.protein)} target={target.proteinG} unit="g" />
          </div>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <CheckinForm existing={checkin} />

        <div>
          <NutritionForm />
          {nutrition.rows.length > 0 && (
            <ul className="mt-3 space-y-2">
              {nutrition.rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm">
                  <span>{r.description ?? "Food"}</span>
                  <span className="text-neutral-500">{Math.round(Number(r.calories ?? 0))} kcal · {Math.round(Number(r.protein_g ?? 0))} g P</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = Math.min(100, target > 0 ? Math.round((value / target) * 100) : 0);
  const over = value > target;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-neutral-500">{value} / {target} {unit}</span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${over ? "bg-amber-400" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
