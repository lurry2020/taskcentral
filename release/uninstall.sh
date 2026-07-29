#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_common.sh"

require_installation
check_docker
lock_operations

delete_data=false
assume_yes=false
for argument in "$@"; do
  case "$argument" in
    --delete-data) delete_data=true ;;
    --yes) assume_yes=true ;;
    *) die "Usage: ./uninstall.sh [--delete-data] [--yes]" ;;
  esac
done

if [[ "$delete_data" == false ]]; then
  tc_compose down --remove-orphans
  info "Task Central containers were removed."
  info "Configuration, data, and backups were preserved in $SCRIPT_DIR."
  exit 0
fi

if [[ "$assume_yes" == false ]]; then
  [[ -t 0 ]] || die "--delete-data requires an interactive terminal or the explicit --yes option."
  warn "This permanently deletes Task Central's database, backups, and local configuration."
  read -r -p "Type DELETE to continue: " confirmation
  [[ "$confirmation" == "DELETE" ]] || {
    info "Uninstall cancelled."
    exit 0
  }
fi

tc_compose stop frontend backend >/dev/null 2>&1 || true
tc_compose run --rm --no-deps backend python - <<'PY'
from pathlib import Path

for root in (Path("/data"), Path("/backups")):
    if not root.is_dir():
        continue
    for child in root.iterdir():
        if child.is_file() or child.is_symlink():
            child.unlink()
PY
tc_compose down --remove-orphans
rm -f "$ENV_FILE"
info "Task Central containers, database files, backups, and local configuration were deleted."
