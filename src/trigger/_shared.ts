// Shared helpers for Trigger.dev jobs. Service-role REST (trusted, always user-scoped) + Telegram.
// Env comes from the Trigger.dev dashboard (SUPABASE_*, TELEGRAM_BOT_TOKEN already set there).

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

function headers() {
  return { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
}

export async function sbGet<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!r.ok) return [];
  return (await r.json()) as T[];
}

export async function sbInsert(table: string, row: Record<string, unknown>): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...headers(), Prefer: "return=minimal" }, body: JSON.stringify(row),
  });
  return r.ok;
}

export async function sbRpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) return null;
  try { return (await r.json()) as T; } catch { return null; }
}

export async function tgSend(chatId: string, text: string): Promise<void> {
  if (!chatId) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

export type LinkedUser = { user_id: string; telegram_chat_id: string };

/** All Telegram-linked users (the audience for reminders). */
export async function linkedUsers(): Promise<LinkedUser[]> {
  return sbGet<LinkedUser>("telegram_identities?select=user_id,telegram_chat_id&linked_at=not.is.null&is_active=eq.true");
}

export function todayUTC(): string { return new Date().toISOString().slice(0, 10); }
export function daysAgoUTC(n: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10);
}
