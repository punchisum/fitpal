"use server";

import { createClient } from "@/lib/supabase/server";

export async function generateLinkCode(): Promise<{ code?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in." };
  const { data, error } = await supabase.rpc("generate_telegram_link_code");
  if (error) return { error: "Could not generate a link code. Try again." };
  return { code: data as string };
}
