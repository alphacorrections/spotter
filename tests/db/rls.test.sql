-- Privacy and permission tests for schema.sql.
-- Each line prints "ok - ..." or stops the run with an error.
\set ON_ERROR_STOP on
\set QUIET on
\set K '11111111-1111-1111-1111-111111111111'
\set J '22222222-2222-2222-2222-222222222222'
\set M '33333333-3333-3333-3333-333333333333'
\set S '99999999-9999-9999-9999-999999999999'
\set ACT 'aaaaaaaa-0000-0000-0000-000000000001'
\set E1 'eeeeeeee-0000-0000-0000-000000000001'
\set E2 'eeeeeeee-0000-0000-0000-000000000002'

-- ---------- test helpers ----------
create schema t;
create function t.be(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', who::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
create function t.rows(q text, expected bigint, label text) returns void language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') q' into n;
  if n is distinct from expected then
    raise exception 'NOT OK - %: expected % rows, got %', label, expected, n;
  end if;
  raise notice 'ok - %', label;
end $$;
create function t.fails(q text, label text) returns void language plpgsql as $$
declare failed boolean := false; why text;
begin
  begin
    execute q;
  exception when others then
    failed := true; why := sqlerrm;
  end;
  if not failed then
    raise exception 'NOT OK - %: statement was allowed', label;
  end if;
  raise notice 'ok - % (%)', label, left(why, 60);
end $$;
create function t.changes(q text, expected bigint, label text) returns void language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  if n is distinct from expected then
    raise exception 'NOT OK - %: expected % rows changed, got %', label, expected, n;
  end if;
  raise notice 'ok - %', label;
end $$;
grant usage on schema t to authenticated, anon;
grant execute on all functions in schema t to authenticated, anon;

-- ---------- people ----------
insert into auth.users (id, email) values
  (:'K', 'kevin@example.test'), (:'J', 'jake@example.test'),
  (:'M', 'mia@example.test'),   (:'S', 'stranger@example.test');

-- Library seed (done by the service role in real life)
insert into public.exercises (id, name, region) values
  ('Barbell_Hip_Thrust', 'Barbell Hip Thrust', 'lower'),
  ('Barbell_Curl', 'Barbell Curl', 'upper');

select t.be(:'K'); insert into public.profiles (id, display_name) values (:'K', 'Kevin');
select t.be(:'J'); insert into public.profiles (id, display_name) values (:'J', 'Jake');
select t.be(:'M'); insert into public.profiles (id, display_name) values (:'M', 'Mia');
select t.be(:'S'); insert into public.profiles (id, display_name) values (:'S', 'Stranger');

-- ---------- groups and codes ----------
select t.be(:'K');
select code as lifters_code, id as lifters from public.create_group('Lifters') \gset
select t.rows($$select 1 from public.groups where code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'$$, 1, 'group code is six unambiguous characters');

select t.be(:'S');
select t.rows('select 1 from public.groups', 0, 'a stranger cannot list groups or read a code');
select t.fails($$select public.join_group('ZZZZZZ')$$, 'a wrong code is rejected');

select t.be(:'J');
select public.join_group('  ' || lower(:'lifters_code') || ' ') as joined \gset
select t.rows('select 1 from public.group_members', 2, 'Jake joined with the code, typed lowercase with spaces');
select public.join_group(:'lifters_code') \gset again_
select t.rows('select 1 from public.group_members', 2, 'joining twice does not duplicate the membership');

-- ---------- Kevin logs a session ----------
select t.be(:'K');
insert into public.profile_private (user_id, height_cm, birth_year) values (:'K', 180, 1993);
insert into public.activities (id, user_id, domain, title, started_at, duration_s, session_key, week)
  values (:'ACT', :'K', 'strength', 'Legs A', now() - interval '1 hour', 3600, 'legs_a', 3);
insert into public.efforts (id, activity_id, user_id, seq, exercise_id, slot_key, set_number, weight, weight_unit, reps, target_weight, target_reps_low, target_reps_high, verdict)
  values (:'E1', :'ACT', :'K', 0, 'Barbell_Hip_Thrust', 'legs_a.2', 1, 225, 'lb', 8, 225, 8, 10, 'beat'),
         (:'E2', :'ACT', :'K', 1, 'Barbell_Hip_Thrust', 'legs_a.2', 2, 225, 'lb', 6.5, 225, 8, 10, 'down');
select t.rows('select 1 from public.efforts where reps = 6.5', 1, 'half reps are stored as logged');
insert into public.efforts (id, activity_id, user_id, seq, exercise_id, set_number, weight, weight_unit, reps)
  values (:'E2', :'ACT', :'K', 1, 'Barbell_Hip_Thrust', 2, 225, 'lb', 7)
  on conflict (id) do update set reps = excluded.reps;
select t.rows('select 1 from public.efforts', 2, 'replaying a queued offline write updates, never duplicates');
insert into public.session_checkins (activity_id, user_id, rating) values (:'ACT', :'K', 4);
insert into public.body_metrics (user_id, measured_on, kind, value, unit) values (:'K', current_date, 'weight', 205, 'lb');
insert into public.daily_health (user_id, day, source, sleep_minutes, sleep_score) values (:'K', current_date, 'oura', 460, 78);
insert into public.nutrition_targets (user_id, phase, maintenance_kcal, maintenance_source, target_kcal, protein_g)
  values (:'K', 'bulk', 2900, 'entered', 3200, 165);
insert into public.saved_links (id, user_id, url, title, tag) values (gen_random_uuid(), :'K', 'https://www.instagram.com/reel/abc123/', 'Cable shoulder circuit', 'Upper');
select t.fails($$insert into public.saved_links (id, user_id, url, title) values (gen_random_uuid(), auth.uid(), 'javascript:alert(1)', 'bad')$$, 'a saved link must be a web address');

-- ---------- what Jake (same group, full detail) can see ----------
select t.be(:'J');
select t.rows('select 1 from public.activities', 1, 'Jake sees Kevin''s session in the feed');
select t.rows('select 1 from public.efforts', 2, 'Jake sees the sets, weights and reps');
select t.rows($$select 1 from public.profiles where display_name = 'Kevin'$$, 1, 'Jake sees Kevin''s name');
select t.rows('select 1 from public.session_checkins', 0, 'Jake cannot see how the session felt');
select t.rows('select 1 from public.body_metrics', 0, 'Jake cannot see bodyweight');
select t.rows('select 1 from public.daily_health', 0, 'Jake cannot see sleep or recovery');
select t.rows('select 1 from public.nutrition_targets', 0, 'Jake cannot see calorie targets');
select t.rows('select 1 from public.saved_links', 0, 'Jake cannot see the workouts Kevin saved to try');
select t.rows('select 1 from public.profile_private', 0, 'Jake cannot see height, age or injuries');

-- ---------- what Jake must not be able to do ----------
select t.fails(format($$insert into public.efforts (id, activity_id, user_id, seq, reps) values (gen_random_uuid(), %L, %L, 9, 1)$$, :'ACT', :'K'),
  'Jake cannot log a set as Kevin');
select t.fails(format($$insert into public.efforts (id, activity_id, user_id, seq, reps) values (gen_random_uuid(), %L, %L, 9, 1)$$, :'ACT', :'J'),
  'Jake cannot slip his own set into Kevin''s session');
select t.changes($$update public.efforts set reps = 99$$, 0, 'Jake cannot edit Kevin''s sets');
select t.changes($$delete from public.activities$$, 0, 'Jake cannot delete Kevin''s session');
select t.fails($$update public.group_members set role = 'owner'$$, 'Jake cannot promote himself to owner');
select t.fails($$update public.groups set code = 'AAAAAA'$$, 'nobody can rewrite a group code');
select t.changes(format($$update public.group_members set detail_level = 'names_only' where user_id = %L$$, :'K'), 0,
  'Jake cannot change what Kevin shares');
select t.fails($$insert into public.group_members (group_id, user_id) select id, auth.uid() from public.groups$$,
  'membership cannot be inserted directly, only through a code');

-- ---------- a stranger sees nothing ----------
select t.be(:'S');
select t.rows('select 1 from public.activities', 0, 'a stranger sees no sessions');
select t.rows('select 1 from public.efforts', 0, 'a stranger sees no sets');
select t.rows($$select 1 from public.profiles where display_name <> 'Stranger'$$, 0, 'a stranger sees no other profiles');
select t.fails(format($$insert into public.reactions (activity_id, group_id, user_id, emoji) values (%L, %L, auth.uid(), '+1')$$, :'ACT', :'lifters'),
  'a stranger cannot react in a group they are not in');

-- ---------- reactions and comments ----------
select t.be(:'J');
insert into public.reactions (activity_id, group_id, user_id, emoji) values (:'ACT', :'lifters', :'J', '💪');
insert into public.comments (group_id, user_id, activity_id, body) values (:'lifters', :'J', :'ACT', 'Big hip thrust day');
select t.be(:'K');
select t.rows('select 1 from public.reactions', 1, 'Kevin sees Jake''s reaction');
select t.rows('select 1 from public.comments', 1, 'Kevin sees Jake''s comment');

-- ---------- per-group privacy ----------
select t.be(:'K');
update public.group_members set detail_level = 'names_only' where user_id = :'K' and group_id = :'lifters';
select t.be(:'J');
select t.rows('select 1 from public.activities', 1, 'names only: Jake still sees that Kevin trained');
select t.rows('select 1 from public.efforts', 0, 'names only: Jake no longer sees the sets');

-- A second group where Kevin stays on full detail
select t.be(:'K');
select code as crew_code, id as crew from public.create_group('Crew') \gset
select t.be(:'M');
select public.join_group(:'crew_code') \gset mia_
select t.rows('select 1 from public.efforts', 2, 'one person, two groups: Mia''s group still gets full detail');
select t.rows($$select 1 from public.profiles where display_name = 'Jake'$$, 0, 'Mia cannot see Jake, they share no group');
select t.fails(format($$insert into public.reactions (activity_id, group_id, user_id, emoji) values (%L, %L, auth.uid(), '+1')$$, :'ACT', :'lifters'),
  'Mia cannot react inside a group she is not in');
select t.be(:'J');
select t.rows('select 1 from public.efforts', 0, 'Jake''s view is unchanged by Kevin''s other group');
select t.rows('select 1 from public.groups', 1, 'Jake cannot see the group he is not in');
select t.be(:'K');
update public.group_members set detail_level = 'full' where user_id = :'K' and group_id = :'lifters';

-- ---------- custom exercises ----------
select t.be(:'K');
select t.fails($$insert into public.exercises (id, name, source, owner_id) values ('Barbell_Row_Fake', 'x', 'user', auth.uid())$$,
  'a user-made exercise cannot take a library-style id');
select t.changes($$update public.exercises set name = 'hacked' where id = 'Barbell_Curl'$$, 0, 'a user cannot rename a library exercise');
insert into public.exercises (id, name, source, owner_id, region) values ('u_k_pendulum', 'Pendulum Squat', 'user', :'K', 'lower');
select t.be(:'J');
select t.rows($$select 1 from public.exercises where id = 'u_k_pendulum'$$, 1, 'Jake can see the name of Kevin''s custom lift');
select t.rows($$select 1 from public.exercises where name = 'hacked'$$, 0, 'the library exercise was not renamed');
select t.be(:'S');
select t.rows($$select 1 from public.exercises where id = 'u_k_pendulum'$$, 0, 'a stranger cannot see it');
select t.rows('select 1 from public.exercises', 2, 'a stranger still gets the shared library');

-- ---------- group blocks ----------
select t.be(:'K');
insert into public.programs (slug, owner_id, title, focus, weeks, days_per_week, template)
  values ('block-2', :'K', 'Block 2', 'hypertrophy', 8, 5, '{"schema_version": 1}') returning id as prog \gset
insert into public.group_blocks (group_id, program_id, author_id, title)
  values (:'lifters', :'prog', :'K', 'Block 2 together') returning id as gb \gset
select t.be(:'J');
select t.rows('select 1 from public.programs', 1, 'Jake can read the program his group is running');
insert into public.blocks (user_id, program_id, group_block_id, title, focus, plan, position)
  values (:'J', :'prog', :'gb', 'Block 2', 'hypertrophy', '{"schema_version": 1}', 7);
select t.changes($$update public.programs set title = 'mine now'$$, 0, 'a runner cannot edit the author''s program');
select t.be(:'K');
select t.rows('select 1 from public.blocks where position = 7', 1, 'Kevin can see which week Jake is on');
select t.be(:'S');
select t.rows('select 1 from public.programs', 0, 'a stranger cannot read a private program');
select t.fails(format($$insert into public.blocks (user_id, group_block_id, title, focus, plan) values (auth.uid(), %L, 'x', 'hypertrophy', '{}')$$, :'gb'),
  'a stranger cannot attach a block to the group''s block');
select t.be(:'M');
select t.rows('select 1 from public.blocks', 0, 'Mia, in a different group, cannot see Jake''s block');

-- ---------- leaving ----------
select t.be(:'J');
delete from public.group_members where user_id = :'J';
select t.rows('select 1 from public.activities', 0, 'after leaving, Jake no longer sees Kevin''s sessions');

-- ---------- signed out ----------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t.fails('select 1 from public.activities', 'signed-out visitors cannot read sessions');
select t.fails('select 1 from public.profiles', 'signed-out visitors cannot read profiles');
select t.fails($$select public.join_group('AAAAAA')$$, 'signed-out visitors cannot try codes');
reset role;
