-- 0001_init.sql — Fitpal public schema + RLS.
-- Every user-owned table: RLS enabled, owner-only via auth.uid(), anon revoked.
-- SECURITY DEFINER functions derive the user from auth.uid() — NEVER from a parameter.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles — one row per user, created automatically on signup.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  nickname           text,
  sex                text check (sex in ('male','female','other','prefer_not')),
  birth_year         int  check (birth_year between 1900 and 2025),
  height_cm          numeric check (height_cm between 80 and 260),
  units              text not null default 'metric' check (units in ('metric','imperial')),
  onboarding_complete boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- onboarding_responses — raw answers, audit + re-derivation source.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.onboarding_responses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  payload     jsonb not null,
  version     int not null default 1,
  created_at  timestamptz not null default now()
);
create index if not exists onboarding_responses_user_idx on public.onboarding_responses (user_id, created_at desc);
alter table public.onboarding_responses enable row level security;
revoke all on public.onboarding_responses from anon;
grant select, insert on public.onboarding_responses to authenticated;
create policy "onboarding_select_own" on public.onboarding_responses for select to authenticated using (auth.uid() = user_id);
create policy "onboarding_insert_own" on public.onboarding_responses for insert to authenticated with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- fitness_goals
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.fitness_goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  primary_goal    text not null check (primary_goal in ('lose_fat','build_muscle','maintain','recomp','general_health')),
  start_weight_kg numeric check (start_weight_kg between 25 and 400),
  target_weight_kg numeric check (target_weight_kg between 25 and 400),
  target_date     date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists fitness_goals_active_idx on public.fitness_goals (user_id, is_active);
alter table public.fitness_goals enable row level security;
revoke all on public.fitness_goals from anon;
grant select, insert, update on public.fitness_goals to authenticated;
create policy "goals_select_own" on public.fitness_goals for select to authenticated using (auth.uid() = user_id);
create policy "goals_insert_own" on public.fitness_goals for insert to authenticated with check (auth.uid() = user_id);
create policy "goals_update_own" on public.fitness_goals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger goals_updated_at before update on public.fitness_goals for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- training_preferences
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.training_preferences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  experience      text not null check (experience in ('beginner','intermediate','advanced')),
  days_per_week   int not null check (days_per_week between 1 and 7),
  preferred_days  text[] not null default '{}',
  session_minutes int not null default 45 check (session_minutes between 10 and 240),
  equipment       text[] not null default '{}',
  cardio_pref     text check (cardio_pref in ('none','light','moderate','lots')),
  injuries        text,
  diet_pref       text check (diet_pref in ('none','vegetarian','vegan','pescatarian','halal','kosher','other')),
  sleep_hours_avg numeric check (sleep_hours_avg between 0 and 24),
  activity_level  text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists training_prefs_user_idx on public.training_preferences (user_id);
alter table public.training_preferences enable row level security;
revoke all on public.training_preferences from anon;
grant select, insert, update on public.training_preferences to authenticated;
create policy "prefs_select_own" on public.training_preferences for select to authenticated using (auth.uid() = user_id);
create policy "prefs_insert_own" on public.training_preferences for insert to authenticated with check (auth.uid() = user_id);
create policy "prefs_update_own" on public.training_preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger prefs_updated_at before update on public.training_preferences for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- fitness_plans — generated plan; one active per user.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.fitness_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  plan          jsonb not null,
  source        text not null default 'deterministic' check (source in ('deterministic','llm','manual')),
  version       int not null default 1,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  superseded_at timestamptz
);
create unique index if not exists fitness_plans_one_active on public.fitness_plans (user_id) where is_active;
create index if not exists fitness_plans_user_idx on public.fitness_plans (user_id, created_at desc);
alter table public.fitness_plans enable row level security;
revoke all on public.fitness_plans from anon;
grant select, insert, update on public.fitness_plans to authenticated;
create policy "plans_select_own" on public.fitness_plans for select to authenticated using (auth.uid() = user_id);
create policy "plans_insert_own" on public.fitness_plans for insert to authenticated with check (auth.uid() = user_id);
create policy "plans_update_own" on public.fitness_plans for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- daily_checkins
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_checkins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  sleep_hours  numeric check (sleep_hours between 0 and 24),
  energy       int check (energy between 1 and 5),
  soreness     int check (soreness between 1 and 5),
  mood         int check (mood between 1 and 5),
  bodyweight_kg numeric check (bodyweight_kg between 25 and 400),
  notes        text,
  created_at   timestamptz not null default now(),
  unique (user_id, checkin_date)
);
create index if not exists checkins_user_idx on public.daily_checkins (user_id, checkin_date desc);
alter table public.daily_checkins enable row level security;
revoke all on public.daily_checkins from anon;
grant select, insert, update, delete on public.daily_checkins to authenticated;
create policy "checkins_select_own" on public.daily_checkins for select to authenticated using (auth.uid() = user_id);
create policy "checkins_insert_own" on public.daily_checkins for insert to authenticated with check (auth.uid() = user_id);
create policy "checkins_update_own" on public.daily_checkins for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "checkins_delete_own" on public.daily_checkins for delete to authenticated using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- workout_logs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.workout_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workout_date    date not null,
  type            text,
  exercises       jsonb not null default '[]',
  duration_min    int check (duration_min between 0 and 600),
  perceived_effort int check (perceived_effort between 1 and 10),
  completed       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists workouts_user_idx on public.workout_logs (user_id, workout_date desc);
alter table public.workout_logs enable row level security;
revoke all on public.workout_logs from anon;
grant select, insert, update, delete on public.workout_logs to authenticated;
create policy "workouts_select_own" on public.workout_logs for select to authenticated using (auth.uid() = user_id);
create policy "workouts_insert_own" on public.workout_logs for insert to authenticated with check (auth.uid() = user_id);
create policy "workouts_update_own" on public.workout_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workouts_delete_own" on public.workout_logs for delete to authenticated using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- nutrition_logs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.nutrition_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  log_date    date not null,
  description text,
  calories    numeric check (calories between 0 and 20000),
  protein_g   numeric check (protein_g between 0 and 1000),
  carbs_g     numeric check (carbs_g between 0 and 2000),
  fat_g       numeric check (fat_g between 0 and 1000),
  source      text not null default 'manual' check (source in ('manual','photo','telegram')),
  confidence  text check (confidence in ('low','medium','high')),
  created_at  timestamptz not null default now()
);
create index if not exists nutrition_user_idx on public.nutrition_logs (user_id, log_date desc);
alter table public.nutrition_logs enable row level security;
revoke all on public.nutrition_logs from anon;
grant select, insert, update, delete on public.nutrition_logs to authenticated;
create policy "nutrition_select_own" on public.nutrition_logs for select to authenticated using (auth.uid() = user_id);
create policy "nutrition_insert_own" on public.nutrition_logs for insert to authenticated with check (auth.uid() = user_id);
create policy "nutrition_update_own" on public.nutrition_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "nutrition_delete_own" on public.nutrition_logs for delete to authenticated using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_messages — coaching transcript.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.agent_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','assistant','system')),
  channel    text not null default 'web' check (channel in ('web','telegram')),
  content    text not null,
  grounding  jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_user_idx on public.agent_messages (user_id, created_at desc);
alter table public.agent_messages enable row level security;
revoke all on public.agent_messages from anon;
grant select, insert on public.agent_messages to authenticated;
create policy "messages_select_own" on public.agent_messages for select to authenticated using (auth.uid() = user_id);
create policy "messages_insert_own" on public.agent_messages for insert to authenticated with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- plan_adjustment_proposals — LLM/system proposes; nothing applied without approval.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.plan_adjustment_proposals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  proposed_change jsonb not null,
  rationale       text,
  source          text not null check (source in ('llm','deterministic','system')),
  status          text not null default 'pending' check (status in ('pending','approved','applied','rejected','expired')),
  idempotency_key text not null,
  applied_plan_id uuid references public.fitness_plans(id),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  unique (user_id, idempotency_key)
);
create index if not exists proposals_user_idx on public.plan_adjustment_proposals (user_id, status, created_at desc);
alter table public.plan_adjustment_proposals enable row level security;
revoke all on public.plan_adjustment_proposals from anon;
grant select, insert, update on public.plan_adjustment_proposals to authenticated;
create policy "proposals_select_own" on public.plan_adjustment_proposals for select to authenticated using (auth.uid() = user_id);
create policy "proposals_insert_own" on public.plan_adjustment_proposals for insert to authenticated with check (auth.uid() = user_id);
create policy "proposals_update_own" on public.plan_adjustment_proposals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- telegram_identities — link a Telegram account to a user (Phase 6).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.telegram_identities (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  telegram_user_id     text unique,
  telegram_chat_id     text,
  link_code            text,
  link_code_expires_at timestamptz,
  linked_at            timestamptz,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);
create index if not exists tg_user_idx on public.telegram_identities (user_id);
create index if not exists tg_link_code_idx on public.telegram_identities (link_code);
alter table public.telegram_identities enable row level security;
revoke all on public.telegram_identities from anon;
grant select, insert, update, delete on public.telegram_identities to authenticated;
create policy "tg_select_own" on public.telegram_identities for select to authenticated using (auth.uid() = user_id);
create policy "tg_insert_own" on public.telegram_identities for insert to authenticated with check (auth.uid() = user_id);
create policy "tg_update_own" on public.telegram_identities for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tg_delete_own" on public.telegram_identities for delete to authenticated using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs — append-only via SECURITY DEFINER fn; user can read own.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_user_idx on public.audit_logs (user_id, created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon;
grant select on public.audit_logs to authenticated; -- no client insert; definer fn only
create policy "audit_select_own" on public.audit_logs for select to authenticated using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- usage_counters — per-user quotas; mutate via SECURITY DEFINER fn only.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.usage_counters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  window_key text not null,
  count      int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, window_key)
);
create index if not exists usage_user_idx on public.usage_counters (user_id, window_key);
alter table public.usage_counters enable row level security;
revoke all on public.usage_counters from anon;
grant select on public.usage_counters to authenticated; -- no client mutate; definer fn only
create policy "usage_select_own" on public.usage_counters for select to authenticated using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER functions — derive the user from auth.uid(), never a parameter.
-- ─────────────────────────────────────────────────────────────────────────────

-- Atomically activate a new plan: supersede the old active plan, insert the new one.
create or replace function public.activate_fitness_plan(p_plan jsonb, p_source text default 'deterministic')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_version int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  update public.fitness_plans set is_active = false, superseded_at = now()
    where user_id = v_uid and is_active;
  select coalesce(max(version), 0) + 1 into v_version from public.fitness_plans where user_id = v_uid;
  insert into public.fitness_plans (user_id, plan, source, version, is_active)
    values (v_uid, p_plan, coalesce(p_source, 'deterministic'), v_version, true)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.activate_fitness_plan(jsonb, text) from anon;
grant execute on function public.activate_fitness_plan(jsonb, text) to authenticated;

-- Append an audit entry for the current user.
create or replace function public.append_audit_log(p_action text, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.audit_logs (user_id, action, meta) values (v_uid, p_action, coalesce(p_meta, '{}'));
end;
$$;
revoke all on function public.append_audit_log(text, jsonb) from anon;
grant execute on function public.append_audit_log(text, jsonb) to authenticated;

-- Atomically increment a usage counter; returns TRUE if the action is allowed (under the limit).
create or replace function public.increment_usage(p_window_key text, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.usage_counters (user_id, window_key, count, updated_at)
    values (v_uid, p_window_key, 1, now())
  on conflict (user_id, window_key) do update
    set count = public.usage_counters.count + 1, updated_at = now()
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.increment_usage(text, int) from anon;
grant execute on function public.increment_usage(text, int) to authenticated;

-- Approve a pending proposal and apply it as the new active plan. Owner-scoped via auth.uid().
create or replace function public.approve_plan_proposal(p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_change jsonb;
  v_plan_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select proposed_change into v_change from public.plan_adjustment_proposals
    where id = p_proposal_id and user_id = v_uid and status = 'pending';
  if v_change is null then raise exception 'proposal not found or not pending'; end if;
  v_plan_id := public.activate_fitness_plan(v_change, 'llm');
  update public.plan_adjustment_proposals
    set status = 'applied', decided_at = now(), applied_plan_id = v_plan_id
    where id = p_proposal_id and user_id = v_uid;
  insert into public.audit_logs (user_id, action, meta)
    values (v_uid, 'plan_proposal_applied', jsonb_build_object('proposal_id', p_proposal_id, 'plan_id', v_plan_id));
  return v_plan_id;
end;
$$;
revoke all on function public.approve_plan_proposal(uuid) from anon;
grant execute on function public.approve_plan_proposal(uuid) to authenticated;

notify pgrst, 'reload schema';
