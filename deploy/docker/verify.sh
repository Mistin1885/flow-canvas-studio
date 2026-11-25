#!/usr/bin/env bash
# Build, migrate and test disposable services, including two independent browser profiles.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
scratch=$(mktemp -d)
project=flow-pg-test-${scratch##*.}
project=${project,,}
compose=(docker compose --env-file /dev/null -p "$project" -f deploy/docker/docker-compose.yml)
export FLOW_PGDATA=postgres-data
export FLOW_AUTH=local FLOW_PORT="${FLOW_TEST_PORT:-18797}" FLOW_DATA_DIR="$scratch/empty"
export FLOW_UID="$(id -u)" FLOW_GID="$(id -g)"
mkdir "$FLOW_DATA_DIR"
trap '"${compose[@]}" down -v --remove-orphans; rm -rf -- "$scratch"' EXIT
"${compose[@]}" up -d --build --wait
spec=(-v "$PWD/tests:/app/tests:ro" -e 'FLOW_TEST_DATABASE_URL=dbname=flow user=flow_app host=/var/run/postgresql')
if [[ -n "${FLOW_TEST_LEGACY_DIR:-}" ]]; then
  spec+=(-v "$(realpath "$FLOW_TEST_LEGACY_DIR"):/test-legacy:ro" -e FLOW_TEST_LEGACY_DIR=/test-legacy)
fi
if [[ -n "${FLOW_TEST_GRAPH:-}" ]]; then
  spec+=(-v "$(realpath "$FLOW_TEST_GRAPH"):/test-graph.json:ro" -e FLOW_TEST_GRAPH=/test-graph.json)
fi
"${compose[@]}" run --rm --no-deps "${spec[@]}" web python -m unittest discover -s tests -v
export FLOW_E2E_ORIGIN="http://127.0.0.1:$FLOW_PORT" FLOW_E2E_COMPOSE_PROJECT="$project"
if [[ ! -d frontend/node_modules/@playwright/test ]]; then npm ci --prefix frontend; fi
if [[ -z "${CHROME_BIN:-}" ]] && command -v google-chrome >/dev/null; then export CHROME_BIN="$(command -v google-chrome)"; fi
node frontend/tests/collaboration.mjs
url="$FLOW_E2E_ORIGIN/api/catalog"
curl -fsS --noproxy '*' "$url" > "$scratch/before.json"
"${compose[@]}" restart database web
"${compose[@]}" up -d --wait
curl -fsS --noproxy '*' "$url" > "$scratch/after.json"
cmp "$scratch/before.json" "$scratch/after.json"
echo 'PostgreSQL container restart preserved workspace IDs, canvas revisions and record counts.'

# Quiesce only this disposable project while comparing two complete logical inventories.
"${compose[@]}" stop web
pg=("${compose[@]}" exec -T -u postgres database)
"${pg[@]}" pg_dump -Fc -d flow > "$scratch/flow.dump"
"${pg[@]}" createdb -O flow_app -T template0 flow_dump_verify
"${pg[@]}" pg_restore --single-transaction --exit-on-error -d flow_dump_verify < "$scratch/flow.dump"
for database in flow flow_dump_verify; do
  "${pg[@]}" psql -XAt -v ON_ERROR_STOP=1 -d "$database" < tests/database_digest.sql > "$scratch/$database.digest"
done
cmp "$scratch/flow.digest" "$scratch/flow_dump_verify.digest"
echo 'Verified pg_dump restore against every application table, including live data, revisions and recovery bytes.'
