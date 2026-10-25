#!/usr/bin/env bash
# Usage: sudo bash RELEASE_DIRECTORY/ops/install-release.sh RELEASE_DIRECTORY [/opt/tavoloflow]
set -Eeuo pipefail
(( EUID == 0 )) || { printf 'Run the installer with sudo.\n' >&2; exit 1; }
package=$(realpath -- "${1:?Provide the extracted release directory}")
TAVOLOFLOW_ROOT=$(realpath -- "${2:-/opt/tavoloflow}")
export TAVOLOFLOW_ROOT
[[ "$TAVOLOFLOW_ROOT" != / && -d "$TAVOLOFLOW_ROOT" && -f "$TAVOLOFLOW_ROOT/.env" && ! -L "$TAVOLOFLOW_ROOT/.env" ]] || {
  printf 'Provide a deployment directory with a regular .env file, not /. See the deployment guide.\n' >&2; exit 1;
}
(cd "$package" && sha256sum --check --quiet SHA256SUMS)
# Repair installations made by the old cp -a instructions BEFORE reading state,
# taking the lock or executing the installed backup. Do not follow web/current.
chown -hR root:root -- "$TAVOLOFLOW_ROOT"
chmod -R go-w -- "$TAVOLOFLOW_ROOT"
chmod 755 "$TAVOLOFLOW_ROOT"
chmod 600 "$TAVOLOFLOW_ROOT/.env"
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
lock_operations
umask 077
trap 'printf "Release stopped. Do not retry writes blindly: inspect logs and the deployment guide. Existing database volumes have been kept.\n" >&2' ERR
release=$(cat "$package/release.txt")
valid_release "$release"
[[ ! -e "$TF_ROOT/web/releases/$release" ]] || fail "Release directory already exists; inspect the previous attempt or build a new release."
python3 - "$TF_ROOT/.env" "$package/public-origin.txt" <<'PY'
import pathlib,re,sys
values={}
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key,value=line.split('=',1); values[key.strip()]=value.strip()
if not re.fullmatch(r'[0-9a-fA-F]{64}',values.get('POSTGRES_PASSWORD','')):
    sys.exit('Set POSTGRES_PASSWORD to 64 hex characters generated with openssl rand -hex 32.')
if pathlib.Path(sys.argv[2]).read_text().strip() != 'https://'+values.get('DOMAIN',''):
    sys.exit('DOMAIN differs from the frontend origin baked into this release.')
if '@' not in values.get('ACME_EMAIL','') or 'replace-me' in values.get('ACME_EMAIL',''):
    sys.exit('Set ACME_EMAIL to your real email address.')
PY
chmod 600 "$TF_ROOT/.env"
docker load -i "$package/api-image.tar.gz"
[[ "$(docker image inspect --format '{{.Id}}' "tavoloflow-api:$release")" == "$(cat "$package/image.id")" ]] || fail 'Loaded image ID differs from the manifest.'
export RELEASE_ID=$release
docker compose --project-directory "$TF_ROOT" --env-file "$TF_ROOT/.env" -f "$package/ops/compose.yaml" config --quiet
# Caddy must be able to traverse/read only the public tree, not the secrets and backups beside it.
install -d -o root -g root -m 700 "$TF_ROOT/state" "$TF_ROOT/backups"
install -d -o root -g root -m 755 "$TF_ROOT/web" "$TF_ROOT/web/releases" "$TF_ROOT/web/assets"
previous=$(cat "$TF_ROOT/state/current" 2>/dev/null || true)
if [[ -n "$previous" ]]; then
  valid_release "$previous"
  export RELEASE_ID=$previous
  compose stop api
  bash "$TF_ROOT/backup.sh"
fi
# ops is a flat allow-listed directory. Set ownership/mode explicitly, including
# existing destination files, without copying attributes of the source directory.
# Production .env and state are not in ops and are never overwritten.
install -o root -g root -m 644 "$package"/ops/* "$package/ops/.env.example" "$TF_ROOT/"
export RELEASE_ID=$release
compose config --quiet
compose up -d --wait --wait-timeout 120 --no-recreate db
printf '\nApplying explicit database migrations...\n'
compose run --rm -T --no-deps --entrypoint /app/efbundle api

cp -R --no-preserve=ownership,mode "$package/frontend" "$TF_ROOT/web/releases/$release"
chmod -R u=rwX,go=rX "$TF_ROOT/web/releases/$release"
# Hash-named files are never removed during publication. Earlier PWAs keep working.
cp -R --no-preserve=ownership,mode "$package/frontend/assets/." "$TF_ROOT/web/assets/"
chmod -R u=rwX,go=rX "$TF_ROOT/web/assets"
compose up -d --no-deps --wait --wait-timeout 120 api
activate_web "$release"
compose up -d --no-deps --force-recreate --wait --wait-timeout 120 caddy
if [[ -n "$previous" ]]; then printf '%s\n' "$previous" > "$TF_ROOT/state/previous"; fi
printf '%s\n' "$release" > "$TF_ROOT/state/current.tmp"
mv "$TF_ROOT/state/current.tmp" "$TF_ROOT/state/current"
trap - ERR
printf '\nRelease %s is running. Check Caddy certificate logs and HTTPS using the guide.\n' "$release"
