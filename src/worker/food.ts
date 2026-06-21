// Food estimation via Gemini (text or photo) → calories + macros. Pure (fetch only), Worker-safe.

export type FoodEstimate = {
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: "low" | "medium" | "high";
};

const FOOD_PROMPT = `You are a precise nutrition estimator for a fitness app. Estimate the TOTAL nutrition for the food described or shown in the image, for the portion implied.
Respond with ONLY a JSON object, no prose, with exactly these keys:
{"description": short string, "calories": number (kcal), "protein_g": number, "carbs_g": number, "fat_g": number, "confidence": "low"|"medium"|"high"}
Use realistic values for typical portions. Estimates are approximate — set confidence by how clear the portion/items are. If the input is NOT food, return calories 0 and description "not food".`;

/** Encode an ArrayBuffer to base64 (chunked; Worker + Node safe). */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function estimateFood(
  apiKey: string,
  model: string,
  opts: { text?: string; imageBase64?: string; mimeType?: string }
): Promise<FoodEstimate | null> {
  const parts: Record<string, unknown>[] = [{ text: FOOD_PROMPT }];
  if (opts.text) parts.push({ text: "Food: " + opts.text });
  if (opts.imageBase64) parts.push({ inline_data: { mime_type: opts.mimeType ?? "image/jpeg", data: opts.imageBase64 } });

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof o.calories !== "number") return null;
    const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
    const conf = o.confidence === "high" || o.confidence === "medium" ? o.confidence : "low";
    return {
      description: String(o.description || "food").slice(0, 200),
      calories: num(o.calories),
      protein_g: num(o.protein_g),
      carbs_g: num(o.carbs_g),
      fat_g: num(o.fat_g),
      confidence: conf,
    };
  } catch {
    return null;
  }
}
