#!/usr/bin/env bash
# Convert a stopped installation. A successful transfer leaves the web service offline for review.
set -euo pipefail
if [[ $# != 1 ]]; then
  echo "Usage: $0 /path/to/legacy-data" >&2
  exit 2
fi
legacy_dir=$(realpath -e -- "$1")
if [[ ! -r "$legacy_dir/studio.sqlite3" ]]; then
  echo "Missing or unreadable SQLite source: $legacy_dir/studio.sqlite3" >&2
  exit 1
fi
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
export FLOW_DATA_DIR="$legacy_dir"
compose=(docker compose)
if [[ -f .env ]]; then compose+=(--env-file .env); fi
compose+=(-f deploy/docker/docker-compose.yml)
"${compose[@]}" build web
"${compose[@]}" up -d --wait database
"${compose[@]}" run --rm --no-deps -T web python -m backend.migrate_sqlite apply /legacy
