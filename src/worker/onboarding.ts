// Telegram in-chat onboarding: a small state machine. Each step has a prompt + a forgiving parser.
// Pure (no I/O) so it's easy to test; the webhook stores progress + writes the DB.
import type { PlanInput } from "../../lib/plan/types";

export type Answers = Record<string, unknown>;
type ParseOk = { ok: true; value: unknown };
type ParseErr = { ok: false; error: string };

function intRange(text: string, min: number, max: number): ParseOk | ParseErr {
  const n = parseInt(text.replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(n) || n < min || n > max) return { ok: false, error: `Please reply with a number between ${min} and ${max}.` };
  return { ok: true, value: n };
}
function numRange(text: string, min: number, max: number): ParseOk | ParseErr {
  const n = parseFloat(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < min || n > max) return { ok: false, error: `Please reply with a number between ${min} and ${max}.` };
  return { ok: true, value: n };
}

const STEPS: { key: string; prompt: string; parse: (t: string) => ParseOk | ParseErr }[] = [
  { key: "nickname", prompt: "First — what should I call you?", parse: (t) => {
      const v = t.trim().slice(0, 40);
      return v.length ? { ok: true, value: v } : { ok: false, error: "Tell me a name to call you." };
    } },
  { key: "age", prompt: "How old are you? (just the number)", parse: (t) => intRange(t, 13, 100) },
  { key: "sex", prompt: "Your sex? Reply: male, female, or skip.\n(Used only to estimate your energy needs.)", parse: (t) => {
      const s = t.toLowerCase();
      if (/^m(ale)?$/.test(s.trim()) || s.includes("male") && !s.includes("female")) return { ok: true, value: "male" };
      if (s.includes("female") || /^f$/.test(s.trim())) return { ok: true, value: "female" };
      if (s.includes("other")) return { ok: true, value: "other" };
      if (s.includes("skip") || s.includes("prefer") || s.includes("none")) return { ok: true, value: "prefer_not" };
      return { ok: false, error: "Reply male, female, or skip." };
    } },
  { key: "heightCm", prompt: "Your height in cm? (e.g. 178)", parse: (t) => numRange(t, 80, 260) },
  { key: "weightKg", prompt: "Your current weight in kg? (e.g. 80)", parse: (t) => numRange(t, 25, 400) },
  { key: "goal", prompt: "Your main goal? Reply a number:\n1 Lose fat\n2 Build muscle\n3 Maintain\n4 Recomp (lose fat + build muscle)\n5 General health", parse: (t) => {
      const s = t.toLowerCase();
      const map: Record<string, string> = { "1": "lose_fat", "2": "build_muscle", "3": "maintain", "4": "recomp", "5": "general_health" };
      if (map[s.trim()]) return { ok: true, value: map[s.trim()] };
      if (s.includes("lose") || s.includes("fat") || s.includes("cut")) return { ok: true, value: "lose_fat" };
      if (s.includes("muscle") || s.includes("build") || s.includes("bulk")) return { ok: true, value: "build_muscle" };
      if (s.includes("recomp")) return { ok: true, value: "recomp" };
      if (s.includes("maintain")) return { ok: true, value: "maintain" };
      if (s.includes("health")) return { ok: true, value: "general_health" };
      return { ok: false, error: "Reply 1, 2, 3, 4, or 5." };
    } },
  { key: "experience", prompt: "Training experience?\n1 Beginner (<1 yr)\n2 Intermediate (1-3 yr)\n3 Advanced (3+ yr)", parse: (t) => {
      const s = t.toLowerCase().trim();
      const map: Record<string, string> = { "1": "beginner", "2": "intermediate", "3": "advanced" };
      if (map[s]) return { ok: true, value: map[s] };
      if (s.includes("begin")) return { ok: true, value: "beginner" };
      if (s.includes("inter")) return { ok: true, value: "intermediate" };
      if (s.includes("adv")) return { ok: true, value: "advanced" };
      return { ok: false, error: "Reply 1, 2, or 3." };
    } },
  { key: "daysPerWeek", prompt: "How many days per week can you train? (1-7)\nI always keep at least one rest day.", parse: (t) => intRange(t, 1, 7) },
  { key: "equipment", prompt: "What equipment do you have? List any of:\nbodyweight, dumbbell, barbell, gym, bands, kettlebell — or reply 'none'.", parse: (t) => {
      const s = t.toLowerCase();
      const eq: string[] = [];
      if (s.includes("dumbbell")) eq.push("dumbbell");
      if (s.includes("barbell")) eq.push("barbell");
      if (s.includes("gym") || s.includes("machine")) eq.push("machines");
      if (s.includes("band")) eq.push("bands");
      if (s.includes("kettle")) eq.push("kettlebell");
      if (!eq.length) eq.push("bodyweight");
      return { ok: true, value: eq };
    } },
  { key: "injuries", prompt: "Last one — any injuries or limitations I should train around? (or reply 'none')", parse: (t) => {
      const s = t.trim();
      if (/^(no|none|nope|n\/a|na)$/i.test(s)) return { ok: true, value: "" };
      return { ok: true, value: s.slice(0, 500) };
    } },
];

export const STEP_COUNT = STEPS.length;
export const firstPrompt = () => STEPS[0].prompt;
export const promptForStep = (step: number) => STEPS[step - 1]?.prompt ?? "";

/** Parse the answer for the given 1-based step. */
export function parseStep(step: number, text: string): { ok: true; key: string; value: unknown } | { ok: false; error: string } {
  const def = STEPS[step - 1];
  if (!def) return { ok: false, error: "Unknown step." };
  const r = def.parse(text);
  return r.ok ? { ok: true, key: def.key, value: r.value } : { ok: false, error: r.error };
}

/** Map collected answers to the deterministic planner's input (with sensible defaults). */
export function buildPlanInput(a: Answers): PlanInput {
  return {
    age: Number(a.age),
    sex: (a.sex as PlanInput["sex"]) ?? "prefer_not",
    heightCm: Number(a.heightCm),
    weightKg: Number(a.weightKg),
    goal: a.goal as PlanInput["goal"],
    targetWeightKg: null,
    weeksToTarget: null,
    experience: a.experience as PlanInput["experience"],
    daysPerWeek: Number(a.daysPerWeek),
    preferredDays: [],
    sessionMinutes: 45,
    equipment: (a.equipment as string[]) ?? [],
    injuries: (a.injuries as string) || null,
    cardioPref: "light",
    activityLevel: "moderate",
  };
}
