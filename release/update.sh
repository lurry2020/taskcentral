#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_common.sh"

require_installation
check_docker
lock_operations

current_version="$(read_env TASKCENTRAL_VERSION)"
target_version="${1:-}"
if [[ -z "$target_version" ]]; then
  repository="$(read_env TASKCENTRAL_RELEASE_REPOSITORY)"
  [[ -n "$repository" ]] || die "No release repository is configured in .env."
  info "Checking for the latest release…"
  target_version="$(fetch_text "https://github.com/$repository/releases/latest/download/VERSION")"
fi
target_version="$(printf '%s' "$target_version" | tr -d '[:space:]')"
valid_version "$target_version" || die "Invalid release version: $target_version"

if [[ "$target_version" == "$current_version" ]]; then
  info "Version $current_version is already installed."
  exit 0
fi

image_prefix="$(read_env TASKCENTRAL_IMAGE_PREFIX)"
info "Downloading Task Central $target_version…"
docker pull "$image_prefix/taskcentral-backend:$target_version"
docker pull "$image_prefix/taskcentral-frontend:$target_version"

create_backup
environment_backup="$SCRIPT_DIR/.env.before-update"
cp "$ENV_FILE" "$environment_backup"
chmod 600 "$environment_backup"
set_env TASKCENTRAL_VERSION "$target_version"

info "Updating from $current_version to $target_version…"
tc_compose up -d
if wait_for_healthy; then
  rm -f "$environment_backup"
  info "Update complete. Task Central $target_version is healthy."
  info "Pre-update database backup: $LAST_BACKUP"
  exit 0
fi

warn "The updated containers did not become healthy; restoring $current_version."
tc_compose stop frontend backend >/dev/null 2>&1 || true
cp "$environment_backup" "$ENV_FILE"
chmod 600 "$ENV_FILE"
rm -f "$environment_backup"
if restore_backup_file "$LAST_BACKUP"; then
  die "Update failed and was rolled back successfully. Task Central remains on $current_version."
fi
die "Update failed and automatic rollback also failed. The backup is at $LAST_BACKUP."
