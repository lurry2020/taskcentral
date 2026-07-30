#!/bin/sh
set -eu

log_dir="${LOG_DIR:-/logs}"
log_file="$log_dir/taskcentral.log"
migration_output="$(mktemp)"
trap 'rm -f "$migration_output"' EXIT

mkdir -p "$log_dir"

if alembic upgrade head >"$migration_output" 2>&1; then
    cat "$migration_output"
    cat "$migration_output" >>"$log_file"
else
    cat "$migration_output" >&2
    cat "$migration_output" >>"$log_file"
    exit 1
fi

rm -f "$migration_output"
trap - EXIT

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
