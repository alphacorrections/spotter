-- Group activity: an in-app list (the bell) plus a push for each thing that happens in your groups.
-- Database triggers write the notices, so nothing depends on the other person's phone doing it.
create table if not exists public.notices (
  id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, title text not null, body text not null default '', url text not null default '',
  created_at timestamptz not null default now(), read_at timestamptz);
create index if not exists notices_user on public.notices (user_id, created_at desc);
alter table public.notices enable row level security;
revoke all on public.notices from anon, authenticated;
grant select on public.notices to authenticated;
grant update (read_at) on public.notices to authenticated;
drop policy if exists notices_own_read on public.notices;
create policy notices_own_read on public.notices for select to authenticated using (user_id = auth.uid());
drop policy if exists notices_own_mark on public.notices;
create policy notices_own_mark on public.notices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.push_queue add column if not exists pending boolean not null default false;

-- One place decides whether a person hears about something: their own switches, then the list, then their phones.
create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_url text)
returns void language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  if coalesce((select (settings -> 'notify' ->> p_kind)::boolean from public.profile_private where user_id = p_user), true) is false then return; end if;
  insert into public.notices (user_id, kind, title, body, url) values (p_user, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 300), coalesce(p_url, ''));
  if p_kind = 'workout' and coalesce((select friends from public.push_prefs where user_id = p_user), true) is false then return; end if;
  insert into public.push_queue (endpoint, title, body, tag, url, pending)
    select endpoint, left(p_title, 120), left(coalesce(p_body, ''), 300), p_kind, coalesce(p_url, ''), true from public.push_subs where user_id = p_user;
  get diagnostics n = row_count;
  if n > 0 and exists (select 1 from pg_extension where extname = 'pg_net') then
    execute $q$select net.http_post(url := 'https://wypwbwprnjpfmqzywddh.supabase.co/functions/v1/nudge', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)$q$;
  end if;
end $fn$;
revoke all on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.tg_notice() returns trigger language plpgsql security definer set search_path = public as $fn$
declare who text; owner uuid; ttl text; r record;
begin
  select coalesce(nullif(display_name, ''), 'Someone') into who from public.profiles where id = new.user_id;
  who := coalesce(who, 'Someone');
  if tg_table_name = 'group_members' then
    select name into ttl from public.groups where id = new.group_id;
    for r in select user_id from public.group_members where group_id = new.group_id and user_id <> new.user_id loop
      perform public.notify_user(r.user_id, 'join', who || ' joined ' || coalesce(ttl, 'your group'), 'Say hello on the Friends tab.', '#friends');
    end loop;
  elsif tg_table_name = 'reactions' then
    select user_id, title into owner, ttl from public.activities where id = new.activity_id;
    if owner is not null and owner <> new.user_id then perform public.notify_user(owner, 'react', who || ' reacted ' || new.emoji, coalesce(ttl, ''), '#friends'); end if;
  elsif tg_table_name = 'comments' then
    if new.activity_id is not null then
      select user_id, title into owner, ttl from public.activities where id = new.activity_id;
      if owner is not null and owner <> new.user_id then perform public.notify_user(owner, 'comment', who || ' commented on ' || coalesce(ttl, 'your workout'), new.body, '#friends'); end if;
    end if;
  elsif tg_table_name = 'activities' then
    if new.ended_at is not null and (tg_op = 'INSERT' or old.ended_at is null) and new.source <> 'import' and new.started_at > now() - interval '1 day' then
      for r in select o.user_id, bool_and(m.detail_level = 'full') as full from public.group_members m
               join public.group_members o on o.group_id = m.group_id and o.user_id <> m.user_id where m.user_id = new.user_id group by o.user_id loop
        perform public.notify_user(r.user_id, 'workout', who || ' finished a workout', case when r.full then new.title else '' end, '#friends');
      end loop;
    end if;
  end if;
  return new;
end $fn$;
drop trigger if exists notice_join on public.group_members;
create trigger notice_join after insert on public.group_members for each row execute function public.tg_notice();
drop trigger if exists notice_react on public.reactions;
create trigger notice_react after insert on public.reactions for each row execute function public.tg_notice();
drop trigger if exists notice_comment on public.comments;
create trigger notice_comment after insert on public.comments for each row execute function public.tg_notice();
drop trigger if exists notice_workout on public.activities;
create trigger notice_workout after insert or update of ended_at on public.activities for each row execute function public.tg_notice();
