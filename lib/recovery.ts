// Deterministic recovery-readiness verdict from a subjective daily check-in.
// The public analog of HartOS's recovery score (which used HRV/RHR/sleep). Here we score
// sleep + energy + soreness — no wearable needed. Deterministic; the LLM only ever re-phrases it.

export type Band = "green" | "amber" | "red" | "unknown";
export type Readiness = "full" | "controlled" | "easy" | "unknown";

export interface CheckinInput {
  sleepHours?: number | null;
  energy?: number | null; // 1-5
  soreness?: number | null; // 1-5 (5 = very sore)
  mood?: number | null; // 1-5
}

export interface ReadinessVerdict {
  score: number | null; // 0-100, null if no signals
  band: Band;
  readiness: Readiness;
  reason: string; // one-line summary citing the drivers
  directive: string; // what to do today
  drivers: string[];
}

const SLEEP_TARGET = 7.5;

export function computeReadiness(c: CheckinInput): ReadinessVerdict {
  const drivers: string[] = [];
  let score = 100;
  let signals = 0;

  if (typeof c.sleepHours === "number") {
    signals++;
    const s = c.sleepHours;
    drivers.push(`slept ${Number.isInteger(s) ? s : s.toFixed(1)}h`);
    if (s < 5) score -= 30;
    else if (s < 6) score -= 18;
    else if (s < 7) score -= 10;
    else if (s < SLEEP_TARGET) score -= 3;
  }
  if (typeof c.energy === "number") {
    signals++;
    drivers.push(`energy ${c.energy}/5`);
    if (c.energy <= 1) score -= 22;
    else if (c.energy === 2) score -= 14;
    else if (c.energy === 3) score -= 8;
  }
  if (typeof c.soreness === "number") {
    signals++;
    drivers.push(`soreness ${c.soreness}/5`);
    if (c.soreness >= 5) score -= 22;
    else if (c.soreness === 4) score -= 14;
    else if (c.soreness === 3) score -= 8;
  }

  if (signals === 0) {
    return { score: null, band: "unknown", readiness: "unknown", reason: "No check-in yet today.", directive: "Run /checkin so I can call your readiness for today.", drivers: [] };
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band: Band = score >= 80 ? "green" : score >= 60 ? "amber" : "red";
  const readiness: Readiness = band === "green" ? "full" : band === "amber" ? "controlled" : "easy";

  const directive =
    readiness === "full"
      ? "You're recovered — train as planned and push it. 💪"
      : readiness === "controlled"
        ? "Train, but hold the intensity back a notch — quality over ego today."
        : "Take it easy today — a walk, mobility, or light effort. Recovery is where you grow.";

  const reason = `Readiness ${band} (${score}/100) — ${drivers.join(", ")}.`;
  return { score, band, readiness, reason, directive, drivers };
}
