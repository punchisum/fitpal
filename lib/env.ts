/**
 * lib/env.ts — typed, validated environment access.
 *
 * Public vars (NEXT_PUBLIC_*) are safe in the browser. Everything in `serverEnv()`
 * is server-only — importing it into a client component will throw at runtime and
 * is also blocked by scripts/check-no-private.mjs.
 */

export const publicEnv = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export function assertPublicEnv(): void {
  const missing: string[] = [];
  if (!publicEnv.SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publicEnv.SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length) throw new Error(`Missing public env: ${missing.join(", ")}`);
}

/** Server-only secrets. Never import the result into client code. */
export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() called in the browser — server secrets must stay server-side.");
  }
  const get = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing server env: ${k}`);
    return v;
  };
  return {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? get("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: get("SUPABASE_SERVICE_ROLE_KEY"),
    GEMINI_API_KEY: get("GEMINI_API_KEY"),
    LLM_PROVIDER: process.env.LLM_PROVIDER ?? "gemini",
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? "",
  };
}
