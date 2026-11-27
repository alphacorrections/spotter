-- Notifications. Same design as Tally: the server queues a note, sends the phone an empty wake-up,
-- and the phone asks for its queue. Every table here is server-only: no policies, no grants.
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1), pub text not null, priv jsonb not null, created_at timestamptz not null default now());
create table if not exists public.push_subs (
  endpoint text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  ua text not null default '', created_at timestamptz not null default now(), last_ok timestamptz, fails int not null default 0);
create index if not exists push_subs_user on public.push_subs (user_id);
-- What each person asked to be told about, and when. Nothing is sent to anyone without a row here.
create table if not exists public.push_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tz text not null default 'America/New_York', hour smallint not null default 17 check (hour between 0 and 23),
  train boolean not null default true, mobility boolean not null default false,
  friends boolean not null default true, weekly boolean not null default true, updated_at timestamptz not null default now());
create table if not exists public.push_queue (
  id bigserial primary key, endpoint text not null references public.push_subs(endpoint) on delete cascade,
  title text not null, body text not null default '', tag text not null default '', url text not null default '',
  created_at timestamptz not null default now(), fetched_at timestamptz);
create index if not exists push_queue_endpoint on public.push_queue (endpoint, fetched_at);
create table if not exists public.push_sent (
  user_id uuid not null references auth.users(id) on delete cascade, key text not null, at timestamptz not null default now(), primary key (user_id, key));

alter table public.push_keys enable row level security;
alter table public.push_subs enable row level security;
alter table public.push_prefs enable row level security;
alter table public.push_queue enable row level security;
alter table public.push_sent enable row level security;
revoke all on public.push_keys, public.push_subs, public.push_prefs, public.push_queue, public.push_sent from anon, authenticated;
revoke all on sequence public.push_queue_id_seq from anon, authenticated;

-- Hourly tick. The push function decides who is due something, in their own time zone.
-- Skipped where the scheduler is not installed (the throwaway test database).
do $do$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then return; end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  perform cron.unschedule(jobid) from cron.job where jobname = 'spotter-push';
  perform cron.schedule('spotter-push', '7 * * * *',
    $$select net.http_post(
        url := 'https://wypwbwprnjpfmqzywddh.supabase.co/functions/v1/push',
        body := '{"tick":true}'::jsonb,
        headers := '{"Content-Type":"application/json"}'::jsonb)$$);
end
$do$;
