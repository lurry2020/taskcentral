#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

FAKE_BIN="$TEST_ROOT/bin"
FAKE_RELEASE_DIR="$TEST_ROOT/releases"
COMMAND_LOG="$TEST_ROOT/docker.log"
LATEST_VERSION_FILE="$TEST_ROOT/latest-version"
HEALTH_FILE="$TEST_ROOT/health"
mkdir -p "$FAKE_BIN" "$FAKE_RELEASE_DIR"
printf 'healthy\n' >"$HEALTH_FILE"

RELEASE_FILES=(
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
)

populate_bundle() {
  local destination="$1"
  local version="$2"
  local file
  mkdir -p "$destination"
  for file in "${RELEASE_FILES[@]}"; do
    cp -p "$ROOT_DIR/release/$file" "$destination/$file"
  done
  cp -p "$ROOT_DIR/MANUAL.md" "$destination/MANUAL.md"
  cp -p "$ROOT_DIR/CHANGELOG.md" "$destination/CHANGELOG.md"
  cp -p "$ROOT_DIR/release/VERSION" "$destination/VERSION"
  sed -i \
    -e "s|__VERSION__|$version|g" \
    -e 's|__IMAGE_PREFIX__|ghcr.io/example|g' \
    -e 's|__REPOSITORY__|example/taskcentral|g' \
    "$destination/.env.example" \
    "$destination/VERSION"
  printf '\nBundle marker: %s\n' "$version" >>"$destination/README.md"
  chmod 755 "$destination"/*.sh
}

publish_fake_release() {
  local version="$1"
  local release_root="$FAKE_RELEASE_DIR/v$version"
  local bundle_name="taskcentral-$version"
  mkdir -p "$release_root"
  populate_bundle "$release_root/$bundle_name" "$version"
  tar -C "$release_root" -czf "$release_root/$bundle_name.tar.gz" "$bundle_name"
  printf '%s\n' "$version" >"$release_root/VERSION"
  cp "$ROOT_DIR/release/taskcentral-update.sh" "$release_root/taskcentral-update.sh"
  (
    cd "$release_root"
    sha256sum "$bundle_name.tar.gz" VERSION taskcentral-update.sh >SHA256SUMS
  )
}

publish_fake_release "1.1.0"
publish_fake_release "1.2.0"
printf '1.1.0\n' >"$LATEST_VERSION_FILE"

cat >"$FAKE_BIN/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"

if [[ "${1:-}" == "info" ]]; then
  exit 0
fi
if [[ "${1:-}" == "inspect" ]]; then
  cat "$FAKE_HEALTH_FILE"
  exit 0
fi
if [[ "${1:-}" == "pull" ]]; then
  exit 0
fi
if [[ "${1:-}" != "compose" ]]; then
  exit 0
fi

arguments=" $* "
if [[ "$arguments" == *" version "* ]]; then
  printf 'Docker Compose version v2.40.0\n'
  exit 0
fi
if [[ "$arguments" == *" ps -q backend"* ]]; then
  printf 'backend-container\n'
  exit 0
fi
if [[ "$arguments" == *" ps -q frontend"* ]]; then
  printf 'frontend-container\n'
  exit 0
fi
if [[ "$arguments" == *" exec -T backend python "* ]]; then
  for argument in "$@"; do
    if [[ "$argument" =~ ^taskcentral-[0-9]{8}-[0-9]{6}(-[0-9]+)?\.db$ ]]; then
      touch "$FAKE_INSTALL_DIR/backups/$argument"
    fi
  done
  cat >/dev/null
  exit 0
fi
if [[ "$arguments" == *" run --rm --no-deps backend python "* ]]; then
  cat >/dev/null
  exit 0
fi
if [[ "$arguments" == *" up -d"* ]]; then
  installed_version="$(
    awk -F= '$1 == "TASKCENTRAL_VERSION" {print $2; exit}' "$FAKE_INSTALL_DIR/.env"
  )"
  if [[ -n "${FAKE_FAIL_VERSION:-}" && "$installed_version" == "$FAKE_FAIL_VERSION" ]]; then
    printf 'exited\n' >"$FAKE_HEALTH_FILE"
  else
    printf 'healthy\n' >"$FAKE_HEALTH_FILE"
  fi
fi
exit 0
FAKE_DOCKER

cat >"$FAKE_BIN/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail

output=""
url=""
while (($#)); do
  case "$1" in
    --output|-o)
      output="$2"
      shift 2
      ;;
    --*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

if [[ "$url" == */releases/latest/download/VERSION ]]; then
  source_file="$FAKE_LATEST_VERSION_FILE"
else
  release_path="${url#https://github.com/$FAKE_REPOSITORY/releases/download/}"
  source_file="$FAKE_RELEASE_DIR/${release_path%%/*}/${release_path#*/}"
fi
[[ -f "$source_file" ]] || {
  printf 'Missing fake release asset for %s\n' "$url" >&2
  exit 22
}
if [[ -n "$output" ]]; then
  cp "$source_file" "$output"
else
  cat "$source_file"
fi
FAKE_CURL

chmod 755 "$FAKE_BIN/docker" "$FAKE_BIN/curl"
export PATH="$FAKE_BIN:$PATH"
export FAKE_DOCKER_LOG="$COMMAND_LOG"
export FAKE_RELEASE_DIR
export FAKE_LATEST_VERSION_FILE="$LATEST_VERSION_FILE"
export FAKE_HEALTH_FILE="$HEALTH_FILE"
export FAKE_REPOSITORY="example/taskcentral"

INSTALL_DIR="$TEST_ROOT/taskcentral"
populate_bundle "$INSTALL_DIR" "1.0.0"
export FAKE_INSTALL_DIR="$INSTALL_DIR"

APP_PORT=8588 "$INSTALL_DIR/install.sh"

[[ "$(stat -c '%a' "$INSTALL_DIR/.env")" == "600" ]]
[[ "$(awk -F= '$1 == "APP_PORT" {print $2}' "$INSTALL_DIR/.env")" == "8588" ]]
[[ "$(awk -F= '$1 == "TASKCENTRAL_VERSION" {print $2}' "$INSTALL_DIR/.env")" == "1.0.0" ]]
[[ "$(awk -F= '$1 == "SECRET_KEY" {print length($2)}' "$INSTALL_DIR/.env")" == "64" ]]
[[ "$(awk -F= '$1 == "AUTH_PASSWORD" {print length($2)}' "$INSTALL_DIR/.env")" == "64" ]]
[[ -d "$INSTALL_DIR/data" && -d "$INSTALL_DIR/backups" && -d "$INSTALL_DIR/logs" ]]

"$INSTALL_DIR/update.sh"
[[ "$(awk -F= '$1 == "TASKCENTRAL_VERSION" {print $2}' "$INSTALL_DIR/.env")" == "1.1.0" ]]
grep -q '^Bundle marker: 1.1.0$' "$INSTALL_DIR/README.md"
[[ -x "$INSTALL_DIR/taskcentral-update.sh" ]]
compgen -G "$INSTALL_DIR/backups/taskcentral-*.db" >/dev/null

printf '1.2.0\n' >"$LATEST_VERSION_FILE"
export FAKE_FAIL_VERSION="1.2.0"
if "$INSTALL_DIR/update.sh"; then
  printf 'Expected the simulated unhealthy update to fail.\n' >&2
  exit 1
fi
unset FAKE_FAIL_VERSION
[[ "$(awk -F= '$1 == "TASKCENTRAL_VERSION" {print $2}' "$INSTALL_DIR/.env")" == "1.1.0" ]]
grep -q '^Bundle marker: 1.1.0$' "$INSTALL_DIR/README.md"

LEGACY_DIR="$TEST_ROOT/legacy-taskcentral"
populate_bundle "$LEGACY_DIR" "1.0.0"
rm -f "$LEGACY_DIR/taskcentral-update.sh"
export FAKE_INSTALL_DIR="$LEGACY_DIR"
printf 'healthy\n' >"$HEALTH_FILE"
APP_PORT=8589 "$LEGACY_DIR/install.sh"
(
  cd "$LEGACY_DIR"
  bash "$ROOT_DIR/release/taskcentral-update.sh" "1.1.0"
)
[[ "$(awk -F= '$1 == "TASKCENTRAL_VERSION" {print $2}' "$LEGACY_DIR/.env")" == "1.1.0" ]]
grep -q '^Bundle marker: 1.1.0$' "$LEGACY_DIR/README.md"

export FAKE_INSTALL_DIR="$INSTALL_DIR"
"$INSTALL_DIR/backup.sh"
"$INSTALL_DIR/uninstall.sh"
[[ -f "$INSTALL_DIR/.env" ]]
[[ -d "$INSTALL_DIR/data" && -d "$INSTALL_DIR/backups" && -d "$INSTALL_DIR/logs" ]]

grep -q "compose .* pull" "$COMMAND_LOG"
grep -q "ghcr.io/example/taskcentral-backend:1.1.0" "$COMMAND_LOG"
grep -q "compose .* down --remove-orphans" "$COMMAND_LOG"

printf 'Release bundle lifecycle test passed.\n'
