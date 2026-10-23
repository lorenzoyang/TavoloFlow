#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
env_file=${1:?Usage: backup.sh ENV_FILE NEW_BACKUP_DIRECTORY}
output=${2:?Specify a new backup directory}
[[ ! -e "$output" ]] || { echo 'Backup destination already exists.' >&2; exit 1; }
dc() { docker compose --env-file "$env_file" -f "$root/compose.yaml" "$@"; }
mkdir -m 700 -- "$output"
touch "$output/INCOMPLETE"
dc exec -T db pg_dump -U tavoloflow_migrator -d tavoloflow -Fc > "$output/database.dump"
# Take keys after the consistent database dump so any key used by that snapshot is included.
dc run --rm -T --no-deps --user 0 --entrypoint tar api -C /var/lib/tavoloflow/keys -czf - . > "$output/keys.tar.gz"
dc exec -T db psql -U tavoloflow_migrator -d tavoloflow -At -c 'SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY "MigrationId"' > "$output/migrations.txt"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$output/created-at.txt"
(cd -- "$output" && sha256sum database.dump keys.tar.gz migrations.txt created-at.txt > SHA256SUMS)
chmod 600 "$output"/*
rm -- "$output/INCOMPLETE"
echo "Backup completed: $output (contains sensitive data and encryption keys)."
