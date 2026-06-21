// Training split generation — picks a sensible split by days/week, enforces a rest day,
// and selects exercises from available equipment.
import type { PlanInput, TrainingPlan, TrainingDay } from "./types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Pool = { compound: string[]; accessory: string[] };

function exercisePool(equipment: string[]): Record<string, Pool> {
  const has = (e: string) => equipment.includes(e);
  const barbell = has("barbell");
  const dumbbell = has("dumbbell") || has("dumbbells");
  const machines = has("machines") || has("gym");
  const bodyweightOnly = !barbell && !dumbbell && !machines;

  if (bodyweightOnly) {
    return {
      upper: { compound: ["Push-ups", "Pike push-ups", "Inverted rows / door rows"], accessory: ["Tricep dips", "Plank shoulder taps"] },
      lower: { compound: ["Bodyweight squats", "Walking lunges", "Glute bridges"], accessory: ["Calf raises", "Wall sit"] },
      push: { compound: ["Push-ups", "Pike push-ups"], accessory: ["Tricep dips", "Plank"] },
      pull: { compound: ["Inverted rows", "Superman holds"], accessory: ["Reverse snow angels", "Hollow hold"] },
      legs: { compound: ["Bodyweight squats", "Lunges", "Glute bridges"], accessory: ["Calf raises", "Side lunges"] },
      full: { compound: ["Bodyweight squats", "Push-ups", "Inverted rows"], accessory: ["Glute bridges", "Plank"] },
    };
  }
  const press = barbell ? "Barbell bench press" : dumbbell ? "Dumbbell bench press" : "Machine chest press";
  const row = barbell ? "Barbell row" : dumbbell ? "Dumbbell row" : "Seated cable row";
  const squat = barbell ? "Barbell back squat" : dumbbell ? "Goblet squat" : "Leg press";
  const hinge = barbell ? "Romanian deadlift" : dumbbell ? "Dumbbell RDL" : "Hamstring curl";
  const ohp = barbell ? "Overhead press" : dumbbell ? "Dumbbell shoulder press" : "Machine shoulder press";
  const pulldown = machines ? "Lat pulldown" : dumbbell ? "Dumbbell pullover" : "Inverted rows";
  return {
    upper: { compound: [press, row, ohp], accessory: ["Lateral raises", "Bicep curls", "Tricep extensions"] },
    lower: { compound: [squat, hinge], accessory: ["Leg extensions", "Calf raises", "Hanging leg raises"] },
    push: { compound: [press, ohp], accessory: ["Lateral raises", "Tricep extensions"] },
    pull: { compound: [row, pulldown], accessory: ["Face pulls", "Bicep curls"] },
    legs: { compound: [squat, hinge], accessory: ["Leg extensions", "Calf raises"] },
    full: { compound: [squat, press, row], accessory: ["Lateral raises", "Plank"] },
  };
}

function makeDay(name: string, focus: string, pool: Record<string, Pool>, key: string): TrainingDay {
  const p = pool[key];
  return { day: name, focus, exercises: [...p.compound, ...p.accessory] };
}

/** Returns the split blueprint (focus keys) for a given trainable day count. */
function blueprint(days: number): { name: string; seq: { focus: string; key: string }[] } {
  switch (days) {
    case 1:
    case 2:
      return { name: "Full body", seq: Array.from({ length: days }, () => ({ focus: "Full body", key: "full" })) };
    case 3:
      return { name: "Full body 3×", seq: [
        { focus: "Full body A", key: "full" }, { focus: "Full body B", key: "upper" }, { focus: "Full body C", key: "lower" }] };
    case 4:
      return { name: "Upper / Lower", seq: [
        { focus: "Upper body", key: "upper" }, { focus: "Lower body", key: "lower" },
        { focus: "Upper body", key: "upper" }, { focus: "Lower body", key: "lower" }] };
    case 5:
      return { name: "Push / Pull / Legs + UL", seq: [
        { focus: "Push", key: "push" }, { focus: "Pull", key: "pull" }, { focus: "Legs", key: "legs" },
        { focus: "Upper body", key: "upper" }, { focus: "Lower body", key: "lower" }] };
    default: // 6
      return { name: "Push / Pull / Legs 2×", seq: [
        { focus: "Push", key: "push" }, { focus: "Pull", key: "pull" }, { focus: "Legs", key: "legs" },
        { focus: "Push", key: "push" }, { focus: "Pull", key: "pull" }, { focus: "Legs", key: "legs" }] };
  }
}

export function buildTraining(input: PlanInput): TrainingPlan {
  // Safety: cap at 6 training days so there is always ≥1 rest day.
  const trainDays = Math.min(Math.max(input.daysPerWeek, 1), 6);
  const pool = exercisePool(input.equipment ?? []);
  const bp = blueprint(trainDays);

  const labels =
    input.preferredDays && input.preferredDays.length >= trainDays
      ? input.preferredDays.slice(0, trainDays)
      : DAY_NAMES.slice(0, trainDays);

  const days = bp.seq.map((s, i) => makeDay(labels[i] ?? `Day ${i + 1}`, s.focus, pool, s.key));

  return { daysPerWeek: trainDays, restDays: 7 - trainDays, splitName: bp.name, days };
}
