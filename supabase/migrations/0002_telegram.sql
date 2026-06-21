-- 0002_telegram.sql — Telegram account linking + service-role helpers.
-- Web side (authenticated): generate a one-time link code.
-- Worker side (service_role): link by code, resolve telegram id → user, rate-limit, all user-scoped.

-- Generate a one-time link code for the current user (replaces any pending unlinked code).
create or replace function public.generate_telegram_link_code()
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  delete from public.telegram_identities where user_id = v_uid and linked_at is null;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.telegram_identities (user_id, link_code, link_code_expires_at, is_active)
    values (v_uid, v_code, now() + interval '30 minutes', true);
  return v_code;
end;
$$;
revoke all on function public.generate_telegram_link_code() from anon;
grant execute on function public.generate_telegram_link_code() to authenticated;

-- Link a Telegram account using a code (Worker, service_role only).
create or replace function public.link_telegram_account(p_code text, p_telegram_user_id text, p_chat_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.telegram_identities;
begin
  select * into v_row from public.telegram_identities
    where link_code = upper(p_code) and linked_at is null and link_code_expires_at > now()
    order by created_at desc limit 1;
  if v_row.id is null then return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired'); end if;
  delete from public.telegram_identities where telegram_user_id = p_telegram_user_id; -- allow re-link
  update public.telegram_identities
    set telegram_user_id = p_telegram_user_id, telegram_chat_id = p_chat_id,
        linked_at = now(), link_code = null, link_code_expires_at = null
    where id = v_row.id;
  return jsonb_build_object('ok', true, 'user_id', v_row.user_id);
end;
$$;
revoke all on function public.link_telegram_account(text, text, text) from anon, authenticated;
grant execute on function public.link_telegram_account(text, text, text) to service_role;

-- Resolve a linked Telegram id → user_id (Worker, service_role only).
create or replace function public.resolve_telegram_user(p_telegram_user_id text)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.telegram_identities
    where telegram_user_id = p_telegram_user_id and linked_at is not null and is_active
    limit 1;
$$;
revoke all on function public.resolve_telegram_user(text) from anon, authenticated;
grant execute on function public.resolve_telegram_user(text) to service_role;

-- Service-role usage increment for a specific user (Telegram coach rate limit).
create or replace function public.increment_usage_for(p_user_id uuid, p_window_key text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.usage_counters (user_id, window_key, count, updated_at)
    values (p_user_id, p_window_key, 1, now())
  on conflict (user_id, window_key) do update set count = public.usage_counters.count + 1, updated_at = now()
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.increment_usage_for(uuid, text, int) from anon, authenticated;
grant execute on function public.increment_usage_for(uuid, text, int) to service_role;

notify pgrst, 'reload schema';
