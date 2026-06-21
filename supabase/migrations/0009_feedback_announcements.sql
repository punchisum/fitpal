-- 0009_feedback_announcements.sql — user feedback + admin broadcast log.

create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon;
grant select on public.feedback to authenticated;
create policy "feedback_select_own" on public.feedback for select to authenticated using (auth.uid() = user_id);
-- Inserts come from the Worker (service_role) via the 0003 default grants.

create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  sent_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated; -- admin/service_role only

notify pgrst, 'reload schema';
