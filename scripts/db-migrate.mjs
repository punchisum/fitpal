#!/usr/bin/env node
// Applies supabase/migrations/*.sql in order against the public project DB.
// Tracks applied migrations in public._migrations. Idempotent: re-runs skip applied files.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadEnv, dbConfig } from "./_env.mjs";

const env = loadEnv();
const client = new pg.Client(dbConfig(env));

const MIG_DIR = "supabase/migrations";

async function main() {
  await client.connect();
  await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now());`);
  const applied = new Set((await client.query("select name from public._migrations")).rows.map((r) => r.name));

  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql") && !f.startsWith("ROLLBACK")).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) { console.log(`· skip ${file} (already applied)`); continue; }
    const sql = readFileSync(join(MIG_DIR, file), "utf8");
    process.stdout.write(`→ applying ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("ok");
      count++;
    } catch (e) {
      await client.query("rollback");
      console.error("FAILED\n", e.message);
      process.exitCode = 1;
      break;
    }
  }
  console.log(`\nDone. ${count} migration(s) applied.`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
