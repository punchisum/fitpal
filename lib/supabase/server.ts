import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };
import { publicEnv } from "@/lib/env";

/**
 * Server Supabase client bound to the request cookies. Uses the ANON key + the user's
 * JWT from cookies, so every query is RLS-scoped to auth.uid(). This is the default
 * client for all user-facing reads/writes.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.SUPABASE_URL, publicEnv.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set({ name, value, ...options }));
        } catch {
          // Called from a Server Component without a mutable cookie store — safe to ignore;
          // middleware refreshes the session.
        }
      },
    },
  });
}
