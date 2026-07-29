#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

INSTALL_DIR="$TEST_ROOT/taskcentral"
FAKE_BIN="$TEST_ROOT/bin"
COMMAND_LOG="$TEST_ROOT/docker.log"
mkdir -p "$INSTALL_DIR" "$FAKE_BIN"
cp -a "$ROOT_DIR/release/." "$INSTALL_DIR/"
sed -i \
  -e 's|__VERSION__|1.0.0|g' \
  -e 's|__IMAGE_PREFIX__|ghcr.io/example|g' \
  -e 's|__REPOSITORY__|example/taskcentral|g' \
  "$INSTALL_DIR/.env.example" \
  "$INSTALL_DIR/VERSION"

cat >"$FAKE_BIN/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"

if [[ "${1:-}" == "info" ]]; then
  exit 0
fi
if [[ "${1:-}" == "inspect" ]]; then
  printf 'healthy\n'
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
exit 0
FAKE_DOCKER

cat >"$FAKE_BIN/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
printf '1.1.0\n'
FAKE_CURL

chmod 755 "$FAKE_BIN/docker" "$FAKE_BIN/curl" "$INSTALL_DIR"/*.sh
export PATH="$FAKE_BIN:$PATH"
export FAKE_DOCKER_LOG="$COMMAND_LOG"
export FAKE_INSTALL_DIR="$INSTALL_DIR"

APP_PORT=8588 "$INSTALL_DIR/install.sh"

[[ "$(stat -c '%a' "$INSTALL_DIR/.env")" == "600" ]]
[[ "$(awk -F= '$1 == "APP_PORT" {print $2}' "$INSTALL_DIR/.env")" == "8588" ]]
[[ "$(awk -F= '$1 == "TASKCENTRAL_VERSION" {print $2}' "$INSTALL_DIR/.env")" == "1.0.0" ]]
[[ "$(awk -F= '$1 == "SECRET_KEY" {print length($2)}' "$INSTALL_DIR/.env")" == "64" ]]
[[ "$(awk -F= '$1 == "AUTH_PASSWORD" {print length($2)}' "$INSTALL_DIR/.env")" == "64" ]]
[[ -d "$INSTALL_DIR/data" && -d "$INSTALL_DIR/backups" ]]

"$INSTALL_DIR/update.sh"
[[ "$(awk -F= '$1 == "TASKCENTRAL_VERSION" {print $2}' "$INSTALL_DIR/.env")" == "1.1.0" ]]
compgen -G "$INSTALL_DIR/backups/taskcentral-*.db" >/dev/null

"$INSTALL_DIR/backup.sh"
"$INSTALL_DIR/uninstall.sh"
[[ -f "$INSTALL_DIR/.env" ]]
[[ -d "$INSTALL_DIR/data" && -d "$INSTALL_DIR/backups" ]]

grep -q "compose .* pull" "$COMMAND_LOG"
grep -q "ghcr.io/example/taskcentral-backend:1.1.0" "$COMMAND_LOG"
grep -q "compose .* down --remove-orphans" "$COMMAND_LOG"

printf 'Release bundle lifecycle test passed.\n'
