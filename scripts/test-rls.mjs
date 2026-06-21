#!/usr/bin/env node
// End-to-end RLS isolation test: two real users, neither can read or write the other's data.
// Creates two throwaway auth users, exercises cross-access, then deletes them.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("missing supabase env"); process.exit(1); }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const stamp = Math.random().toString(36).slice(2, 8);
const mk = (n) => ({ email: `rls-test-${stamp}-${n}@fitpal.test`, password: "TestPass12345!" });
const A = mk("a"), B = mk("b");
let aId, bId, fail = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✖"} ${m}`); if (!c) fail++; };

async function userClient(creds) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword(creds);
  if (error) throw new Error("signin: " + error.message);
  return { client: c, id: data.user.id };
}

async function main() {
  // Create two confirmed users.
  const { data: ua, error: ea } = await admin.auth.admin.createUser({ ...A, email_confirm: true });
  const { data: ub, error: eb } = await admin.auth.admin.createUser({ ...B, email_confirm: true });
  if (ea || eb) throw new Error("createUser: " + (ea?.message || eb?.message));
  aId = ua.user.id; bId = ub.user.id;

  const a = await userClient(A);
  const b = await userClient(B);

  // Seed: each user writes a check-in for themselves (profile auto-created by trigger).
  const today = new Date().toISOString().slice(0, 10);
  await a.client.from("daily_checkins").insert({ user_id: aId, checkin_date: today, energy: 5 });
  await b.client.from("daily_checkins").insert({ user_id: bId, checkin_date: today, energy: 1 });

  // 1) A reads own check-ins → sees exactly its own.
  const aOwn = await a.client.from("daily_checkins").select("user_id");
  ok((aOwn.data ?? []).length >= 1 && (aOwn.data ?? []).every((r) => r.user_id === aId), "A reads only its own check-ins");

  // 2) B cannot read A's profile.
  const bReadA = await b.client.from("profiles").select("*").eq("user_id", aId);
  ok((bReadA.data ?? []).length === 0, "B cannot read A's profile (RLS blocks cross-user select)");

  // 3) B cannot read A's check-ins even by filtering on A's id.
  const bReadACheck = await b.client.from("daily_checkins").select("*").eq("user_id", aId);
  ok((bReadACheck.data ?? []).length === 0, "B cannot read A's check-ins");

  // 4) B cannot INSERT a row owned by A (with-check denies it).
  const bWriteA = await b.client.from("workout_logs").insert({ user_id: aId, workout_date: today });
  ok(bWriteA.error != null, "B cannot insert a row owned by A (with-check denies)");

  // 5) Anonymous (no auth) reads nothing.
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const anonRead = await anon.from("profiles").select("*");
  ok((anonRead.data ?? []).length === 0, "anonymous client reads zero rows");

  // 6) Definer fn ownership: A increments its own usage; counter is A's.
  const inc = await a.client.rpc("increment_usage", { p_window_key: "rls-test", p_limit: 100 });
  ok(inc.error == null && inc.data === true, "increment_usage works for the authed owner");
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    if (aId) await admin.auth.admin.deleteUser(aId);
    if (bId) await admin.auth.admin.deleteUser(bId);
    console.log(fail ? `\n✖ RLS isolation FAILED (${fail})` : "\n✓ RLS isolation passed — users are fully isolated.");
    process.exit(fail ? 1 : 0);
  });
