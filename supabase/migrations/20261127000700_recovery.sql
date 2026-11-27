-- Heat and cold: sauna, steam, hot tub, cold plunge, cold shower, contrast.
-- A sixth kind of activity. It shows in the feed like anything else, but it does not
-- send friends a "finished a workout" notification: a daily sauna would be noise.
insert into public.domains (key, label, effort_label, sort) values ('recovery', 'Heat and cold', 'Round', 6)
  on conflict (key) do nothing;

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
    if new.ended_at is not null and (tg_op = 'INSERT' or old.ended_at is null) and new.source <> 'import' and new.domain <> 'recovery' and new.started_at > now() - interval '1 day' then
      for r in select o.user_id, bool_and(m.detail_level = 'full') as full from public.group_members m
               join public.group_members o on o.group_id = m.group_id and o.user_id <> m.user_id where m.user_id = new.user_id group by o.user_id loop
        perform public.notify_user(r.user_id, 'workout', who || ' finished a workout', case when r.full then new.title else '' end, '#friends');
      end loop;
    end if;
  end if;
  return new;
end $fn$;
