-- 0010_coaches.sql — coach allowlist for the CoachOS panel.
-- A coach can view ALL users' data (server-side, via the service-role client) ONLY after
-- the app confirms the logged-in user is in this table. Membership is granted out-of-band
-- (seed script / service_role); users cannot add themselves.

create table if not exists public.coaches (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.coaches enable row level security;
revoke all on public.coaches from anon;
grant select on public.coaches to authenticated;
-- A logged-in user may check whether THEY themselves are a coach (used by requireCoach()).
create policy "coach_select_self" on public.coaches for select to authenticated using (auth.uid() = user_id);
-- No insert/update/delete policy → only service_role can grant coach access.

notify pgrst, 'reload schema';
