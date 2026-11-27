-- Each kind of notification gets its own time. Mobility can have several a day.
alter table public.push_prefs
  add column if not exists train_hour smallint not null default 17 check (train_hour between 0 and 23),
  add column if not exists mobility_hours smallint[] not null default '{7}',
  add column if not exists weekly_day smallint not null default 0 check (weekly_day between 0 and 6),
  add column if not exists weekly_hour smallint not null default 18 check (weekly_hour between 0 and 23);
