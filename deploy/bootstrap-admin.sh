#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
lock_operations
mode=${1:---seed-platform-admin}
[[ "$mode" == --seed-platform-admin || "$mode" == --reset-platform-password ]] || fail 'Unsupported command'
[[ "$RELEASE_ID" != uninstalled ]] || fail 'Install a release first.'
read -r -p 'Platform administrator username: ' PlatformBootstrap__Username
read -r -s -p 'Platform administrator password (6-128 characters): ' PlatformBootstrap__Password
printf '\n'
read -r -s -p 'Repeat password: ' repeated
printf '\n'
[[ "$PlatformBootstrap__Password" == "$repeated" ]] || fail 'Passwords differ.'
unset repeated
export PlatformBootstrap__Username PlatformBootstrap__Password
trap 'unset PlatformBootstrap__Username PlatformBootstrap__Password' EXIT
# -e NAME passes the environment by name; no password appears in argv or shell history.
compose run --rm -T --no-deps -e PlatformBootstrap__Username -e PlatformBootstrap__Password api "$mode"
