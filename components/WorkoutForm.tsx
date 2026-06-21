"use client";

import { useActionState, useRef } from "react";
import { logWorkout, type LogState } from "@/lib/actions/logs";

export function WorkoutForm({ suggestedType }: { suggestedType?: string }) {
  const [state, action, pending] = useActionState<LogState, FormData>(logWorkout, {});
  const ref = useRef<HTMLFormElement>(null);
  if (state.ok) ref.current?.reset();
  return (
    <form ref={ref} action={action} className="card flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Log today&apos;s workout</h2>
      <input className="input" name="type" placeholder="Session type" defaultValue={suggestedType} maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Duration (min)</label><input className="input" name="duration_min" type="number" min={0} max={600} /></div>
        <div><label className="label">Effort (1-10)</label><input className="input" name="perceived_effort" type="number" min={1} max={10} /></div>
      </div>
      <textarea className="input" name="notes" rows={2} maxLength={500} placeholder="What did you do? Sets, weights, how it felt…" />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand-dark">Logged ✓</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Log workout"}</button>
    </form>
  );
}
