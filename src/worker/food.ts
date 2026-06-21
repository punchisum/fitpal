// Food estimation via Gemini (text or photo) → itemized breakdown + totals. Pure (fetch only), Worker-safe.

export type FoodItem = {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type FoodEstimate = {
  description: string; // comma-joined item names (or single description)
  items: FoodItem[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: "low" | "medium" | "high";
};

const FOOD_PROMPT = `You are a precise nutrition estimator for a fitness app. Identify EACH distinct food/drink item in the description or image, estimate its portion in grams (or ml→grams) and its nutrition, for the portion shown.
Respond with ONLY a JSON object, no prose:
{"items":[{"name": short string, "grams": number, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}], "confidence": "low"|"medium"|"high"}
Use realistic values for typical portions. List 1 item if it's a single food. If the input is NOT food, return "items": [].`;

/** Encode an ArrayBuffer to base64 (chunked; Worker + Node safe). */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

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
    const o = JSON.parse(cleaned) as { items?: unknown[]; confidence?: unknown };
    const items: FoodItem[] = Array.isArray(o.items)
      ? o.items.map((raw) => {
          const it = raw as Record<string, unknown>;
          return { name: String(it.name || "item").slice(0, 60), grams: num(it.grams), calories: num(it.calories), protein_g: num(it.protein_g), carbs_g: num(it.carbs_g), fat_g: num(it.fat_g) };
        })
      : [];
    if (items.length === 0) {
      return { description: "not food", items: [], calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, confidence: "low" };
    }
    const sum = (k: keyof FoodItem) => items.reduce((a, i) => a + (i[k] as number), 0);
    const conf = o.confidence === "high" || o.confidence === "medium" ? o.confidence : "low";
    return {
      description: items.map((i) => i.name).join(", ").slice(0, 200),
      items,
      calories: sum("calories"),
      protein_g: sum("protein_g"),
      carbs_g: sum("carbs_g"),
      fat_g: sum("fat_g"),
      confidence: conf,
    };
  } catch {
    return null;
  }
}
