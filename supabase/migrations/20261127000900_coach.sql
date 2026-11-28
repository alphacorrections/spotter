-- Ask Coach: how many questions each person has asked today. Server-only, like the push tables:
-- row level security is on with no policies, so only the server function can read or write it.
create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  n       int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
