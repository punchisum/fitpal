-- 0003_service_role_grants.sql — grant the trusted server role full DML.
-- service_role is used ONLY server-side (Worker / Trigger jobs) and bypasses RLS by design;
-- every server query scopes by user_id explicitly. RLS still fully protects the client keys
-- (anon / authenticated). This restores the default Supabase posture our raw migration skipped.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Future tables/sequences too.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

notify pgrst, 'reload schema';
