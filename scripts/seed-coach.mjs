#!/usr/bin/env node
// Grant CoachOS access. Ensures a Supabase auth user for the given email (creating it with a
// fresh password if missing, or resetting the password so login is guaranteed) and adds them to
// the `coaches` allowlist. Idempotent.
//
//   node scripts/seed-coach.mjs [email]
//
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_env.mjs";

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = (process.argv[2] || "punchisum@gmail.com").toLowerCase();
const password = `Coach-${randomBytes(6).toString("base64url")}!`;
const APP_URL = (env.NEXT_PUBLIC_APP_URL && env.NEXT_PUBLIC_APP_URL.startsWith("https")) ? env.NEXT_PUBLIC_APP_URL : "https://fitpal-web.hartos.workers.dev";

async function findUserByEmail(e) {
  // paginate admin.listUsers
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === e);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  let user = await findUserByEmail(email);
  if (user) {
    await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    console.log(`↺ Reset password for existing user ${email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
    console.log(`＋ Created user ${email}`);
  }

  const { error: insErr } = await admin.from("coaches").upsert({ user_id: user.id }, { onConflict: "user_id" });
  if (insErr) throw insErr;

  console.log("\n✅ CoachOS access granted.");
  console.log("   Login: " + APP_URL + "/login");
  console.log("   Email: " + email);
  console.log("   Pass:  " + password + "   (change it anytime)");
  console.log("   → after login you land on " + APP_URL + "/coach");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
