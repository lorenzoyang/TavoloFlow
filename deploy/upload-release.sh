#!/usr/bin/env bash
# Usage, on your computer, from anywhere in the repository:
#   PUBLIC_ORIGIN=https://app.example.com DEPLOY_SSH=tavoloflow bash deploy/upload-release.sh
# Builds a release package and uploads it to ~/tavoloflow-upload on the server, where it is verified.
# It never installs anything: afterwards, on the server, run bash /opt/tavoloflow/upgrade.sh.
# DEPLOY_SSH is any SSH destination, preferably a Host alias from ~/.ssh/config. Guide: docs/*/releasing.md.
set -euo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"
: "${PUBLIC_ORIGIN:?Set PUBLIC_ORIGIN to your public HTTPS origin, for example https://app.example.com}"
: "${DEPLOY_SSH:?Set DEPLOY_SSH to the server SSH destination, for example a Host alias from ~/.ssh/config}"
export PUBLIC_ORIGIN
[[ "$DEPLOY_SSH" =~ ^[A-Za-z0-9._@][A-Za-z0-9._@-]*$ ]] || fail 'DEPLOY_SSH must be a host, user@host or a Host alias.'

# The release ID names the commit, but the build reads the working tree: the two must match.
[[ -z "$(git status --porcelain)" ]] ||
  fail 'Commit or remove local changes first, untracked files included: the release ID names the commit, but the build reads the working tree.'
commit=$(git rev-parse --short HEAD)
printf 'Commit: %s\n' "$(git log -1 --format='%h %s')"
# A reminder only: the hosted service should run code that the public repository also shows.
if [[ -z "$(git branch -r --contains HEAD)" ]]; then
  printf 'Reminder: commit %s is not on any remote branch yet (as of your last fetch or push).\n' "$commit"
fi
docker info >/dev/null 2>&1 || fail 'Docker is not running. Start it and try again.'

# One SSH connection for the whole run: a key passphrase is asked at most once, before the build.
control=$(mktemp -d)
ssh_options=(-o ControlMaster=auto -o "ControlPath=$control/connection" -o ControlPersist=yes
  -o ServerAliveInterval=30)
close_connection() {
  ssh "${ssh_options[@]}" -O exit "$DEPLOY_SSH" >/dev/null 2>&1 || true
  rm -rf -- "$control"
}
trap close_connection EXIT
ssh "${ssh_options[@]}" "$DEPLOY_SSH" 'mkdir -p ~/tavoloflow-upload' ||
  fail "Cannot reach $DEPLOY_SSH over SSH. Check that ssh $DEPLOY_SSH works on its own."

release="$(date -u +%Y%m%dT%H%M%SZ)-$commit"
bash deploy/build-release.sh "$release"
archive="tavoloflow-$release.tar.gz"
scp "${ssh_options[@]}" "artifacts/$archive" "artifacts/$archive.sha256" "$DEPLOY_SSH:tavoloflow-upload/"
# Checked where it landed; no sudo needed. upgrade.sh checks it again before installing.
# shellcheck disable=SC2029 # $archive is meant to expand here; it holds only safe ID characters.
ssh "${ssh_options[@]}" "$DEPLOY_SSH" "cd ~/tavoloflow-upload && sha256sum --check $archive.sha256"

printf '\nUploaded and verified on the server: %s\n' "$release"
printf 'To install it, at a quiet time:\n  ssh %s\n  bash /opt/tavoloflow/upgrade.sh\n' "$DEPLOY_SSH"
