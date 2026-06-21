import "server-only";
import { redirect, notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Returns the logged-in user IFF they are a coach, else null. RLS-scoped self-check. */
export async function getCoachUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("coaches").select("user_id").eq("user_id", user.id).maybeSingle();
  return data ? user : null;
}

/**
 * Gate for every /coach route. Not logged in → /login. Logged in but not a coach →
 * 404 (don't reveal the panel exists). Returns the coach user otherwise.
 */
export async function requireCoach(): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/coach");
  const { data } = await supabase.from("coaches").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) notFound();
  return user;
}
