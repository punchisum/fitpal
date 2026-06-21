"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "@/lib/actions/onboarding";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EQUIPMENT = [
  { v: "bodyweight", l: "Bodyweight only" },
  { v: "dumbbell", l: "Dumbbells" },
  { v: "barbell", l: "Barbell" },
  { v: "machines", l: "Gym machines" },
  { v: "bands", l: "Resistance bands" },
  { v: "kettlebell", l: "Kettlebell" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card">
      <legend className="px-1 text-sm font-semibold text-neutral-800">{title}</legend>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});

  return (
    <form action={action} className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8">
      <header>
        <h1 className="text-2xl font-bold">Let&apos;s build your plan</h1>
        <p className="hint mt-1">A few questions. Your answers stay private to you. This takes ~2 minutes.</p>
      </header>

      <Section title="About you">
        <div><label className="label">What should we call you?</label><input className="input" name="nickname" required maxLength={40} /></div>
        <div><label className="label">Age</label><input className="input" name="age" type="number" min={13} max={100} required /></div>
        <div>
          <label className="label">Sex (optional)</label>
          <select className="input" name="sex" defaultValue="prefer_not">
            <option value="prefer_not">Prefer not to say</option>
            <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
          </select>
          <p className="hint mt-1">Used only to estimate your energy needs.</p>
        </div>
        <div><label className="label">Height (cm)</label><input className="input" name="heightCm" type="number" min={80} max={260} step="0.1" required /></div>
        <div><label className="label">Current weight (kg)</label><input className="input" name="weightKg" type="number" min={25} max={400} step="0.1" required /></div>
        <div>
          <label className="label">Daily activity (outside training)</label>
          <select className="input" name="activityLevel" defaultValue="moderate">
            <option value="sedentary">Sedentary (desk job)</option>
            <option value="light">Lightly active</option>
            <option value="moderate">Moderately active</option>
            <option value="active">Active</option>
            <option value="very_active">Very active</option>
          </select>
        </div>
      </Section>

      <Section title="Your goal">
        <div>
          <label className="label">Primary goal</label>
          <select className="input" name="primaryGoal" required defaultValue="general_health">
            <option value="lose_fat">Lose fat</option>
            <option value="build_muscle">Build muscle</option>
            <option value="maintain">Maintain</option>
            <option value="recomp">Recomposition (lose fat + build muscle)</option>
            <option value="general_health">General health</option>
          </select>
        </div>
        <div><label className="label">Target weight (kg, optional)</label><input className="input" name="targetWeightKg" type="number" min={25} max={400} step="0.1" /></div>
        <div><label className="label">Target date (optional)</label><input className="input" name="targetDate" type="date" /></div>
      </Section>

      <Section title="Training">
        <div>
          <label className="label">Experience</label>
          <select className="input" name="experience" required defaultValue="beginner">
            <option value="beginner">Beginner (&lt;1 yr)</option>
            <option value="intermediate">Intermediate (1-3 yr)</option>
            <option value="advanced">Advanced (3+ yr)</option>
          </select>
        </div>
        <div>
          <label className="label">Days per week</label>
          <select className="input" name="daysPerWeek" required defaultValue="3">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <p className="hint mt-1">Fitpal always keeps at least one rest day.</p>
        </div>
        <div>
          <label className="label">Session length (min)</label>
          <select className="input" name="sessionMinutes" defaultValue="45">
            {[20, 30, 45, 60, 75, 90].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cardio preference</label>
          <select className="input" name="cardioPref" defaultValue="light">
            <option value="none">None</option><option value="light">A little</option>
            <option value="moderate">Moderate</option><option value="lots">Lots</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Preferred training days (optional)</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
                <input type="checkbox" name="preferredDays" value={d} /> {d}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Equipment access</label>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((e) => (
              <label key={e.v} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
                <input type="checkbox" name="equipment" value={e.v} /> {e.l}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Health & lifestyle">
        <div><label className="label">Average sleep (hours/night)</label><input className="input" name="sleepHoursAvg" type="number" min={0} max={24} step="0.5" /></div>
        <div>
          <label className="label">Diet preference</label>
          <select className="input" name="dietPref" defaultValue="none">
            <option value="none">No preference</option><option value="vegetarian">Vegetarian</option>
            <option value="vegan">Vegan</option><option value="pescatarian">Pescatarian</option>
            <option value="halal">Halal</option><option value="kosher">Kosher</option><option value="other">Other</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Injuries or limitations (optional)</label>
          <textarea className="input" name="injuries" rows={2} maxLength={500} placeholder="e.g. left knee pain, lower-back issues" />
          <p className="hint mt-1">Fitpal will train around these and suggest seeing a professional if needed. Not a substitute for medical advice.</p>
        </div>
      </Section>

      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}

      <button className="btn-primary py-3 text-base" type="submit" disabled={pending}>
        {pending ? "Building your plan…" : "Generate my plan →"}
      </button>
      <p className="hint text-center">Fitpal gives general fitness guidance, not medical advice.</p>
    </form>
  );
}
