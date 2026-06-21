#!/usr/bin/env node
/**
 * check-no-private.mjs — the public-safety tripwire.
 *
 * Hard-fails the build if any private Fitness Agent identifier or any raw secret
 * leaks into committed source, or if a client component touches a server-only secret.
 * Run in `npm run verify` and in CI before every commit/deploy.
 *
 * It does NOT hardcode the private Supabase project ref (that would itself be a leak) —
 * raw-secret patterns + the "client code may only use NEXT_PUBLIC_*" rule cover that.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".open-next", ".git", ".trigger", ".wrangler", "dist", "out", ".vercel", ".claude"]);
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".json", ".md", ".css"]);
// The guard defines the forbidden patterns, so it would always match itself.
const SELF = "scripts/check-no-private.mjs";

// Files allowed to legitimately contain secrets (gitignored, never committed) or secret NAMES only.
const isEnvFile = (rel) => /(^|\/)\.env(\.|$)|(^|\/)\.dev\.vars/.test(rel);
const isEnvExample = (rel) => rel.endsWith(".env.example");

// 1) Private identifiers — must never appear in the public repo.
const PRIVATE_MARKERS = [
  { re: /HARTOS_/, label: "private env prefix HARTOS_" },
  { re: /hart-os-fitness/i, label: "private repo name hart-os-fitness" },
  { re: /ALLOW_LEGACY_SINGLE_USER/, label: "private single-user legacy flag" },
  { re: /proj_esipxunwkrxrhuiabkkg/, label: "private Trigger.dev project id" },
];

// 2) Raw secrets — must never appear OUTSIDE gitignored .env files.
const SECRET_PATTERNS = [
  { re: /sb_secret_[A-Za-z0-9_-]{8,}/, label: "Supabase secret key" },
  { re: /\btr_(dev|prod)_[A-Za-z0-9]{8,}/, label: "Trigger.dev secret key" },
  { re: /eyJhbGciOiJ[A-Za-z0-9._-]{20,}/, label: "JWT (Supabase service/anon JWT)" },
  { re: /\bcfat_[A-Za-z0-9]{20,}/, label: "Cloudflare API token" },
  { re: /\b\d{8,}:[A-Za-z0-9_-]{30,}\b/, label: "Telegram bot token" },
];

// 3) Server-only references that must never appear in a client component ("use client").
const CLIENT_FORBIDDEN = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /SUPABASE_SECRET/,
  /sb_secret_/,
  /SERVICE_ROLE/,
];

const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!SCAN_EXT.has(extname(name))) continue;
    scan(full);
  }
}

function scan(full) {
  const rel = relative(ROOT, full).replace(/\\/g, "/");
  if (rel === SELF) return;
  let text;
  try { text = readFileSync(full, "utf8"); } catch { return; }
  const lines = text.split(/\r?\n/);

  for (const { re, label } of PRIVATE_MARKERS) {
    lines.forEach((ln, i) => { if (re.test(ln)) violations.push(`${rel}:${i + 1}  PRIVATE: ${label}`); });
  }

  if (!isEnvFile(rel)) {
    for (const { re, label } of SECRET_PATTERNS) {
      lines.forEach((ln, i) => {
        if (isEnvExample(rel)) return; // names only, no values
        if (re.test(ln)) violations.push(`${rel}:${i + 1}  SECRET LEAK: ${label}`);
      });
    }
  }

  // Client-component secret check.
  const isClient = /^\s*["']use client["']/m.test(text);
  if (isClient) {
    for (const re of CLIENT_FORBIDDEN) {
      lines.forEach((ln, i) => { if (re.test(ln)) violations.push(`${rel}:${i + 1}  CLIENT LEAK: server secret in a client component (${re})`); });
    }
  }
}

walk(ROOT);

if (violations.length) {
  console.error("\n✖ private-identifier guard FAILED:\n");
  for (const v of violations) console.error("  " + v);
  console.error(`\n${violations.length} violation(s). Public repo must never reference private infra or embed raw secrets.\n`);
  process.exit(1);
}
console.log("✓ private-identifier guard passed — no private refs, no leaked secrets, no client-side server secrets.");
