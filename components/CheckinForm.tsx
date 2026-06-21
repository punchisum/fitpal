"use client";

import { useActionState } from "react";
import { saveCheckin, type LogState } from "@/lib/actions/logs";

type Existing = { sleep_hours?: number | null; energy?: number | null; soreness?: number | null; mood?: number | null; bodyweight_kg?: number | null; notes?: string | null } | null;

export function CheckinForm({ existing }: { existing: Existing }) {
  const [state, action, pending] = useActionState<LogState, FormData>(saveCheckin, {});
  return (
    <form action={action} className="card flex flex-col gap-4">
      <h2 className="text-sm font-semibold">How are you today?</h2>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Sleep (h)</label><input className="input" name="sleep_hours" type="number" step="0.5" min={0} max={24} defaultValue={existing?.sleep_hours ?? ""} /></div>
        <div><label className="label">Bodyweight (kg)</label><input className="input" name="bodyweight_kg" type="number" step="0.1" min={25} max={400} defaultValue={existing?.bodyweight_kg ?? ""} /></div>
        <div><label className="label">Energy (1-5)</label><input className="input" name="energy" type="number" min={1} max={5} defaultValue={existing?.energy ?? ""} /></div>
        <div><label className="label">Soreness (1-5)</label><input className="input" name="soreness" type="number" min={1} max={5} defaultValue={existing?.soreness ?? ""} /></div>
        <div><label className="label">Mood (1-5)</label><input className="input" name="mood" type="number" min={1} max={5} defaultValue={existing?.mood ?? ""} /></div>
      </div>
      <div><label className="label">Notes</label><textarea className="input" name="notes" rows={2} maxLength={500} defaultValue={existing?.notes ?? ""} /></div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand-dark">Saved ✓</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : existing ? "Update check-in" : "Save check-in"}</button>
    </form>
  );
}
