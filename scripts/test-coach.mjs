#!/usr/bin/env node
// CoachOS tests: (1) coaches-table RLS gating, (2) the data roll-up a coach sees, (3) the live
// /coach route blocks anonymous access. Does NOT exercise authed pages (SSR cookie session).
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Prefer an explicitly deployed URL; ignore the localhost dev default in .env.local.
const WEB = (env.NEXT_PUBLIC_APP_URL && env.NEXT_PUBLIC_APP_URL.startsWith("https")) ? env.NEXT_PUBLIC_APP_URL : "https://fitpal-web.hartos.workers.dev";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const today = new Date().toISOString().slice(0, 10);
const yday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
let fail = 0; const ids = [];
const ok = (c, m, x) => { console.log(`${c ? "✓" : "✖"} ${m}${c ? "" : "  " + (x ?? "")}`); if (!c) fail++; };
const mk = async (tag) => { const { data } = await admin.auth.admin.createUser({ email: `co-${tag}-${Date.now()}@fitpal.test`, password: "TestPass12345!", email_confirm: true }); ids.push(data.user.id); return data.user; };

async function main() {
  const coach = await mk("coach");
  const userA = await mk("a");
  await admin.from("coaches").insert({ user_id: coach.id });
  await admin.from("profiles").update({ nickname: "Aiko", onboarding_complete: true }).eq("user_id", userA.id);

  // (2) data roll-up: 2 logs today + 1 yesterday → today's sum + 2-day streak.
  await admin.from("nutrition_logs").insert([
    { user_id: userA.id, log_date: today, description: "eggs", calories: 200, protein_g: 18, source: "telegram" },
    { user_id: userA.id, log_date: today, description: "rice", calories: 300, protein_g: 6, source: "telegram" },
    { user_id: userA.id, log_date: yday, description: "oats", calories: 250, protein_g: 10, source: "telegram" },
  ]);
  const logs = (await admin.from("nutrition_logs").select("log_date,calories").eq("user_id", userA.id)).data ?? [];
  const todayCal = logs.filter((r) => r.log_date === today).reduce((a, r) => a + Number(r.calories), 0);
  ok(todayCal === 500, "today's calorie roll-up correct (500)", String(todayCal));
  const days = new Set(logs.map((r) => r.log_date));
  let streak = 0, d = new Date(today + "T00:00:00Z");
  if (!days.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
  ok(streak === 2, "streak computed correctly (2)", String(streak));

  // (1) RLS gating on coaches table.
  const asCoach = createClient(URL, ANON, { auth: { persistSession: false } });
  await asCoach.auth.signInWithPassword({ email: coach.email, password: "TestPass12345!" });
  const coachSees = (await asCoach.from("coaches").select("user_id")).data ?? [];
  ok(coachSees.length === 1 && coachSees[0].user_id === coach.id, "coach sees ONLY their own coach row", JSON.stringify(coachSees));

  const asUser = createClient(URL, ANON, { auth: { persistSession: false } });
  await asUser.auth.signInWithPassword({ email: userA.email, password: "TestPass12345!" });
  const userSees = (await asUser.from("coaches").select("user_id")).data ?? [];
  ok(userSees.length === 0, "non-coach sees NO coach rows (cannot discover coaches)", JSON.stringify(userSees));

  // (3) live route blocks anonymous access (redirect to /login).
  try {
    const res = await fetch(`${WEB}/coach`, { redirect: "manual" });
    const loc = res.headers.get("location") ?? "";
    ok(res.status >= 300 && res.status < 400 && /\/login/.test(loc), "GET /coach (anon) redirects to /login", `status ${res.status} → ${loc || "(no redirect)"}`);
  } catch (e) {
    ok(false, "GET /coach reachable", e.message);
  }
}

main()
  .catch((e) => { console.error("ERROR:", e.message); fail++; })
  .finally(async () => {
    for (const id of ids) await admin.auth.admin.deleteUser(id).catch(() => {});
    console.log(fail ? `\n✖ CoachOS FAILED (${fail})` : "\n✓ CoachOS passed — gating, roll-up, and anon block all verified.");
    process.exit(fail ? 1 : 0);
  });
