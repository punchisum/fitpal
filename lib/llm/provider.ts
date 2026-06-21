import "server-only";
import { serverEnv } from "@/lib/env";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export interface CoachProvider {
  coach(system: string, history: ChatTurn[], userMessage: string): Promise<string>;
}

const GEMINI_BASE = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";

/** Gemini via the Generative Language REST API. Server-only; key never leaves the server. */
class GeminiProvider implements CoachProvider {
  async coach(system: string, history: ChatTurn[], userMessage: string): Promise<string> {
    const key = serverEnv().GEMINI_API_KEY;
    const contents = [
      ...history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      { role: "user", parts: [{ text: userMessage }] },
    ];
    const res = await fetch(`${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 700, topP: 0.9 },
        safetySettings: [
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    if (json.promptFeedback?.blockReason) {
      return "I can't help with that one, but I'm happy to help with your training, nutrition, or recovery instead.";
    }
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    return text && text.length > 0 ? text : "Sorry — I didn't catch that. Could you rephrase?";
  }
}

export function getCoachProvider(): CoachProvider {
  // Provider abstraction: add an OpenAI implementation here and switch on LLM_PROVIDER later.
  return new GeminiProvider();
}
