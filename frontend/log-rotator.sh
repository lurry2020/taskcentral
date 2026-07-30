#!/bin/sh
set -eu

log_file="/logs/frontend.log"
max_bytes="${FRONTEND_LOG_MAX_BYTES:-5242880}"
backup_count="${FRONTEND_LOG_BACKUP_COUNT:-5}"

case "$max_bytes" in
    ''|*[!0-9]*) max_bytes=5242880 ;;
esac
case "$backup_count" in
    ''|*[!0-9]*) backup_count=5 ;;
esac
[ "$max_bytes" -ge 1 ] || max_bytes=5242880
[ "$backup_count" -ge 1 ] || backup_count=5

rotate_frontend_log() {
    while sleep 60; do
        [ -f "$log_file" ] || continue
        size="$(wc -c <"$log_file")"
        [ "$size" -ge "$max_bytes" ] || continue

        index="$backup_count"
        while [ "$index" -gt 1 ]; do
            previous=$((index - 1))
            [ ! -f "$log_file.$previous" ] || mv -f "$log_file.$previous" "$log_file.$index"
            index="$previous"
        done

        mv -f "$log_file" "$log_file.1"
        : >"$log_file"
        nginx -s reopen >/dev/null 2>&1 || true
    done
}

rotate_frontend_log &
