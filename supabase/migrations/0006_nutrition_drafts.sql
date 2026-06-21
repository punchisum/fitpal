-- 0006_nutrition_drafts.sql — pending food estimates awaiting Confirm/Adjust (draft-confirm protocol).
create table if not exists public.nutrition_drafts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  description   text,
  calories      numeric,
  protein_g     numeric,
  carbs_g       numeric,
  fat_g         numeric,
  base_calories numeric,   -- original estimate before adjustments
  confidence    text,
  source        text not null default 'telegram',
  created_at    timestamptz not null default now()
);
create index if not exists nutrition_drafts_user_idx on public.nutrition_drafts (user_id, created_at desc);
alter table public.nutrition_drafts enable row level security;
revoke all on public.nutrition_drafts from anon;
grant select on public.nutrition_drafts to authenticated;
create policy "drafts_select_own" on public.nutrition_drafts for select to authenticated using (auth.uid() = user_id);
-- service_role (the Worker) gets full DML via the default-privileges grant from 0003.

notify pgrst, 'reload schema';
