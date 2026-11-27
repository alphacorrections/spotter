-- Stand-ins for what Supabase provides, so schema.sql can be tested on plain Postgres.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema auth to authenticated, anon;
-- Supabase's auth.uid() reads the signed-in user from the request's JWT claims.
-- Same definition Supabase ships: the signed-in user's id, from the request's JWT claims.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
