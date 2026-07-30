#!/usr/bin/env bash

RELEASE_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_DIR="${TASKCENTRAL_INSTALL_DIR:-$RELEASE_SCRIPT_DIR}"
SCRIPT_DIR="$(cd -- "$SCRIPT_DIR" && pwd -P)"
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_TEMPLATE="$SCRIPT_DIR/.env.example"
DATA_DIR="$SCRIPT_DIR/data"
BACKUP_DIR="$SCRIPT_DIR/backups"
LOG_DIR="$SCRIPT_DIR/logs"
LOCK_DIR="$SCRIPT_DIR/.taskcentral-operation.lock"

info() {
  printf 'Task Central: %s\n' "$*"
}

warn() {
  printf 'Task Central warning: %s\n' "$*" >&2
}

die() {
  printf 'Task Central error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

check_docker() {
  require_command docker
  docker compose version >/dev/null 2>&1 ||
    die "Docker Compose v2 is required. Install Docker Engine with the Compose plugin."
  docker info >/dev/null 2>&1 ||
    die "Cannot access the Docker daemon. Start Docker or grant this user Docker access."
}

require_bundle() {
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose.yml in $SCRIPT_DIR"
  [[ -f "$ENV_TEMPLATE" ]] || die "Missing .env.example in $SCRIPT_DIR"
}

require_installation() {
  require_bundle
  [[ -f "$ENV_FILE" ]] || die "Task Central is not installed here. Run ./install.sh first."
}

tc_compose() {
  docker compose \
    --project-directory "$SCRIPT_DIR" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

read_env() {
  local key="$1"
  local file="${2:-$ENV_FILE}"
  awk -v wanted="$key" '
    index($0, wanted "=") == 1 {
      print substr($0, length(wanted) + 2)
      exit
    }
  ' "$file"
}

set_env() {
  local key="$1"
  local value="$2"
  local temp
  temp="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
  awk -v wanted="$key" -v replacement="$value" '
    BEGIN { found = 0 }
    index($0, wanted "=") == 1 {
      print wanted "=" replacement
      found = 1
      next
    }
    { print }
    END {
      if (!found) print wanted "=" replacement
    }
  ' "$ENV_FILE" >"$temp"
  chmod 600 "$temp"
  mv -f "$temp" "$ENV_FILE"
}

random_hex() {
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

lock_operations() {
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    die "Another install, update, backup, restore, or uninstall operation is already running."
  fi
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
}

valid_version() {
  [[ "$1" =~ ^v?[0-9]+(\.[0-9]+){2}([._+-][A-Za-z0-9.-]+)?$ ]]
}

container_health() {
  local service="$1"
  local container_id
  container_id="$(tc_compose ps -q "$service")"
  [[ -n "$container_id" ]] || {
    printf 'missing'
    return
  }
  docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$container_id" 2>/dev/null || printf 'missing'
}

wait_for_healthy() {
  local attempts="${1:-60}"
  local backend_health
  local frontend_health
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    backend_health="$(container_health backend)"
    frontend_health="$(container_health frontend)"
    if [[ "$backend_health" == "healthy" && "$frontend_health" == "healthy" ]]; then
      return 0
    fi
    if [[ "$backend_health" == "exited" || "$frontend_health" == "exited" ]]; then
      return 1
    fi
    sleep 2
  done
  return 1
}

create_backup() {
  local timestamp
  local filename
  local sequence=0
  timestamp="$(date -u +'%Y%m%d-%H%M%S')"
  filename="taskcentral-${timestamp}.db"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  while [[ -e "$BACKUP_DIR/$filename" ]]; do
    sequence=$((sequence + 1))
    filename="taskcentral-${timestamp}-${sequence}.db"
  done

  [[ "$(container_health backend)" == "healthy" ]] ||
    die "The backend must be healthy before an online backup can be created."

  tc_compose exec -T backend python - "$filename" <<'PY'
import sqlite3
import sys
from pathlib import Path

filename = Path(sys.argv[1]).name
source_path = Path("/data/taskcentral.db")
destination_path = Path("/backups") / filename
if not source_path.is_file():
    raise SystemExit("Task Central database not found")
source = sqlite3.connect(source_path)
destination = sqlite3.connect(destination_path)
try:
    source.backup(destination)
finally:
    destination.close()
    source.close()
PY

  LAST_BACKUP="$BACKUP_DIR/$filename"
  info "Backup created: $LAST_BACKUP"
}

restore_backup_file() {
  local requested="$1"
  local filename
  filename="$(basename -- "$requested")"
  [[ "$requested" == "$filename" || "$requested" == "$BACKUP_DIR/$filename" ]] ||
    die "Backups must be selected from $BACKUP_DIR"
  [[ "$filename" =~ ^taskcentral-[0-9]{8}-[0-9]{6}(-[0-9]+)?\.db$ ]] ||
    die "Unexpected backup filename: $filename"
  [[ -f "$BACKUP_DIR/$filename" ]] || die "Backup not found: $BACKUP_DIR/$filename"

  tc_compose stop frontend backend >/dev/null
  tc_compose run --rm --no-deps backend python - "$filename" <<'PY'
import shutil
import sys
from pathlib import Path

filename = Path(sys.argv[1]).name
source_path = Path("/backups") / filename
destination_path = Path("/data/taskcentral.db")
if not source_path.is_file():
    raise SystemExit("Backup not found")
shutil.copyfile(source_path, destination_path)
for suffix in ("-wal", "-shm"):
    Path(str(destination_path) + suffix).unlink(missing_ok=True)
PY
  tc_compose up -d
  wait_for_healthy || return 1
}

fetch_text() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
  else
    die "Updating automatically requires curl or wget."
  fi
}

application_url() {
  local port
  port="$(read_env APP_PORT)"
  printf 'http://localhost:%s' "${port:-8484}"
}
