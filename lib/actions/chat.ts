"use server";

import { revalidatePath } from "next/cache";
import { runCoachTurn } from "@/lib/llm/coach";

export type ChatState = { error?: string; ok?: boolean };

export async function sendMessage(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Type a message first." };
  if (message.length > 1000) return { error: "That's a bit long — keep it under 1000 characters." };
  await runCoachTurn(message);
  revalidatePath("/chat");
  return { ok: true };
}
