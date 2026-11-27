-- Linked wearables. Tokens live here and nowhere else: server-only, no policies, no grants.
create table if not exists public.wearable_links (
  user_id uuid not null references auth.users(id) on delete cascade, provider text not null check (provider in ('oura', 'garmin')),
  access_token text not null, refresh_token text, expires_at timestamptz not null, linked_at timestamptz not null default now(),
  last_sync timestamptz, last_error text, primary key (user_id, provider));
create table if not exists public.oauth_states (
  state text primary key, user_id uuid not null references auth.users(id) on delete cascade, provider text not null, created_at timestamptz not null default now());
alter table public.wearable_links enable row level security;
alter table public.oauth_states enable row level security;
revoke all on public.wearable_links, public.oauth_states from anon, authenticated;
do $do$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') or not exists (select 1 from pg_available_extensions where name = 'pg_net') then return; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'spotter-oura';
  perform cron.schedule('spotter-oura', '23 * * * *',
    $$select net.http_post(url := 'https://wypwbwprnjpfmqzywddh.supabase.co/functions/v1/oura', body := '{"tick":true}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)$$);
end
$do$;
