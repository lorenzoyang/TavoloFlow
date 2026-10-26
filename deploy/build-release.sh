#!/usr/bin/env bash
set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"
release=${1:-$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)}
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }

output="$repo/artifacts"
mkdir -p "$output"
archive="$output/tavoloflow-$release.tar.gz"
[[ ! -e "$archive" ]] || { echo 'Release archive already exists; choose a new ID.' >&2; exit 1; }
stage=$(mktemp -d)
trap 'rm -rf "$stage"; rm -f "$archive.part"' EXIT
mkdir -p "$stage/frontend" "$stage/ops"

docker build --platform linux/amd64 --pull --load -f deploy/Dockerfile.api -t "tavoloflow-api:$release" .
docker build --platform linux/amd64 --pull -f deploy/Dockerfile.frontend \
  --build-arg PUBLIC_ORIGIN=https://app.qiaotavoloflow.it --output "type=local,dest=$stage/frontend" .

docker save "tavoloflow-api:$release" | gzip > "$stage/api-image.tar.gz"
docker image inspect --format '{{.Id}}' "tavoloflow-api:$release" > "$stage/image.id"

printf '%s\n' "$release" > "$stage/release.txt"
printf '%s\n' 'https://app.qiaotavoloflow.it' > "$stage/public-origin.txt"
# An explicit allow-list prevents local deployment state or secrets entering the package.
for file in compose.yaml Caddyfile .env.example lib.sh tf.sh install-release.sh bootstrap-admin.sh \
  backup.sh rollback.sh tavoloflow-backup.service tavoloflow-backup.timer; do
  cp "deploy/$file" "$stage/ops/$file"
done
mkdir -p "$stage/docs/zh-CN"
cp docs/deployment-validation.md docs/pwa.md "$stage/docs/"
# Keep the guide under zh-CN/ so its ../pwa.md and ../deployment-validation.md links still resolve.
cp docs/zh-CN/deployment-guide.md "$stage/docs/zh-CN/"

# The checksum manifest is explicitly excluded from the input list.
# shellcheck disable=SC2094
(cd "$stage" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
tar -czf "$archive.part" -C "$stage" .
mv "$archive.part" "$archive"
(cd "$output" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
printf '\nRelease package: %s\nChecksum: %s.sha256\n' "$archive" "$archive"
