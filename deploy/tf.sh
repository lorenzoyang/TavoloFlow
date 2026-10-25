#!/usr/bin/env bash
# Compose wrapper: always selects the production directory, .env and recorded release.
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
compose "$@"
