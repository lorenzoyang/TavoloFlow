#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
env_file=${1:-"$root/.env.local"}
secret_dir=${2:-"$root/secrets-local"}
project=${3:-tavoloflow-pilot}
[[ "$project" =~ ^[a-z][a-z0-9-]{2,40}$ ]] || { echo 'Invalid project name.' >&2; exit 1; }
[[ ! -e "$env_file" && ! -e "$secret_dir" ]] || { echo 'Refusing to overwrite existing configuration or secrets.' >&2; exit 1; }
mkdir -m 700 -- "$secret_dir"
secret_dir=$(cd -- "$secret_dir" && pwd)
for name in app-db-password migration-db-password platform-password; do
  openssl rand -hex 32 | tr -d '\n' > "$secret_dir/$name"
done
# Local Compose secrets are bind mounts: the non-root container must be able to read the file.
# The containing host directory remains 0700, so other host users cannot traverse it.
chmod 644 "$secret_dir"/*
cat > "$env_file" <<EOF
COMPOSE_PROJECT_NAME=$project
SITE_ADDRESS=https://localhost
ALLOWED_HOSTS=localhost;127.0.0.1
PLATFORM_USERNAME=platform.admin
SECRETS_DIR=$secret_dir
TLS_CONFIG=$root/tls.local.conf
BIND_ADDRESS=127.0.0.1
HTTP_PORT=8088
HTTPS_PORT=8443
PROXY_SUBNET=172.30.80.0/28
PROXY_DYNAMIC_RANGE=172.30.80.8/29
PROXY_IP=172.30.80.2
EOF
echo "Created local configuration: $env_file"
echo 'Secrets are in the protected directory; no password was printed.'
