#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_common.sh"

require_bundle
check_docker
lock_operations

if [[ -f "$ENV_FILE" ]]; then
  info "Existing configuration found; leaving secrets and settings unchanged."
else
  version="$(read_env TASKCENTRAL_VERSION "$ENV_TEMPLATE")"
  image_prefix="$(read_env TASKCENTRAL_IMAGE_PREFIX "$ENV_TEMPLATE")"
  repository="$(read_env TASKCENTRAL_RELEASE_REPOSITORY "$ENV_TEMPLATE")"
  [[ -n "$version" && "$version" != "__VERSION__" ]] ||
    die "This is an unbuilt release template. Download a published Task Central release bundle."
  [[ -n "$image_prefix" && "$image_prefix" != "__IMAGE_PREFIX__" ]] ||
    die "The release bundle does not contain an image registry."
  [[ -n "$repository" && "$repository" != "__REPOSITORY__" ]] ||
    die "The release bundle does not contain an update repository."

  default_port="${APP_PORT:-8484}"
  selected_port="$default_port"
  if [[ -t 0 ]]; then
    read -r -p "Web port [$default_port]: " selected_port
    selected_port="${selected_port:-$default_port}"
  fi
  [[ "$selected_port" =~ ^[0-9]+$ ]] &&
    ((selected_port >= 1 && selected_port <= 65535)) ||
    die "Port must be a number from 1 through 65535."

  umask 077
  cp "$ENV_TEMPLATE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  set_env APP_PORT "$selected_port"
  set_env CORS_ORIGINS "http://localhost:$selected_port"
  set_env SECRET_KEY "$(random_hex)"
  set_env AUTH_PASSWORD "$(random_hex)"
fi

mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$LOG_DIR"
chmod 700 "$DATA_DIR" "$BACKUP_DIR" "$LOG_DIR"

info "Pulling Task Central $(read_env TASKCENTRAL_VERSION)…"
tc_compose pull
info "Starting Task Central…"
tc_compose up -d

if ! wait_for_healthy; then
  tc_compose logs --tail=100 >&2 || true
  die "Task Central did not become healthy. Review the logs above."
fi

info "Installation complete."
info "Open $(application_url) and complete the first-run setup wizard."
