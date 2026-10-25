#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
lock_operations
[[ "${1:-}" == --schema-compatible ]] || fail 'Read the rollback section first, then supply --schema-compatible RELEASE_ID. This command never downgrades the database.'
release=${2:?Provide the earlier release ID}
valid_release "$release"
[[ -f "$TF_ROOT/web/releases/$release/index.html" ]] || fail 'The earlier frontend is unavailable.'
docker image inspect "tavoloflow-api:$release" >/dev/null
previous=$(cat "$TF_ROOT/state/current")
compose stop api
bash "$TF_ROOT/backup.sh"
export RELEASE_ID=$release
compose up -d --no-deps --wait --wait-timeout 120 api
activate_web "$release"
compose up -d --no-deps --force-recreate --wait --wait-timeout 120 caddy
printf '%s\n' "$previous" > "$TF_ROOT/state/previous"
printf '%s\n' "$release" > "$TF_ROOT/state/current"
printf 'Application rolled back to %s. Database schema was kept.\n' "$release"
