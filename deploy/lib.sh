#!/usr/bin/env bash
# Shared by server-side commands; .env is parsed by Compose, never sourced as shell code.
set -euo pipefail
TF_ROOT="${TAVOLOFLOW_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)}"
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
valid_release() { [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$ ]] || fail "Invalid release ID"; }
[[ -f "$TF_ROOT/.env" ]] || fail "Create $TF_ROOT/.env from .env.example first. See the deployment guide."
if [[ -z "${RELEASE_ID:-}" && -f "$TF_ROOT/state/current" ]]; then
  RELEASE_ID=$(cat "$TF_ROOT/state/current")
fi
export RELEASE_ID="${RELEASE_ID:-uninstalled}"
valid_release "$RELEASE_ID"
compose_with_file() {
  local file=$1
  shift
  docker compose --project-directory "$TF_ROOT" --env-file "$TF_ROOT/.env" -f "$file" "$@"
}
compose() { compose_with_file "$TF_ROOT/compose.yaml" "$@"; }
validate_compose() {
  compose_with_file "$1" config --quiet >/dev/null 2>&1 ||
    fail 'Compose could not read the configuration. Check the .env syntax and required settings.'
}
validate_geoapify_key() {
  local file=$1
  validate_compose "$file"
  # Let Compose set the environment exactly as for the API. Never forward its diagnostics or output.
  if compose_with_file "$file" run --rm -T --no-deps --pull never api --validate-geoapify-key >/dev/null 2>&1; then
    return
  else
    case $? in
      2) fail 'Set GEOAPIFY_API_KEY to a complete Geoapify key, or leave it empty to keep automatic delivery quotes off.' ;;
      *) fail 'Could not run the Geoapify preflight. Check Docker and the release image.' ;;
    esac
  fi
}
lock_operations() {
  if [[ "${TF_LOCK_HELD:-}" != 1 ]]; then
    exec 9>"$TF_ROOT/.operation.lock"
    flock -n 9 || fail "Another release, backup or rollback is running. Try again after it finishes."
    export TF_LOCK_HELD=1
  fi
}
activate_web() {
  local release=$1
  ln -s "releases/$release" "$TF_ROOT/web/.current-$release-$$"
  mv -Tf "$TF_ROOT/web/.current-$release-$$" "$TF_ROOT/web/current"
}
