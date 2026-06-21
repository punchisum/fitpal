# Deploy — Fitpal

Recommended host: **Vercel** (free tier is enough for beta; gives a free `*.vercel.app` domain — no purchase needed).

## 1. Push to GitHub
The repo is `punchisum/fitpal`. Commit and push (`.env.local` is gitignored and must NOT be committed).

## 2. Import to Vercel
- New Project → import the GitHub repo. Framework auto-detects Next.js.

## 3. Set environment variables (Vercel → Settings → Environment Variables)
Copy these from `.env.local` (values, not names):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`  *(server only)*
- `GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`  *(for Phase 6)*
- `INTERNAL_JOB_SECRET`, `RATE_LIMIT_SECRET`, `APP_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL` / `APP_URL` → set to your Vercel URL (e.g. `https://fitpal.vercel.app`)

Do NOT set `SUPABASE_DB_*` in Vercel — those are local migration-only.

## 4. Point Supabase Auth at the deployed URL
Supabase → Authentication → URL Configuration:
- Site URL = `https://<your-vercel-domain>`
- Redirect URLs: add `https://<your-vercel-domain>/**` (keep `http://localhost:3000/**` for local dev).

## 5. Deploy & smoke-test
- Deploy. Visit `/api/health` → `{ "ok": true }`.
- Sign up → confirm email → onboard → dashboard.
- (Optional) Run `node scripts/test-rls.mjs` and `node scripts/test-flow.mjs` against the same project.

## Notes
- Email confirmation is ON. The signup link routes through `/auth/callback`. Works out of the box with the default Supabase email template.
- For faster local testing you can temporarily turn Confirm Email OFF in Supabase, then back ON before real users.
- Migrations: run `npm run db:migrate` locally against the project before/with each deploy; the app does not auto-migrate.
