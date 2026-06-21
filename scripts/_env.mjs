// Tiny .env.local parser (no dotenv dependency). Server-side scripts only.
import { readFileSync } from "node:fs";

export function loadEnv(path = ".env.local") {
  const out = {};
  let raw = "";
  try { raw = readFileSync(path, "utf8"); } catch { return out; }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

export function dbConfig(env) {
  const password = env.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error("SUPABASE_DB_PASSWORD missing in .env.local");
  return {
    host: env.SUPABASE_DB_HOST,
    port: Number(env.SUPABASE_DB_PORT || 5432),
    user: env.SUPABASE_DB_USER,
    database: env.SUPABASE_DB_NAME || "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  };
}
