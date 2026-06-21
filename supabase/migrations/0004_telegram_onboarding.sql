-- 0004_telegram_onboarding.sql — Telegram-first: in-chat onboarding state + service-role plan activator.

-- Conversational onboarding progress, stored per linked Telegram identity.
alter table public.telegram_identities
  add column if not exists onboarding_step    int   not null default 0,
  add column if not exists onboarding_answers jsonb not null default '{}';

-- Service-role variant of activate_fitness_plan (the Worker has no auth.uid()).
-- Atomically supersedes the active plan and inserts the new one for an explicit user.
create or replace function public.activate_fitness_plan_for(p_user_id uuid, p_plan jsonb, p_source text default 'deterministic')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_version int;
begin
  update public.fitness_plans set is_active = false, superseded_at = now() where user_id = p_user_id and is_active;
  select coalesce(max(version), 0) + 1 into v_version from public.fitness_plans where user_id = p_user_id;
  insert into public.fitness_plans (user_id, plan, source, version, is_active)
    values (p_user_id, p_plan, coalesce(p_source, 'deterministic'), v_version, true)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.activate_fitness_plan_for(uuid, jsonb, text) from anon, authenticated;
grant execute on function public.activate_fitness_plan_for(uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';
