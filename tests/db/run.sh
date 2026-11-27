#!/usr/bin/env bash
# Spins up a throwaway Postgres, loads the Supabase stand-in + schema, runs the tests.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
WORK="$(mktemp -d)"; chmod 755 "$WORK"
MIG="$HERE/../../supabase/migrations"
cp "$HERE/supabase-shim.sql" "$HERE/rls.test.sql" "$WORK/"; cp "$MIG/20261127000000_spotter.sql" "$WORK/schema.sql"
chown -R postgres "$WORK"
run() { su postgres -s /bin/bash -c "$1"; }
run "$BIN/initdb -D $WORK/pg -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $WORK/pg -o '-p 54329 -c listen_addresses=localhost -k $WORK' -w -l $WORK/log start >/dev/null"
trap 'run "$BIN/pg_ctl -D $WORK/pg -m immediate stop >/dev/null" || true; rm -rf "$WORK"' EXIT
P="$BIN/psql -X -h $WORK -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
run "$P -f $WORK/supabase-shim.sql"
run "$P -f $WORK/schema.sql"
echo "schema loaded: $(run "$P -Atc \"select count(*) from pg_tables where schemaname='public'\"") tables, $(run "$P -Atc \"select count(*) from pg_policies where schemaname='public'\"") policies"
run "$P -o /dev/null -f $WORK/rls.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  //' | tee "$WORK/out"
# Second, clean database: does the real exercise library load, and does Block 2 resolve against it?
if [ -f "$MIG/20261127000100_exercises.sql" ]; then
  cp "$MIG/20261127000100_exercises.sql" "$WORK/exercises.sql"; cp "$HERE/../../templates/block-2-hypertrophy-strength-lean.json" "$WORK/block-2.json"; chown postgres "$WORK/exercises.sql" "$WORK/block-2.json"
  run "$BIN/createdb -h $WORK -p 54329 -U postgres seedcheck"
  S="$BIN/psql -X -h $WORK -p 54329 -U postgres -d seedcheck -v ON_ERROR_STOP=1 -q"
  run "$S -f $WORK/supabase-shim.sql"; run "$S -f $WORK/schema.sql"; run "$S -f $WORK/exercises.sql"; run "$S -f $WORK/exercises.sql"
  run "$S -c \"insert into public.programs (slug, is_builtin, title, focus, weeks, days_per_week, template) select t->>'slug', true, t->>'title', t->>'focus', (t->>'weeks')::int, (t->>'days_per_week')::int, t from (select pg_read_file('$WORK/block-2.json')::jsonb t) x\""
  echo "seed: $(run "$S -Atc \"select (select count(*) from public.exercises) || ' exercises (' || string_agg(n || ' ' || d, ', ' order by n desc) || ')' from (select domain d, count(*) n from public.exercises group by 1) x\"")"
  echo "block 2 in the database: $(run "$S -Atc \"select count(*) || ' slot exercises, ' || count(*) filter (where e.id is null) || ' missing from the library' from public.programs p, jsonb_path_query(p.template, '\\$.sessions[*].slots[*].exercise') j left join public.exercises e on e.id = j #>> '{}'\"")"
fi
echo "---"
echo "passed: $(grep -c '^ok - ' "$WORK/out")   failed: $(grep -c 'NOT OK\|ERROR' "$WORK/out" || true)"
