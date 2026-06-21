-- 0008_health_metrics.sql — wearable/Apple-Health metrics + a per-user ingest token.
-- The "satellite" (Apple Shortcut / Auto Health Export) POSTs HRV/RHR/sleep here, scoped by token.

-- Per-user ingest token (the "name on the envelope"). Generated on /connect.
alter table public.profiles add column if not exists health_ingest_token text unique;

create table if not exists public.health_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  metric_date  date not null,
  hrv_ms       numeric check (hrv_ms between 0 and 500),
  resting_hr   numeric check (resting_hr between 20 and 200),
  sleep_hours  numeric check (sleep_hours between 0 and 24),
  source       text not null default 'apple_health',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, metric_date)
);
create index if not exists health_metrics_user_idx on public.health_metrics (user_id, metric_date desc);
alter table public.health_metrics enable row level security;
revoke all on public.health_metrics from anon;
grant select on public.health_metrics to authenticated;
create policy "health_select_own" on public.health_metrics for select to authenticated using (auth.uid() = user_id);
-- Writes come from the Worker (service_role, token-scoped) — covered by the 0003 default grants.

-- Generate (or return existing) the caller's ingest token. Owner-scoped via auth.uid().
create or replace function public.get_or_create_health_token()
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_tok text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select health_ingest_token into v_tok from public.profiles where user_id = v_uid;
  if v_tok is null then
    v_tok := 'ht_' || replace(gen_random_uuid()::text, '-', '');
    update public.profiles set health_ingest_token = v_tok where user_id = v_uid;
  end if;
  return v_tok;
end;
$$;
revoke all on function public.get_or_create_health_token() from anon;
grant execute on function public.get_or_create_health_token() to authenticated;

-- Resolve an ingest token → user_id (Worker, service_role only).
create or replace function public.resolve_health_token(p_token text)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.profiles where health_ingest_token = p_token limit 1;
$$;
revoke all on function public.resolve_health_token(text) from anon, authenticated;
grant execute on function public.resolve_health_token(text) to service_role;

notify pgrst, 'reload schema';
