# Supabase Auth setup — fitpal (Public Fitness Agent)

Records the exact dashboard config for the NEW public Supabase project. Separate from the private agent.

## Sign In / Providers  (Authentication → Providers)

| Setting | Value | Reason |
|---|---|---|
| Allow new users to sign up | **ON** | Public product; people must be able to join. Flip OFF for a closed beta. |
| Allow manual linking | **OFF** | Not needed for MVP; Telegram linking uses our own one-time-code flow → `telegram_identities`, not this API. |
| Allow anonymous sign-ins | **OFF** | Anonymous = abuse/junk-data magnet for an app holding personal health data. |
| Confirm email | **ON** | Forces real-email verification before first login. |
| **Email** provider | **Enabled** | Primary login (email + password). |
| **Phone** provider | Disabled | SMS costs money; not needed. |

## URL Configuration  (Authentication → URL Configuration)

| Field | Value | Notes |
|---|---|---|
| Site URL | `http://localhost:3000` | Fallback redirect + email-template base. No wildcards allowed here. |
| Redirect URLs | `http://localhost:3000/**` | Allow-list for post-auth redirects. `/**` = any path under localhost. Wildcards allowed here. |

## When you launch (swap localhost → real host)
You do NOT need to buy a domain. Hosting gives a free one:
- Vercel → `https://fitpal.vercel.app`
- Cloudflare Pages → `https://fitpal.pages.dev`

At launch, set:
- Site URL = `https://<your-host-domain>`
- Add Redirect URL = `https://<your-host-domain>/**`
- Keep `http://localhost:3000/**` in the list for local dev.
- Update `APP_URL` / `NEXT_PUBLIC_APP_URL` in `.env.local` to match.

## Local-dev convenience (optional)
To test signups without clicking email links, temporarily set **Confirm email = OFF**, then turn it back **ON** before any real users.

Status: configured 2026-06-21 for development.
