#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_common.sh"

require_installation
check_docker
lock_operations

[[ $# -eq 1 ]] || die "Usage: ./restore.sh taskcentral-YYYYMMDD-HHMMSS.db"
requested_backup="$1"
if [[ -t 0 ]]; then
  read -r -p "Restore $requested_backup and replace the current database? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || {
    info "Restore cancelled."
    exit 0
  }
fi

create_backup
safety_backup="$LAST_BACKUP"
info "Restoring $requested_backup…"
if restore_backup_file "$requested_backup"; then
  info "Restore complete. Safety backup of the replaced database: $safety_backup"
else
  die "The database was restored, but Task Central did not become healthy. Safety backup: $safety_backup"
fi
