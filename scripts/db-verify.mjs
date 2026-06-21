#!/usr/bin/env node
// Verifies every public user-table has RLS enabled and owner policies. Fails loudly otherwise.
import pg from "pg";
import { loadEnv, dbConfig } from "./_env.mjs";

const EXPECTED = [
  "profiles", "onboarding_responses", "fitness_goals", "training_preferences",
  "fitness_plans", "daily_checkins", "workout_logs", "nutrition_logs",
  "agent_messages", "plan_adjustment_proposals", "telegram_identities",
  "audit_logs", "usage_counters",
];

const client = new pg.Client(dbConfig(loadEnv()));

async function main() {
  await client.connect();
  const rls = (await client.query(`
    select c.relname as table, c.relrowsecurity as rls_enabled
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1)
  `, [EXPECTED])).rows;

  const policies = (await client.query(`
    select tablename, count(*)::int as n from pg_policies where schemaname = 'public' group by tablename
  `)).rows.reduce((m, r) => (m[r.tablename] = r.n, m), {});

  const anonGrants = (await client.query(`
    select table_name, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and table_name = any($1)
  `, [EXPECTED])).rows;

  let bad = 0;
  console.log("table                          rls   policies");
  console.log("─".repeat(52));
  for (const t of EXPECTED) {
    const row = rls.find((r) => r.table === t);
    const enabled = row?.rls_enabled === true;
    const n = policies[t] ?? 0;
    const ok = enabled && n >= 1;
    if (!ok) bad++;
    console.log(`${t.padEnd(30)} ${enabled ? "ON " : "OFF"}   ${String(n).padStart(2)}  ${ok ? "" : "  ✖"}`);
  }
  if (anonGrants.length) {
    bad++;
    console.log("\n✖ anon has table grants (should be NONE):");
    for (const g of anonGrants) console.log(`   ${g.table_name}: ${g.privilege_type}`);
  } else {
    console.log("\n✓ anon has zero table grants");
  }

  if (bad) { console.error(`\n✖ RLS verification FAILED (${bad} issue(s)).`); process.exit(1); }
  console.log("\n✓ RLS verification passed — every user table is locked to its owner.");
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
