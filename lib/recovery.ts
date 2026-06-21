// Deterministic recovery-readiness verdict.
// Blends OBJECTIVE wearable signals (HRV/RHR vs a 7-day baseline + sleep) with SUBJECTIVE
// check-in (energy/soreness). Objective signals dominate when present; otherwise it degrades
// gracefully to the subjective check-in. Ported from HartOS's recovery-verdict math.
// Deterministic; the LLM only ever re-phrases it.

export type Band = "green" | "amber" | "red" | "unknown";
export type Readiness = "full" | "controlled" | "easy" | "unknown";

export interface CheckinInput {
  sleepHours?: number | null;
  energy?: number | null; // 1-5
  soreness?: number | null; // 1-5 (5 = very sore)
  mood?: number | null; // 1-5
  // Objective wearable signals (Apple Health / aggregator), optional:
  hrvMs?: number | null;
  restingHr?: number | null;
  hrvBaseline?: number | null; // 7-day average
  rhrBaseline?: number | null; // 7-day average
}

export interface ReadinessVerdict {
  score: number | null; // 0-100, null if no signals
  band: Band;
  readiness: Readiness;
  reason: string;
  directive: string;
  drivers: string[];
  usedWearable: boolean;
}

const SLEEP_TARGET = 7.5;
const round = (n: number) => Math.round(n);

export function computeReadiness(c: CheckinInput): ReadinessVerdict {
  const drivers: string[] = [];
  let score = 100;
  let signals = 0;
  let usedWearable = false;

  // HRV vs 7-day baseline — the strongest recovery signal.
  if (typeof c.hrvMs === "number") {
    signals++; usedWearable = true;
    if (typeof c.hrvBaseline === "number" && c.hrvBaseline > 0) {
      const deltaPct = (c.hrvMs - c.hrvBaseline) / c.hrvBaseline;
      drivers.push(`HRV ${round(c.hrvMs)}ms (${deltaPct >= 0 ? "+" : ""}${round(deltaPct * 100)}% vs ${round(c.hrvBaseline)})`);
      if (deltaPct <= -0.2) score -= 35;
      else if (deltaPct <= -0.1) score -= 20;
      else if (deltaPct <= -0.05) score -= 10;
    } else {
      drivers.push(`HRV ${round(c.hrvMs)}ms`);
    }
  }

  // Resting HR vs baseline — elevation signals stress / under-recovery / illness.
  if (typeof c.restingHr === "number") {
    signals++; usedWearable = true;
    if (typeof c.rhrBaseline === "number" && c.rhrBaseline > 0) {
      const elev = c.restingHr - c.rhrBaseline;
      drivers.push(`RHR ${round(c.restingHr)} (${elev >= 0 ? "+" : ""}${round(elev)} vs ${round(c.rhrBaseline)})`);
      if (elev >= 7) score -= 20;
      else if (elev >= 4) score -= 12;
      else if (elev >= 2) score -= 5;
    } else {
      drivers.push(`RHR ${round(c.restingHr)}`);
    }
  }

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
    return { score: null, band: "unknown", readiness: "unknown", reason: "No check-in yet today.", directive: "Run /checkin (or connect a wearable with /connect) so I can call your readiness.", drivers: [], usedWearable: false };
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
  return { score, band, readiness, reason, directive, drivers, usedWearable };
}
