#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_common.sh"

MANAGED_RELEASE_FILES=(
  compose.yml
  .env.example
  _common.sh
  install.sh
  update.sh
  taskcentral-update.sh
  backup.sh
  restore.sh
  uninstall.sh
  README.md
  MANUAL.md
  CHANGELOG.md
  VERSION
)

download_file() {
  local url="$1"
  local destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location --output "$destination" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$url"
  else
    die "Updating automatically requires curl or wget."
  fi
}

validate_bundle() {
  local bundle_dir="$1"
  local version="$2"
  local file
  [[ -d "$bundle_dir" ]] || die "The downloaded release bundle is missing."
  [[ "$(tr -d '[:space:]' <"$bundle_dir/VERSION")" == "$version" ]] ||
    die "The downloaded release bundle has an unexpected version."
  for file in "${MANAGED_RELEASE_FILES[@]}"; do
    [[ -f "$bundle_dir/$file" ]] || die "The downloaded release bundle is missing $file."
  done
}

download_bundle() {
  local repository="$1"
  local version="$2"
  local work_dir="$3"
  local archive_name="taskcentral-$version.tar.gz"
  local archive_path="$work_dir/$archive_name"
  local checksums_path="$work_dir/SHA256SUMS"
  local release_url="https://github.com/$repository/releases/download/v$version"
  local expected_checksum

  require_command tar
  require_command sha256sum
  download_file "$release_url/$archive_name" "$archive_path"
  download_file "$release_url/SHA256SUMS" "$checksums_path"
  expected_checksum="$(
    awk -v wanted="$archive_name" '$2 == wanted {print $1; exit}' "$checksums_path"
  )"
  [[ "$expected_checksum" =~ ^[0-9a-fA-F]{64}$ ]] ||
    die "The release checksum could not be verified."
  (
    cd -- "$work_dir"
    printf '%s  %s\n' "$expected_checksum" "$archive_name" | sha256sum --check --status
  ) || die "The downloaded release bundle failed checksum verification."
  tar -xzf "$archive_path" -C "$work_dir"
  validate_bundle "$work_dir/taskcentral-$version" "$version"
  printf '%s\n' "$work_dir/taskcentral-$version"
}

backup_release_files() {
  local backup_dir="$1"
  local manifest="$backup_dir/existing-files"
  local file
  mkdir -p "$backup_dir"
  : >"$manifest"
  for file in "${MANAGED_RELEASE_FILES[@]}"; do
    if [[ -f "$SCRIPT_DIR/$file" ]]; then
      cp -p "$SCRIPT_DIR/$file" "$backup_dir/$file"
      printf '%s\n' "$file" >>"$manifest"
    fi
  done
}

restore_release_files() {
  local backup_dir="$1"
  local manifest="$backup_dir/existing-files"
  local file
  for file in "${MANAGED_RELEASE_FILES[@]}"; do
    if grep -Fxq "$file" "$manifest"; then
      cp -p "$backup_dir/$file" "$SCRIPT_DIR/$file"
    else
      rm -f "$SCRIPT_DIR/$file"
    fi
  done
}

install_release_files() {
  local bundle_dir="$1"
  local file
  for file in "${MANAGED_RELEASE_FILES[@]}"; do
    cp -p "$bundle_dir/$file" "$SCRIPT_DIR/$file" || return 1
  done
  chmod 755 \
    "$SCRIPT_DIR/_common.sh" \
    "$SCRIPT_DIR/install.sh" \
    "$SCRIPT_DIR/update.sh" \
    "$SCRIPT_DIR/taskcentral-update.sh" \
    "$SCRIPT_DIR/backup.sh" \
    "$SCRIPT_DIR/restore.sh" \
    "$SCRIPT_DIR/uninstall.sh"
}

require_installation
check_docker
lock_operations

current_version="$(read_env TASKCENTRAL_VERSION)"
target_version="${1:-}"
repository="$(read_env TASKCENTRAL_RELEASE_REPOSITORY)"
[[ -n "$repository" ]] || die "No release repository is configured in .env."
if [[ -z "$target_version" ]]; then
  info "Checking for the latest release…"
  target_version="$(fetch_text "https://github.com/$repository/releases/latest/download/VERSION")"
fi
target_version="$(printf '%s' "$target_version" | tr -d '[:space:]')"
valid_version "$target_version" || die "Invalid release version: $target_version"
target_version="${target_version#v}"

if [[ "$target_version" == "$current_version" && "$RELEASE_SCRIPT_DIR" == "$SCRIPT_DIR" ]]; then
  info "Version $current_version is already installed."
  exit 0
fi

update_work_dir="$(mktemp -d)"
release_backup_dir="$update_work_dir/previous-release-files"
environment_backup="$update_work_dir/.env.before-update"
cleanup_update() {
  rm -rf -- "$update_work_dir"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup_update EXIT

if [[ "$RELEASE_SCRIPT_DIR" == "$SCRIPT_DIR" ]]; then
  info "Downloading the Task Central $target_version release bundle…"
  bundle_dir="$(download_bundle "$repository" "$target_version" "$update_work_dir")"
else
  bundle_dir="$RELEASE_SCRIPT_DIR"
  validate_bundle "$bundle_dir" "$target_version"
fi

image_prefix="$(read_env TASKCENTRAL_IMAGE_PREFIX)"
info "Downloading Task Central $target_version…"
docker pull "$image_prefix/taskcentral-backend:$target_version"
docker pull "$image_prefix/taskcentral-frontend:$target_version"

create_backup
cp "$ENV_FILE" "$environment_backup"
chmod 600 "$environment_backup"
backup_release_files "$release_backup_dir"
if ! install_release_files "$bundle_dir"; then
  restore_release_files "$release_backup_dir"
  die "The release files could not be installed. The previous files were restored."
fi
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"
set_env TASKCENTRAL_VERSION "$target_version"

info "Updating from $current_version to $target_version…"
if tc_compose up -d && wait_for_healthy; then
  info "Update complete. Task Central $target_version is healthy."
  info "Pre-update database backup: $LAST_BACKUP"
  exit 0
fi

warn "The updated containers did not become healthy; restoring $current_version."
tc_compose stop frontend backend >/dev/null 2>&1 || true
cp "$environment_backup" "$ENV_FILE"
chmod 600 "$ENV_FILE"
restore_release_files "$release_backup_dir"
if restore_backup_file "$LAST_BACKUP"; then
  die "Update failed and was rolled back successfully. Task Central remains on $current_version."
fi
die "Update failed and automatic rollback also failed. The backup is at $LAST_BACKUP."
