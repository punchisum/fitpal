-- 0005_checkin_state.sql — guided /checkin flow state on the Telegram identity.
alter table public.telegram_identities
  add column if not exists checkin_step    int   not null default 0,
  add column if not exists checkin_answers jsonb not null default '{}';

notify pgrst, 'reload schema';
