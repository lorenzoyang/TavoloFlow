#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
backup=$(cd -- "${1:?Usage: restore-isolated.sh BACKUP_DIRECTORY NEW_ENV_FILE}" && pwd)
env_file=${2:?Specify an independent target environment file}
[[ ! -e "$backup/INCOMPLETE" ]] || { echo 'Incomplete backup refused.' >&2; exit 1; }
(cd -- "$backup" && sha256sum --check SHA256SUMS)
dc() { docker compose --env-file "$env_file" -f "$root/compose.yaml" "$@"; }
project=$(dc config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" &&
   -z "$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ]] || {
  echo 'Target project already contains containers or volumes; refusing to overwrite.' >&2; exit 1;
}
# Key rings contain only root-level XML files. Reject links and path traversal before extracting.
python3 - "$backup/keys.tar.gz" <<'PY'
import sys, tarfile
with tarfile.open(sys.argv[1]) as archive:
    for entry in archive:
        if entry.name in ('.', './') and entry.isdir():
            continue
        name = entry.name.removeprefix('./')
        if not entry.isfile() or '/' in name or not name.endswith('.xml'):
            raise SystemExit('Unexpected key archive entry; restore refused.')
PY
dc up -d --wait db
dc exec -T db pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
  -U tavoloflow_migrator -d tavoloflow < "$backup/database.dump"
dc run --rm -T --no-deps --user 0 --entrypoint sh api -c \
  'tar -xzf - --no-same-owner -C /var/lib/tavoloflow/keys && chown -R 1654:1654 /var/lib/tavoloflow/keys && chmod 700 /var/lib/tavoloflow/keys' < "$backup/keys.tar.gz"
# Quarantine recovered business data. Never resume ordering as a side effect of restore.
dc exec -T db psql -v ON_ERROR_STOP=1 -U tavoloflow_migrator -d tavoloflow <<'SQL'
BEGIN;
UPDATE restaurants SET service_status='SUSPENDED', ordering_enabled=false;
UPDATE restaurant_users SET credential_version=credential_version+1;
UPDATE platform_users SET credential_version=credential_version+1;
COMMIT;
SQL
echo 'Restored into an isolated project. API/web have not been started; ordering is suspended and store/platform tickets are invalidated.'
echo 'Guest tickets and active join codes require separate offline reconciliation before any production cutover.'
