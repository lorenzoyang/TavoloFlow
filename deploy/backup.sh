#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
lock_operations
[[ "$RELEASE_ID" != uninstalled ]] || fail 'No installed release.'
umask 077
mkdir -p "$TF_ROOT/backups"
stage=$(mktemp -d "$TF_ROOT/backups/.incomplete-XXXXXX")
backup="$TF_ROOT/backups/tavoloflow-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
trap 'rm -rf "$stage"; rm -f "$backup.part"' EXIT
# Expand credentials inside the database container, not in the host shell.
# shellcheck disable=SC2016
compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$stage/database.dump"
# The helper is non-root and mounts the same key volume as the API. It performs no HTTP work.
compose run --rm -T --no-deps --entrypoint tar api -C /var/tavoloflow/keys -czf - . > "$stage/keys.tar.gz"
cp "$TF_ROOT/.env" "$stage/production.env"
cp "$TF_ROOT/compose.yaml" "$TF_ROOT/Caddyfile" "$stage/"
cp -a "$TF_ROOT/state" "$stage/state"
# The checksum manifest is explicitly excluded from the input list.
# shellcheck disable=SC2094
(cd "$stage" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
tar -czf "$backup.part" -C "$stage" .
mv "$backup.part" "$backup"
# Delete only completed backups produced by this script; keep the most recent seven days.
find "$TF_ROOT/backups" -maxdepth 1 -type f -name 'tavoloflow-*.tar.gz' -mmin +10080 -delete
printf 'Backup complete: %s\n' "$backup"
