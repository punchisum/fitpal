# CoachOS — coach panel

A web dashboard for coaches to view every user's data: plan, food log, weight trend,
readiness, check-ins, workouts, and feedback. Lives in the Next.js app under `/coach`.

## How access works
- A user is a coach iff they appear in the `coaches` table (migration 0010).
- `requireCoach()` ([lib/coach/auth.ts](../lib/coach/auth.ts)) gates every `/coach` route:
  not logged in → `/login`; logged in but not a coach → **404** (the panel is not revealed).
- Coach reads use the **service-role** client ([lib/coach/data.ts](../lib/coach/data.ts)), which
  bypasses RLS — but only ever runs *after* `requireCoach()` confirms the viewer. Users themselves
  remain RLS-locked to their own rows; the `coaches` table only lets a user see their *own* coach
  membership (`coach_select_self` policy), so coaches can't be enumerated.

## Pages
- `/coach` — all users with today's intake vs target, streak 🔥, goal, and last-active.
  Client-side search by name/goal. ([app/coach/page.tsx](../app/coach/page.tsx))
- `/coach/[userId]` — one user: readiness (HRV/RHR + subjective), goal, active plan & targets,
  weight sparkline, 14-day itemized food log, recent check-ins, workouts, and submitted feedback.
  ([app/coach/[userId]/page.tsx](../app/coach/[userId]/page.tsx))

After login, coaches are routed straight to `/coach` (see `postAuthPath` in
[lib/actions/auth.ts](../lib/actions/auth.ts)).

## Granting access
```
node scripts/seed-coach.mjs [email]      # default: punchisum@gmail.com
```
Creates/updates the Supabase auth user (sets a fresh password it prints) and adds them to
`coaches`. Idempotent. Log in at `https://fitpal-web.hartos.workers.dev/login`.

## Tests
```
node scripts/test-coach.mjs
```
Verifies: coaches-table RLS (a coach sees only their own row; a normal user sees none),
the today/streak roll-up math, and that `GET /coach` blocks anonymous access (307 → /login).
End-to-end render was validated in a real browser session against live beta data.

## Deploy
```
npm run cf:build && npm run cf:deploy   # OpenNext → fitpal-web on Cloudflare
```
