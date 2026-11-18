#!/usr/bin/env bash
# Compose wrapper: always selects the production directory, .env and recorded release.
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
if [[ "${1:-}" == apply-geoapify-key ]]; then
  (( $# == 1 )) || fail 'Usage: sudo bash tf.sh apply-geoapify-key'
  (( EUID == 0 )) || fail 'Run apply-geoapify-key with sudo.'
  lock_operations
  [[ -f "$TF_ROOT/state/current" ]] || fail 'No installed release.'
  RELEASE_ID=$(cat "$TF_ROOT/state/current")
  valid_release "$RELEASE_ID"
  validate_geoapify_key "$TF_ROOT/compose.yaml"
  compose up -d --no-deps --force-recreate --wait --wait-timeout 120 api
  exit
fi
compose "$@"
