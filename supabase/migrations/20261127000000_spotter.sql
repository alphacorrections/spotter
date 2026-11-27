-- =====================================================================
-- Spotter · database · Supabase (Postgres 15+)
--
-- Shape: one activity model for five domains.
--   activity  = one dated session (any domain)
--   effort    = one unit of work inside it (a set, an interval, a hold,
--               a flow, or a whole day of walking)
-- Everything measured lives on efforts. Activities carry only what a
-- "names only" group member is allowed to see.
--
-- Privacy model, enforced by row level security:
--   own-only ........ profile_private, session_checkins, body_metrics,
--                     daily_health, nutrition_targets, block_changes,
--                     saved_links
--   group-visible ... profiles, activities, blocks on a group block
--   detail-gated .... efforts (only where the owner set that group to 'full')
--
-- Offline: every row a phone creates uses a client-generated uuid as its
-- primary key, so a queued write can be replayed as an upsert safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------

-- Adding a sixth domain is one insert here, not a migration.
create table public.domains (
  key           text primary key,
  label         text not null,
  effort_label  text not null,          -- what one effort is called in this domain
  sort          smallint not null default 0
);

insert into public.domains (key, label, effort_label, sort) values
  ('strength', 'Strength', 'Set',       1),
  ('cardio',   'Cardio',   'Interval',  2),
  ('yoga',     'Yoga',     'Flow',      3),
  ('mobility', 'Mobility', 'Movement',  4),
  ('walking',  'Walking',  'Day',       5);

-- ---------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------

-- What your group can see about you: a name, nothing else.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  created_at    timestamptz not null default now()
);

-- Everything else about you. Never visible to anyone but you.
create table public.profile_private (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  units            text not null default 'lb' check (units in ('lb', 'kg')),
  -- Onboarding answers
  days_per_week    smallint check (days_per_week between 1 and 7),
  session_minutes  smallint check (session_minutes between 10 and 240),
  equipment        text[] not null default '{}',
  -- [{ "exercise_id": "...", "tag": "low_back", "reason": "pain", "since": "2026-11-24" }]
  no_go            jsonb not null default '[]'::jsonb,
  -- Default load jumps, in the user's units. Editable.
  increments       jsonb not null default '{"upper": 5, "lower": 10}'::jsonb,
  -- Only used to estimate maintenance calories when the user does not know theirs
  sex_for_estimate text check (sex_for_estimate in ('male', 'female')),
  birth_year       smallint check (birth_year between 1900 and 2100),
  height_cm        numeric(5, 1) check (height_cm between 90 and 250),
  activity_level   text check (activity_level in ('sedentary', 'light', 'moderate', 'very')),
  -- App preferences that follow you between devices: training focus, whether setup is done
  settings         jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Exercise library
-- ---------------------------------------------------------------------

-- Seeded from free-exercise-db (ids kept as-is), plus built-ins we add,
-- plus anything a user creates for themselves.
create table public.exercises (
  id                 text primary key,
  name               text not null,
  domain             text not null default 'strength' references public.domains (key),
  source             text not null default 'free-exercise-db'
                       check (source in ('free-exercise-db', 'builtin', 'user')),
  owner_id           uuid references public.profiles (id) on delete cascade,
  equipment          text,
  mechanic           text,
  force              text,
  primary_muscles    text[] not null default '{}',
  secondary_muscles  text[] not null default '{}',
  -- Drives the default increment: 5 upper, 10 lower
  region             text check (region in ('upper', 'lower', 'core', 'full')),
  load_type          text not null default 'external'
                       check (load_type in ('external', 'bodyweight', 'bodyweight_plus', 'assisted')),
  -- How the number in the weight box is meant: both dumbbells added up, or one
  load_entry         text not null default 'total' check (load_entry in ('total', 'per_hand')),
  measure            text not null default 'reps' check (measure in ('reps', 'seconds')),
  unilateral         boolean not null default false,
  tags               text[] not null default '{}',     -- e.g. low_back_friendly
  images             text[] not null default '{}',
  instructions       text[] not null default '{}',
  created_at         timestamptz not null default now(),
  check ((source = 'user') = (owner_id is not null)),
  -- User-made ids live in their own namespace so they can never shadow the library
  check ((source = 'user') = (id like 'u\_%'))
);

create index exercises_owner_idx on public.exercises (owner_id) where owner_id is not null;

-- ---------------------------------------------------------------------
-- Groups (declared before blocks, which point at group_blocks)
-- ---------------------------------------------------------------------

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  -- Six characters, no expiry. Alphabet leaves out 0 O 1 I L.
  code        text not null unique check (code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id      uuid not null references public.groups (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  -- What THIS member shows THIS group. Full is the default you chose.
  detail_level  text not null default 'full' check (detail_level in ('full', 'names_only')),
  joined_at     timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

-- ---------------------------------------------------------------------
-- Programs and blocks
-- ---------------------------------------------------------------------

-- A program is a template: read whole, versioned whole, copied whole.
-- That is why it is one JSON document and not twelve joined tables.
-- Its shape is fixed by templates/program-template.schema.json.
create table public.programs (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null,
  version        int  not null default 1,
  owner_id       uuid references public.profiles (id) on delete set null,
  is_builtin     boolean not null default false,
  title          text not null,
  focus          text not null check (focus in ('hypertrophy', 'strength', 'maintain', 'general')),
  weeks          smallint not null check (weeks between 1 and 52),
  days_per_week  smallint not null check (days_per_week between 1 and 7),
  template       jsonb not null,
  created_at     timestamptz not null default now()
);

-- A slug is unique per owner, so two people can each publish their own "my-block".
create unique index programs_owner_slug_idx
  on public.programs (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), slug, version);

-- One person publishes a program to a group; others run it.
create table public.group_blocks (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  program_id  uuid not null references public.programs (id) on delete restrict,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  started_on  date not null default current_date,
  created_at  timestamptz not null default now()
);

create index group_blocks_group_idx on public.group_blocks (group_id);

-- A block is one person's run of a program.
-- `plan` is their own copy of the template. A swap edits the copy and
-- never touches the program or anyone else's block.
create table public.blocks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  program_id       uuid references public.programs (id) on delete set null,
  -- Built-in programs ship inside the app, so a block started from one records the slug instead
  program_slug     text,
  group_block_id   uuid references public.group_blocks (id) on delete set null,
  title            text not null,
  focus            text not null check (focus in ('hypertrophy', 'strength', 'maintain', 'general')),
  nutrition_phase  text check (nutrition_phase in ('cut', 'bulk', 'maintain', 'recomp')),
  plan             jsonb not null,
  status           text not null default 'active'
                     check (status in ('active', 'paused', 'done', 'abandoned')),
  -- Missed days shift the block forward, so progress is a position in the
  -- rotation and not a calendar date. Week = position / rotation length + 1.
  position         int not null default 0 check (position >= 0),
  started_on       date not null default current_date,
  finished_on      date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index blocks_user_idx on public.blocks (user_id, status);
create index blocks_group_block_idx on public.blocks (group_block_id) where group_block_id is not null;

-- Why a slot changed. A swap made for pain must never silently come back,
-- so the reason is recorded, not inferred.
create table public.block_changes (
  id             uuid primary key default gen_random_uuid(),
  block_id       uuid not null references public.blocks (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  slot_key       text not null,
  from_exercise  text references public.exercises (id),
  to_exercise    text references public.exercises (id),
  scope          text not null check (scope in ('today', 'block')),
  reason         text not null check (reason in ('pain', 'equipment', 'preference')),
  note           text,
  changed_at     timestamptz not null default now()
);

create index block_changes_block_idx on public.block_changes (block_id, changed_at desc);

-- ---------------------------------------------------------------------
-- The activity model
-- ---------------------------------------------------------------------

create table public.activities (
  id           uuid primary key,                       -- generated on the phone
  user_id      uuid not null references public.profiles (id) on delete cascade,
  domain       text not null references public.domains (key),
  title        text not null,
  -- Where it sits in a plan, if it came from one
  block_id     uuid references public.blocks (id) on delete set null,
  week         smallint check (week >= 1),
  session_key  text,                                   -- e.g. 'legs_a'
  started_at   timestamptz not null,
  ended_at     timestamptz,
  duration_s   int check (duration_s >= 0),
  -- A class or video followed elsewhere (a yoga membership, say)
  link_url     text,
  -- A line the owner wrote for the feed. Private notes go in session_checkins
  note         text check (char_length(note) <= 500),
  source       text not null default 'manual'
                 check (source in ('manual', 'oura', 'garmin', 'strava', 'whoop')),
  external_id  text,                                   -- the vendor's id, for de-duping syncs
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  unique (id, user_id)                                 -- lets efforts prove they share an owner
);

create index activities_user_time_idx on public.activities (user_id, started_at desc);
create unique index activities_external_idx
  on public.activities (user_id, source, external_id) where external_id is not null;

create table public.efforts (
  id            uuid primary key,                      -- generated on the phone
  activity_id   uuid not null,
  user_id       uuid not null,
  seq           smallint not null check (seq >= 0),    -- order inside the session
  exercise_id   text references public.exercises (id),
  -- Which slot of the plan this fulfilled. History for progression is read
  -- by exercise, so a swap starts its own line automatically.
  slot_key      text,
  set_number    smallint check (set_number >= 1),
  kind          text not null default 'work' check (kind in (
                  'work', 'warmup',
                  'drop', 'rest_pause', 'myo', 'partials', 'amrap',   -- strength extras
                  'interval', 'steady',                               -- cardio
                  'hold', 'flow', 'movement',                         -- yoga, mobility
                  'day')),                                            -- walking
  -- Extras hang off the set they extend (a drop set off the last work set)
  parent_id     uuid references public.efforts (id) on delete cascade,

  -- Strength
  weight        numeric(7, 2) check (weight >= 0),     -- null = bodyweight
  weight_unit   text check (weight_unit in ('lb', 'kg')),
  reps          numeric(5, 1) check (reps >= 0),       -- one decimal: half reps happen
  rir           numeric(3, 1) check (rir between 0 and 10),
  per_side      boolean not null default false,

  -- Time, distance, heart rate (cardio, holds, walking)
  duration_s    int check (duration_s >= 0),
  distance_m    numeric(9, 1) check (distance_m >= 0),
  steps         int check (steps >= 0),
  avg_hr        smallint check (avg_hr between 20 and 250),
  hr_zone       smallint check (hr_zone between 1 and 5),

  -- What was asked for, frozen at log time, so a verdict can always be re-derived
  target_weight     numeric(7, 2),
  target_reps_low   smallint,
  target_reps_high  smallint,
  verdict       text check (verdict in ('first', 'beat', 'held', 'big_jump', 'down')),

  extra         jsonb not null default '{}'::jsonb,    -- anything domain-specific not worth a column
  note          text,
  logged_at     timestamptz not null default now(),

  foreign key (activity_id, user_id) references public.activities (id, user_id) on delete cascade
);

-- The query the coach runs most: "this lift, most recent first".
create index efforts_history_idx on public.efforts (user_id, exercise_id, logged_at desc)
  where exercise_id is not null;
create index efforts_activity_idx on public.efforts (activity_id, seq);

-- ---------------------------------------------------------------------
-- Private tracking
-- ---------------------------------------------------------------------

-- The one-tap check-in at the end of a session. Feeds the deload rule.
-- Kept out of activities so it never reaches a group feed.
create table public.session_checkins (
  activity_id  uuid primary key,
  user_id      uuid not null,
  rating       smallint not null check (rating between 1 and 5),  -- 1 rough .. 5 great
  note         text,
  created_at   timestamptz not null default now(),
  foreign key (activity_id, user_id) references public.activities (id, user_id) on delete cascade
);

create index session_checkins_user_idx on public.session_checkins (user_id, created_at desc);

create table public.body_metrics (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  measured_on  date not null,
  kind         text not null check (kind in (
                 'weight', 'body_fat_pct', 'waist', 'chest', 'hips', 'arm', 'thigh', 'calf', 'neck', 'shoulders')),
  value        numeric(6, 2) not null check (value > 0),
  unit         text not null check (unit in ('lb', 'kg', 'in', 'cm', 'pct')),
  primary key (user_id, measured_on, kind)
);

-- One row per person, per day, per source. Filled by wearable sync or by hand.
create table public.daily_health (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  day            date not null,
  source         text not null check (source in ('manual', 'oura', 'garmin', 'whoop')),
  steps          int check (steps >= 0),
  sleep_minutes  smallint check (sleep_minutes between 0 and 1440),
  sleep_score    smallint check (sleep_score between 0 and 100),
  readiness      smallint check (readiness between 0 and 100),
  resting_hr     smallint check (resting_hr between 20 and 150),
  hrv_ms         smallint check (hrv_ms between 0 and 400),
  synced_at      timestamptz not null default now(),
  primary key (user_id, day, source)
);

-- A calorie number and a protein number. A target, not a food log.
create table public.nutrition_targets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  effective_from      date not null default current_date,
  phase               text not null check (phase in ('cut', 'bulk', 'maintain', 'recomp')),
  maintenance_kcal    int not null check (maintenance_kcal between 800 and 8000),
  -- entered: the user knew it. estimated: from height, weight, age.
  -- adjusted: moved after comparing the scale to the expected rate.
  maintenance_source  text not null check (maintenance_source in ('entered', 'estimated', 'adjusted')),
  target_kcal         int not null check (target_kcal between 800 and 8000),
  protein_g           smallint check (protein_g between 20 and 500),
  created_at          timestamptz not null default now(),
  unique (user_id, effective_from)
);

-- Workouts seen somewhere else (a reel, a video, an article) and saved to try later.
create table public.saved_links (
  id          uuid primary key,                         -- generated on the phone
  user_id     uuid not null references public.profiles (id) on delete cascade,
  url         text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  title       text not null check (char_length(title) between 1 and 120),
  tag         text check (char_length(tag) <= 30),
  note        text check (char_length(note) <= 500),
  tried_on    date,
  created_at  timestamptz not null default now()
);

create index saved_links_user_idx on public.saved_links (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Feed
-- ---------------------------------------------------------------------

create table public.reactions (
  activity_id  uuid not null references public.activities (id) on delete cascade,
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  emoji        text not null check (char_length(emoji) between 1 and 16),
  created_at   timestamptz not null default now(),
  primary key (activity_id, group_id, user_id)
);

-- A comment hangs off a session, or off one week of a group block.
create table public.comments (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  activity_id     uuid references public.activities (id) on delete cascade,
  group_block_id  uuid references public.group_blocks (id) on delete cascade,
  week            smallint check (week >= 1),
  body            text not null check (char_length(body) between 1 and 1000),
  created_at      timestamptz not null default now(),
  check (
    (activity_id is not null and group_block_id is null and week is null)
    or (activity_id is null and group_block_id is not null and week is not null)
  )
);

create index comments_activity_idx on public.comments (activity_id) where activity_id is not null;
create index comments_block_week_idx on public.comments (group_block_id, week) where group_block_id is not null;

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profile_private_touch before update on public.profile_private
  for each row execute function public.touch_updated_at();
create trigger blocks_touch before update on public.blocks
  for each row execute function public.touch_updated_at();
create trigger activities_touch before update on public.activities
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Membership helpers
--
-- These run as the table owner on purpose. A policy on group_members that
-- queries group_members recurses forever; a definer function is the
-- standard way out. Each one answers a yes/no about the CALLER only.
-- ---------------------------------------------------------------------

create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = (select auth.uid())
  );
$$;

-- Do I share any group with this person?
create function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them using (group_id)
    where me.user_id = (select auth.uid()) and them.user_id = other
  );
$$;

-- Do I share a group in which this person shows full detail?
create function public.can_see_detail(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them using (group_id)
    where me.user_id = (select auth.uid())
      and them.user_id = other
      and them.detail_level = 'full'
  );
$$;

-- Six characters from an alphabet with no look-alikes: about 887 million codes.
create function public.new_group_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into candidate
      from generate_series(1, 6);
    exit when not exists (select 1 from public.groups g where g.code = candidate);
  end loop;
  return candidate;
end $$;

-- Groups are only ever created or joined through these two functions,
-- because a non-member cannot (and must not) read the groups table to
-- look a code up.
create function public.create_group(group_name text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  g  public.groups;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  insert into public.groups (name, code, created_by)
    values (group_name, public.new_group_code(), me)
    returning * into g;
  insert into public.group_members (group_id, user_id, role)
    values (g.id, me, 'owner');
  return g;
end $$;

create function public.join_group(join_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me  uuid := (select auth.uid());
  gid uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select g.id into gid from public.groups g where g.code = upper(trim(join_code));
  if gid is null then
    raise exception 'no group has that code';
  end if;
  insert into public.group_members (group_id, user_id)
    values (gid, me)
    on conflict do nothing;
  return gid;
end $$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

alter table public.domains            enable row level security;
alter table public.profiles           enable row level security;
alter table public.profile_private    enable row level security;
alter table public.exercises          enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.programs           enable row level security;
alter table public.group_blocks       enable row level security;
alter table public.blocks             enable row level security;
alter table public.block_changes      enable row level security;
alter table public.activities         enable row level security;
alter table public.efforts            enable row level security;
alter table public.session_checkins   enable row level security;
alter table public.body_metrics       enable row level security;
alter table public.daily_health       enable row level security;
alter table public.nutrition_targets  enable row level security;
alter table public.saved_links        enable row level security;
alter table public.reactions          enable row level security;
alter table public.comments           enable row level security;

-- Reference data: anyone signed in can read it, nobody can write it.
create policy domains_read on public.domains
  for select to authenticated using (true);

-- Profiles: you, and people you share a group with.
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_group(id));
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Own-only tables.
create policy profile_private_own on public.profile_private
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy session_checkins_own on public.session_checkins
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy body_metrics_own on public.body_metrics
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy daily_health_own on public.daily_health
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy nutrition_targets_own on public.nutrition_targets
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_links_own on public.saved_links
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy block_changes_own on public.block_changes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Exercises: the shared library, your own, and your groups' custom ones
-- (so a friend's session can show the name of a lift they made up).
create policy exercises_read on public.exercises
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()) or public.shares_group(owner_id));
create policy exercises_insert on public.exercises
  for insert to authenticated
  with check (source = 'user' and owner_id = (select auth.uid()));
create policy exercises_update on public.exercises
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (source = 'user' and owner_id = (select auth.uid()));
create policy exercises_delete on public.exercises
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Groups: members read. Creation and joining go through the functions above.
create policy groups_read on public.groups
  for select to authenticated using (public.is_member(id));
create policy groups_rename on public.groups
  for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

create policy group_members_read on public.group_members
  for select to authenticated using (public.is_member(group_id));
-- You may change how much YOU show a group, and you may leave.
create policy group_members_update_self on public.group_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy group_members_leave on public.group_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- Programs: built-ins, your own, and any that one of your groups is running.
create policy programs_read on public.programs
  for select to authenticated
  using (
    is_builtin
    or owner_id = (select auth.uid())
    or exists (
      select 1 from public.group_blocks gb
      where gb.program_id = programs.id and public.is_member(gb.group_id)
    )
  );
create policy programs_insert on public.programs
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and not is_builtin);
create policy programs_update on public.programs
  for update to authenticated
  using (owner_id = (select auth.uid()) and not is_builtin)
  with check (owner_id = (select auth.uid()) and not is_builtin);
create policy programs_delete on public.programs
  for delete to authenticated using (owner_id = (select auth.uid()) and not is_builtin);

create policy group_blocks_read on public.group_blocks
  for select to authenticated using (public.is_member(group_id));
create policy group_blocks_insert on public.group_blocks
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member(group_id));
create policy group_blocks_update on public.group_blocks
  for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy group_blocks_delete on public.group_blocks
  for delete to authenticated using (author_id = (select auth.uid()));

-- Blocks: yours to do anything with. Others in the group can read a block
-- that is a run of one of the group's blocks ("who is on which week").
create policy blocks_own on public.blocks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    -- You can only attach your block to a group block of a group you are in
    and (
      group_block_id is null
      or exists (
        select 1 from public.group_blocks gb
        where gb.id = blocks.group_block_id and public.is_member(gb.group_id)
      )
    )
  );
create policy blocks_group_read on public.blocks
  for select to authenticated
  using (
    group_block_id is not null
    and exists (
      select 1 from public.group_blocks gb
      where gb.id = blocks.group_block_id and public.is_member(gb.group_id)
    )
  );

-- Activities: the session shows in your groups. Efforts: only where you
-- left that group on full detail.
create policy activities_own on public.activities
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy activities_group_read on public.activities
  for select to authenticated using (public.shares_group(user_id));

create policy efforts_own on public.efforts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy efforts_group_read on public.efforts
  for select to authenticated using (public.can_see_detail(user_id));

-- Reactions and comments: inside a group you are in, on a session whose
-- owner is also in that group.
create policy reactions_read on public.reactions
  for select to authenticated using (public.is_member(group_id));
create policy reactions_insert on public.reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_member(group_id)
    and exists (
      select 1 from public.activities a
      join public.group_members m on m.user_id = a.user_id
      where a.id = reactions.activity_id and m.group_id = reactions.group_id
    )
  );
create policy reactions_delete on public.reactions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy comments_read on public.comments
  for select to authenticated using (public.is_member(group_id));
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_member(group_id)
    and (
      (activity_id is not null and exists (
        select 1 from public.activities a
        join public.group_members m on m.user_id = a.user_id
        where a.id = comments.activity_id and m.group_id = comments.group_id))
      or
      (group_block_id is not null and exists (
        select 1 from public.group_blocks gb
        where gb.id = comments.group_block_id and gb.group_id = comments.group_id))
    )
  );
create policy comments_delete on public.comments
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Grants. Nothing for signed-out visitors; RLS decides the rest.
-- ---------------------------------------------------------------------

-- Supabase hands every new public table and function to the API roles by default.
-- Take all of it back, then grant exactly what the app needs. Without this, the
-- column-level grants further down would mean nothing.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.domains to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.profile_private, public.exercises, public.programs, public.group_blocks,
  public.blocks, public.block_changes, public.activities, public.efforts,
  public.session_checkins, public.body_metrics, public.daily_health,
  public.nutrition_targets, public.saved_links, public.reactions, public.comments
  to authenticated;
-- Column grants, so a member cannot promote themselves or move a code.
grant select on public.groups to authenticated;
grant update (name) on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant update (detail_level) on public.group_members to authenticated;

grant execute on function
  public.is_member(uuid), public.shares_group(uuid), public.can_see_detail(uuid),
  public.create_group(text), public.join_group(text)
  to authenticated;
