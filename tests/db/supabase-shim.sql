-- Stand-ins for what Supabase provides, so schema.sql can be tested on plain Postgres.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema auth to authenticated, anon;
-- Supabase grants everything on new public tables and functions to the API roles by default.
-- Mirror that, so the tests prove the schema locks things down itself and does not rely on a bare database.
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
-- Supabase's auth.uid() reads the signed-in user from the request's JWT claims.
-- Same definition Supabase ships: the signed-in user's id, from the request's JWT claims.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
