import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client — BYPASSES RLS. SERVER ONLY. Never import into client code.
 * Use ONLY for trusted background work (Trigger jobs, append-only audit/security writes,
 * Telegram identity resolution). Every query MUST be explicitly scoped to a user_id;
 * there is no auth.uid() safety net here.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
