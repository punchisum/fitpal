# Fitpal — Public Fitness Agent

A multi-user fitness coaching web app. Users sign up, onboard, and get a **deterministic, safety-clamped** training + nutrition plan, then log workouts, food, and daily check-ins, track progress, and chat with an AI coach grounded in their own data.

Built for public, multi-user safety from the ground up: **Supabase Auth + Row-Level Security on every table** (`auth.uid()` ownership), server-side-only LLM calls, and a deterministic planner that the AI can never override.

## Stack
- **Next.js 15** (App Router, Server Actions) + React 19 + Tailwind
- **Supabase** — Postgres + Auth + RLS
- **Gemini** — server-side coaching (provider-abstracted; OpenAI drop-in ready)
- **Trigger.dev** — scheduled jobs (reminders/reviews — Phase 7, scaffolded)
- **Vitest** — unit tests; live DB tests for RLS + onboarding

## Quick start
```bash
npm install
cp .env.example .env.local   # fill values (see below)
npm run db:migrate           # apply schema + RLS to your Supabase project
npm run db:verify            # confirm RLS is locked down
npm run dev                  # http://localhost:3000
```

## Environment (`.env.local`)
See `.env.example`. Client-safe: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, app secrets. Migration runner also uses
`SUPABASE_DB_*`. **Never** import server-only vars into client components — the guard blocks it.

## Scripts
| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run verify` | guard + typecheck + unit tests (the pre-commit gate) |
| `npm run guard` | private-identifier + secret-leak tripwire |
| `npm run test` | Vitest (planner + safety) |
| `npm run db:migrate` / `db:verify` | apply / verify schema + RLS |
| `node scripts/test-rls.mjs` | live two-user RLS isolation test |
| `node scripts/test-flow.mjs` | live onboarding data-path test |

## Safety model
- Every user table: RLS on, owner-only via `auth.uid()`, `anon` revoked. `SECURITY DEFINER`
  functions derive the user from `auth.uid()`, never a parameter.
- Deterministic planner owns all numbers (calorie floors, ≤20% deficit, ≤1%/week, forced rest day).
- LLM coach is **advice-only** — it cannot mutate state. Eating-disorder / self-harm / acute-medical
  signals bypass the LLM and return safe guidance + a professional referral. Minors are kept at maintenance.
- Per-user rate limits on coaching. Server-side LLM only — key never reaches the browser.

## Docs
- `docs/SUPABASE_AUTH_SETUP.md` — auth dashboard config
- `docs/CLOUDFLARE_SETUP.md` — Worker token (Telegram, Phase 6)
- `docs/DEPLOY.md` — production deploy

This is the public product. It shares **no** infrastructure, data, or secrets with any private agent.
