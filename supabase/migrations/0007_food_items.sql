-- 0007_food_items.sql — keep the per-item breakdown on drafts and logs.
alter table public.nutrition_drafts add column if not exists items jsonb not null default '[]';
alter table public.nutrition_logs   add column if not exists items jsonb not null default '[]';

notify pgrst, 'reload schema';
