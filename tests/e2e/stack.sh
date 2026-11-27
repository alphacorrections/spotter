#!/usr/bin/env bash
# Starts a throwaway Postgres with Spotter's real migrations, plus PostgREST
# (the same API server Supabase runs) in front of it. Prints the work dir.
# usage: stack.sh start <postgrest-binary>   |   stack.sh stop <workdir>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
BIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
run() { su postgres -s /bin/bash -c "$1"; }
if [ "$1" = "stop" ]; then
  W="$2"; [ -f "$W/pgrst.pid" ] && kill "$(cat "$W/pgrst.pid")" 2>/dev/null || true
  run "$BIN/pg_ctl -D $W/pg -m immediate stop >/dev/null 2>&1" || true; rm -rf "$W"; exit 0
fi
PGRST="$2"; W="$(mktemp -d)"; chmod 755 "$W"
cp "$ROOT/tests/db/supabase-shim.sql" "$ROOT"/supabase/migrations/*.sql "$W/"; cp "$PGRST" "$W/postgrest"; chmod 755 "$W/postgrest"; chown -R postgres "$W"
run "$BIN/initdb -D $W/pg -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $W/pg -o '-p 54329 -c listen_addresses=127.0.0.1 -k $W' -w -l $W/pg.log start >/dev/null"
P="$BIN/psql -X -h 127.0.0.1 -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
run "$P -f $W/supabase-shim.sql"
for f in $(ls "$W"/2*.sql | sort); do run "$P -f $f"; done
# Supabase lets the API role read the auth schema's uid(); mirror the grants it ships with.
run "$P -c 'grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;'"
cat > "$W/pgrst.conf" <<C
db-uri = "postgres://postgres@127.0.0.1:54329/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "spotter-test-secret-spotter-test-secret-0123456789"
server-host = "127.0.0.1"
server-port = 54330
C
chown postgres "$W/pgrst.conf"
su postgres -s /bin/bash -c "$W/postgrest $W/pgrst.conf > $W/pgrst.log 2>&1 & echo \$! > $W/pgrst.pid"
for i in $(seq 1 80); do [ "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:54330/ || true)" = "200" ] && break; sleep 0.2; done
echo "$W"
