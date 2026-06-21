# Cloudflare setup — fitpal (Public Fitness Agent)

Needed only for the Telegram webhook Worker (Phase 6). The web app (Phases 0–5) does NOT need this.

## API Token
Create at: dash.cloudflare.com/profile/api-tokens → Create Token.

**Use the built-in template "Edit Cloudflare Workers"** (do not hand-pick permissions).

Scope it down:
- Account Resources → Include → **your specific account only**.
- Zone Resources → **All zones** (or leave default). Not required for `*.workers.dev` deploys; only matters once a custom domain is attached.
- TTL → default / no expiry for dev.

Copy the token once and paste into `.env.local` → `CLOUDFLARE_API_TOKEN`.

### Permissions the template grants
- Account → Workers Scripts → Edit  (deploy the Worker — the essential one)
- Account → Workers KV Storage → Edit  (rate-limit / cache storage later)
- Zone → Workers Routes → Edit  (only used with a custom domain)

Does NOT grant DNS, billing, or cross-account access. Safe for `wrangler deploy`.

## Account ID
Dashboard → Workers & Pages → right sidebar shows **Account ID** (also the hex in the dashboard URL `dash.cloudflare.com/<ACCOUNT_ID>`).
Paste into `.env.local` → `CLOUDFLARE_ACCOUNT_ID`. Not a standalone secret, but keep it in the gitignored env file anyway.

## Wrangler config
The Worker is configured in `wrangler.jsonc` (name + main entry). `wrangler deploy` reads `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` from the environment.

Status: pending (deferred to Phase 6).
