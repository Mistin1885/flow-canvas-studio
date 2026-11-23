#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
if [[ "${1:-}" == --local ]]; then
  export FLOW_AUTH=local
elif [[ $# -ne 0 ]]; then
  echo "Usage: ./deploy/native/start.sh [--local]" >&2
  exit 2
fi
if [[ ! -s frontend/dist/index.html || ! -x .venv/bin/uvicorn ]]; then
  echo "Run ./deploy/native/setup.sh from the repository root first." >&2
  exit 1
fi
exec .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port "${FLOW_PORT:-8768}" --workers 1 --no-proxy-headers
