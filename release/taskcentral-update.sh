#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  printf 'Task Central update error: %s\n' "$*" >&2
  exit 1
}

download_file() {
  local url="$1"
  local destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location --output "$destination" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$url"
  else
    die "This updater requires curl or wget."
  fi
}

install_dir="${TASKCENTRAL_INSTALL_DIR:-$PWD}"
install_dir="$(cd -- "$install_dir" && pwd -P)"
env_file="$install_dir/.env"
[[ -f "$env_file" && -f "$install_dir/compose.yml" ]] ||
  die "Run this command from the existing Task Central installation directory."

repository="$(
  awk -F= '$1 == "TASKCENTRAL_RELEASE_REPOSITORY" {print substr($0, index($0, "=") + 1); exit}' \
    "$env_file"
)"
[[ -n "$repository" ]] || die "No release repository is configured in .env."

target_version="${1:-}"
if [[ -z "$target_version" ]]; then
  if command -v curl >/dev/null 2>&1; then
    target_version="$(
      curl --fail --silent --show-error --location \
        "https://github.com/$repository/releases/latest/download/VERSION"
    )"
  else
    target_version="$(
      wget -qO- "https://github.com/$repository/releases/latest/download/VERSION"
    )"
  fi
fi
target_version="$(printf '%s' "$target_version" | tr -d '[:space:]')"
[[ "$target_version" =~ ^v?[0-9]+(\.[0-9]+){2}([._+-][A-Za-z0-9.-]+)?$ ]] ||
  die "Invalid release version: $target_version"
target_version="${target_version#v}"

work_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

archive_name="taskcentral-$target_version.tar.gz"
release_url="https://github.com/$repository/releases/download/v$target_version"
download_file "$release_url/$archive_name" "$work_dir/$archive_name"
download_file "$release_url/SHA256SUMS" "$work_dir/SHA256SUMS"

expected_checksum="$(
  awk -v wanted="$archive_name" '$2 == wanted {print $1; exit}' "$work_dir/SHA256SUMS"
)"
[[ "$expected_checksum" =~ ^[0-9a-fA-F]{64}$ ]] ||
  die "The release checksum could not be verified."
(
  cd -- "$work_dir"
  printf '%s  %s\n' "$expected_checksum" "$archive_name" | sha256sum --check --status
) || die "The downloaded release bundle failed checksum verification."

tar -xzf "$work_dir/$archive_name" -C "$work_dir"
bundle_dir="$work_dir/taskcentral-$target_version"
[[ -x "$bundle_dir/update.sh" ]] || die "The downloaded release bundle is invalid."
[[ "$(tr -d '[:space:]' <"$bundle_dir/VERSION")" == "$target_version" ]] ||
  die "The downloaded release bundle has an unexpected version."

TASKCENTRAL_INSTALL_DIR="$install_dir" "$bundle_dir/update.sh" "$target_version"
