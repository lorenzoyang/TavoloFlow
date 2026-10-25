#!/usr/bin/env bash
# Usage: bash deploy/smoke-test.sh artifacts/tavoloflow-RELEASE.tar.gz
# Creates ONLY a disposable Compose project and loopback ports; never uses the development DB.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
archive=$(realpath -- "${1:?Provide a built release archive}")
# The installer must run as root. Use a disposable Docker daemon so ownership
# changes and Compose bind mounts stay inside Linux, including on Docker Desktop.
if (( EUID != 0 )); then
  docker build -f "$repo/deploy/Dockerfile.smoke" -t tavoloflow-deployment-test "$repo"
  runner="tavoloflow-smoke-runner-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  trap 'docker rm -fv "$runner" >/dev/null' EXIT
  docker run -d --privileged --name "$runner" -e DOCKER_TLS_CERTDIR= \
    --mount "type=bind,source=$repo/deploy,target=/repo/deploy,readonly" \
    --mount "type=bind,source=$archive,target=/release.tar.gz,readonly" \
    tavoloflow-deployment-test dockerd --host=unix:///var/run/docker.sock >/dev/null
  for _attempt in {1..30}; do
    if docker exec "$runner" docker info >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "$runner" docker info >/dev/null
  # Reuse local base images when available; missing images are pulled by Compose.
  for base_image in postgres:18-alpine caddy:2-alpine; do
    if docker image inspect "$base_image" >/dev/null 2>&1; then
      docker save "$base_image" | docker exec -i "$runner" docker load >/dev/null
    fi
  done
  docker exec "$runner" bash /repo/deploy/smoke-test.sh /release.tar.gz
  exit
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/tavoloflow-smoke.XXXXXX")
chmod 700 "$work"
COMPOSE_PROJECT_NAME="tavoloflow-smoke-$(basename "$work" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
export COMPOSE_PROJECT_NAME
export TAVOLOFLOW_ROOT="$work/server"
mkdir -p "$work/first" "$TAVOLOFLOW_ROOT"
tf() { bash "$TAVOLOFLOW_ROOT/tf.sh" "$@"; }
cleanup() {
  local result=$?
  trap - EXIT
  if [[ -f "$TAVOLOFLOW_ROOT/tf.sh" ]]; then
    if (( result != 0 )); then tf logs --tail 40 api caddy >&2 || true; fi
    tf down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  docker rm -fv "$COMPOSE_PROJECT_NAME-restore" >/dev/null 2>&1 || true
  if [[ -n "${second:-}" ]]; then docker image rm "tavoloflow-api:$second" >/dev/null 2>&1 || true; fi
  rm -rf "$work"
  exit "$result"
}
trap cleanup EXIT
tar -xzf "$archive" -C "$work/first"
(cd "$work/first" && sha256sum --check --quiet SHA256SUMS)
# Local CA is the only Caddy fixture change; no public ACME requests or live DNS changes.
# shellcheck disable=SC2016
sed -i '/email {\$ACME_EMAIL}/a\	local_certs' "$work/first/ops/Caddyfile"
printf 'console.log("old version resource");\n' > "$work/first/frontend/assets/retained-smoke.js"
# The checksum manifest is explicitly excluded from the input list.
# shellcheck disable=SC2094
rehash() { (cd "$1" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS); }
rehash "$work/first"
# Model a deploy-owned upload with group-writable files; never inherit its modes.
chown -hR 10001:10001 "$work/first"
chmod -R ug+rwX "$work/first"
install -d -o root -g root -m 755 "$TAVOLOFLOW_ROOT"
install -o root -g root -m 644 "$work"/first/ops/* "$work/first/ops/.env.example" "$TAVOLOFLOW_ROOT/"
umask 077
cat > "$TAVOLOFLOW_ROOT/.env" <<EOF
DOMAIN=app.qiaotavoloflow.it
ACME_EMAIL=smoke@example.net
POSTGRES_DB=tavoloflow
POSTGRES_USER=tavoloflow
POSTGRES_PASSWORD=$(openssl rand -hex 32)
PROXY_SUBNET=172.30.81.0/24
PROXY_DYNAMIC_RANGE=172.30.81.128/25
CADDY_IP=172.30.81.2
HTTP_PORT=127.0.0.1:18080
HTTPS_PORT=127.0.0.1:18443
EOF
assert_permissions() {
  local unexpected
  unexpected=$(find "$TAVOLOFLOW_ROOT" \( ! -user root -o ! -group root -o \( ! -type l -perm /022 \) \) -print)
  [[ -z "$unexpected" ]] || { printf 'Unsafe deployment permissions:\n%s\n' "$unexpected" >&2; exit 1; }
  [[ "$(stat -c %a "$TAVOLOFLOW_ROOT/.env")" == 600 ]]
  # Make the test parent traversable so denials come from production permissions.
  chmod 755 "$work"
  setpriv --reuid=10001 --regid=10001 --clear-groups bash -s -- "$TAVOLOFLOW_ROOT" <<'CHECK'
set -euo pipefail
root=$1
for path in "$root" "$root/backup.sh" "$root/lib.sh" "$root/compose.yaml"; do
  [[ ! -w "$path" ]]
done
[[ ! -r "$root/.env" ]]
if (printf '\n# tamper\n' >> "$root/backup.sh") 2>/dev/null; then exit 1; fi
if mv "$root/backup.sh" "$root/replaced-backup.sh" 2>/dev/null; then exit 1; fi
if touch "$root/replacement" 2>/dev/null; then exit 1; fi
if [[ -f "$root/web/current/index.html" ]]; then
  [[ -r "$root/web/current/index.html" && ! -w "$root/web/current/index.html" ]]
fi
CHECK
}
assert_permissions
# The same installer must reject an ordinary-user invocation.
if setpriv --reuid=10001 --regid=10001 --clear-groups \
    bash "$work/first/ops/install-release.sh" "$work/first" "$TAVOLOFLOW_ROOT" >/dev/null 2>&1; then
  printf 'Installer unexpectedly accepted a non-root user.\n' >&2; exit 1
fi
bash "$work/first/ops/install-release.sh" "$work/first" "$TAVOLOFLOW_ROOT"
assert_permissions
tf exec -T caddy caddy validate --config /etc/caddy/Caddyfile
tf exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > "$work/root.crt"
for _attempt in {1..30}; do
  if curl --silent --fail --cacert "$work/root.crt" --resolve app.qiaotavoloflow.it:18443:127.0.0.1 \
      https://app.qiaotavoloflow.it:18443/staff/login >/dev/null; then break; fi
  sleep 1
done
printf 'smokeadmin\nDeployment-smoke-123\nDeployment-smoke-123\n' | bash "$TAVOLOFLOW_ROOT/bootstrap-admin.sh"
# Repeated bootstrap and migrations must be harmless.
printf 'smokeadmin\nDeployment-smoke-123\nDeployment-smoke-123\n' | bash "$TAVOLOFLOW_ROOT/bootstrap-admin.sh"
tf run --rm -T --no-deps --entrypoint /app/efbundle api
[[ "$(tf exec -T api id -u)" != 0 ]]
curl --silent --show-error --fail -D "$work/redirect.headers" -o /dev/null \
  -H 'Host: app.qiaotavoloflow.it' http://127.0.0.1:18080/staff
python3 - "$work/redirect.headers" <<'PY'
import pathlib,sys
lines=pathlib.Path(sys.argv[1]).read_text().splitlines()
assert lines[0].split()[1] == '308', lines[0]
headers=dict(line.split(': ',1) for line in lines[1:] if ': ' in line)
assert {key.lower(): value for key,value in headers.items()}['location'] == 'https://app.qiaotavoloflow.it/staff'
PY
# No redirects or business pages for the separate marketing host or an invented www.app alias.
for host in qiaotavoloflow.it www.qiaotavoloflow.it www.app.qiaotavoloflow.it; do
  status=$(curl --silent --show-error -o /dev/null -w '%{http_code}' -H "Host: $host" http://127.0.0.1:18080/staff)
  [[ "$status" == 404 ]] || { printf 'Unexpected HTTP response for %s: %s (expected 404)\n' "$host" "$status" >&2; exit 1; }
done
tf config --format json | python3 -c 'import json,sys; s=json.load(sys.stdin)["services"]; assert not s["api"].get("ports"); assert not s["db"].get("ports")'
python3 "$repo/deploy/smoke-http.py" create "$work" 18443

# Publish a second real package with a different image tag and a changed frontend file set.
second="smoke-$(date -u +%Y%m%dT%H%M%SZ)-two"
cp -a "$work/first" "$work/second"
first=$(cat "$work/first/release.txt")
docker tag "tavoloflow-api:$first" "tavoloflow-api:$second"
docker save "tavoloflow-api:$second" | gzip > "$work/second/api-image.tar.gz"
printf '%s\n' "$second" > "$work/second/release.txt"
rm "$work/second/frontend/assets/retained-smoke.js"
printf '\n<!-- deployment smoke second release -->\n' >> "$work/second/frontend/index.html"
rehash "$work/second"
# Reproduce the previous deployment bug, including the parent directory and .env.
# The upgrade must repair it before running the old backup, and keep old assets.
chown -hR 10001:10001 "$work/second" "$TAVOLOFLOW_ROOT"
chmod -R ug+rwX "$TAVOLOFLOW_ROOT"
# A harmless assertion inside the old backup proves the repair precedes execution.
# shellcheck disable=SC2016
sed -i '2i [[ "$(stat -c %u "$(dirname -- "${BASH_SOURCE[0]}")")" == 0 ]] || exit 90' "$TAVOLOFLOW_ROOT/backup.sh"
bash "$work/second/ops/install-release.sh" "$work/second" "$TAVOLOFLOW_ROOT"
assert_permissions
python3 "$repo/deploy/smoke-http.py" verify "$work" 18443
tf down
tf up -d --wait --wait-timeout 120
python3 "$repo/deploy/smoke-http.py" verify "$work" 18443
bash "$TAVOLOFLOW_ROOT/backup.sh"
assert_permissions
backup=$(find "$TAVOLOFLOW_ROOT/backups" -name 'tavoloflow-*.tar.gz' | sort | tail -1)
mkdir "$work/restore"
tar -xzf "$backup" -C "$work/restore"
(cd "$work/restore" && sha256sum --check --quiet SHA256SUMS)
docker run -d --name "$COMPOSE_PROJECT_NAME-restore" --network none \
  -e POSTGRES_PASSWORD=disposable-restore-only -v /var/lib/postgresql postgres:18-alpine >/dev/null
for _attempt in {1..30}; do
  if docker exec "$COMPOSE_PROJECT_NAME-restore" pg_isready -U postgres >/dev/null; then break; fi
  sleep 1
done
docker exec -i "$COMPOSE_PROJECT_NAME-restore" pg_restore -U postgres -d postgres \
  --no-owner --no-privileges --exit-on-error < "$work/restore/database.dump"
[[ "$(docker exec "$COMPOSE_PROJECT_NAME-restore" psql -U postgres -d postgres -Atc 'SELECT count(*) FROM restaurants')" == 1 ]]
tar -tzf "$work/restore/keys.tar.gz" | grep -q 'key-'
# Restore the key archive through the documented non-root helper, then force a fresh process.
tf stop api
tf run --rm -T --no-deps --entrypoint sh api -ec \
  'find /var/tavoloflow/keys -maxdepth 1 -type f -delete; tar -xzf - -C /var/tavoloflow/keys --no-same-owner' \
  < "$work/restore/keys.tar.gz"
tf up -d --no-deps --force-recreate --wait --wait-timeout 120 api
python3 "$repo/deploy/smoke-http.py" verify "$work" 18443
bash "$TAVOLOFLOW_ROOT/rollback.sh" --schema-compatible "$first"
assert_permissions
python3 "$repo/deploy/smoke-http.py" verify "$work" 18443
printf '\nDeployment smoke test passed: root ownership and write protection, migrations, HTTPS, cookies/CSRF, two releases, restart, backup restore and application rollback.\n'
