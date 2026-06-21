"use client";

import { useActionState, useRef } from "react";
import { logNutrition, type LogState } from "@/lib/actions/logs";

export function NutritionForm() {
  const [state, action, pending] = useActionState<LogState, FormData>(logNutrition, {});
  const ref = useRef<HTMLFormElement>(null);
  if (state.ok) ref.current?.reset();
  return (
    <form ref={ref} action={action} className="card flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Log food</h2>
      <input className="input" name="description" placeholder="e.g. Chicken rice bowl" maxLength={200} />
      <div className="grid grid-cols-4 gap-2">
        <div><label className="label">kcal</label><input className="input" name="calories" type="number" min={0} max={20000} /></div>
        <div><label className="label">P (g)</label><input className="input" name="protein_g" type="number" min={0} max={1000} /></div>
        <div><label className="label">C (g)</label><input className="input" name="carbs_g" type="number" min={0} max={2000} /></div>
        <div><label className="label">F (g)</label><input className="input" name="fat_g" type="number" min={0} max={1000} /></div>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Adding…" : "Add food"}</button>
    </form>
  );
}
