#!/usr/bin/env bash
# Usage, on the server as the deploy user and WITHOUT sudo (it asks for sudo when it needs it):
#   bash /opt/tavoloflow/upgrade.sh [RELEASE_ID]
# Verifies a package that upload-release.sh put in ~/tavoloflow-upload, shows what will change, asks
# for confirmation, then installs it with the package's own install-release.sh. Without RELEASE_ID it
# takes the most recently uploaded package. The first installation stays manual. Guide: docs/*/releasing.md.
# Everything runs from main, called on the last line, so bash reads the whole file first: the installer
# replaces /opt/tavoloflow/upgrade.sh while this copy is still running.
set -euo pipefail

root=/opt/tavoloflow
upload="$HOME/tavoloflow-upload"
release_pattern='^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'
# IDs from build-release.sh start with the UTC build time, which sorts as text.
timestamp_pattern='^[0-9]{8}T[0-9]{6}Z-'

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
sorted() { sed '/^$/d' | LC_ALL=C sort -u; }
indented() { local line; while IFS= read -r line; do printf '  %s\n' "$line"; done; }

newest_upload() {
  local file newest=''
  for file in "$upload"/tavoloflow-*.tar.gz; do
    [[ -f "$file" ]] || continue
    if [[ -z "$newest" || "$file" -nt "$newest" ]]; then newest=$file; fi
  done
  [[ -n "$newest" ]] || fail "No package in $upload: run deploy/upload-release.sh on your computer first."
  newest=${newest##*/}
  newest=${newest#tavoloflow-}
  printf '%s\n' "${newest%.tar.gz}"
}

check_backup_timer() {
  local unit changed=''
  if ! systemctl is-enabled --quiet tavoloflow-backup.timer 2>/dev/null; then
    warn 'Nightly backups are not enabled. Enable them: self-hosting guide, part 1, step 7.'
    return 0
  fi
  for unit in tavoloflow-backup.service tavoloflow-backup.timer; do
    if ! cmp -s "$root/$unit" "/etc/systemd/system/$unit"; then
      warn "This release changed $unit. Copy it to systemd again:"
      printf '  sudo install -o root -g root -m 644 %s/%s /etc/systemd/system/\n' "$root" "$unit" >&2
      changed=1
    fi
  done
  if [[ -n "$changed" ]]; then printf '  sudo systemctl daemon-reload\n' >&2; fi
}

# Tells whether production is still up: the installer stops the old API only after all its checks.
installer_failed() {
  local current=$1 api image=''
  api=$(sudo bash "$root/tf.sh" ps --status running --quiet api 2>/dev/null || true)
  if [[ -n "$api" ]]; then image=$(sudo docker inspect --format '{{.Config.Image}}' "$api" 2>/dev/null || true); fi
  if [[ "$image" == "tavoloflow-api:$current" ]]; then
    fail "The installer stopped before stopping the API: $current is still running. Fix what it reported above (for example in .env) and run this again."
  fi
  fail "The installer stopped after stopping the API. Read the logs first: sudo bash $root/tf.sh logs --tail 100 api db caddy, then follow the self-hosting guide, «When a release goes wrong»."
}

# Removes only packages of releases installed earlier (web/releases/ID exists), except the current and
# the previous one. Packages never installed, and any other file, stay.
clean_uploads() {
  local current previous='' path name id removed=()
  current=$(sudo cat "$root/state/current")
  if sudo test -f "$root/state/previous"; then previous=$(sudo cat "$root/state/previous"); fi
  for path in "$upload"/tavoloflow-*.tar.gz "$upload"/tavoloflow-*.tar.gz.sha256 "$upload"/*/ \
    "$upload"/.*.partial; do
    [[ -e "$path" ]] || continue
    path=${path%/}
    name=${path##*/}
    if [[ -d "$path" && "$name" == .*.partial ]]; then
      id=${name#.}
      id=${id%.partial}
    elif [[ -d "$path" ]]; then
      id=$name
      [[ -f "$path/release.txt" && "$(cat "$path/release.txt")" == "$id" ]] || continue
    else
      id=${name#tavoloflow-}
      id=${id%.sha256}
      id=${id%.tar.gz}
    fi
    [[ "$id" =~ $release_pattern && -d "$root/web/releases/$id" ]] || continue
    [[ "$id" != "$current" && "$id" != "$previous" ]] || continue
    rm -rf -- "$path"
    removed+=("$name")
  done
  if (( ${#removed[@]} )); then
    printf 'Removed from %s (older installed releases):\n' "$upload"
    printf '  %s\n' "${removed[@]}"
  fi
}

main() {
  (( EUID != 0 )) || fail 'Run this as the deploy user, without sudo: it asks for sudo itself.'
  (( $# <= 1 )) || fail 'Usage: bash /opt/tavoloflow/upgrade.sh [RELEASE_ID]'
  [[ -d "$upload" ]] || fail "No folder $upload: run deploy/upload-release.sh on your computer first."
  local release archive dir current origin applied pending unknown answer='' status=0
  if (( $# == 1 )); then
    release=$1
  else
    release=$(newest_upload)
  fi
  [[ "$release" =~ $release_pattern ]] || fail "Invalid release ID: $release"
  archive="tavoloflow-$release.tar.gz"
  [[ -f "$upload/$archive" && -f "$upload/$archive.sha256" ]] ||
    fail "$upload must contain $archive and $archive.sha256: upload them again with deploy/upload-release.sh."
  printf 'Package: %s/%s\n' "$upload" "$archive"
  (cd "$upload" && sha256sum --check --quiet "$archive.sha256") ||
    fail 'The archive differs from its checksum: upload it again.'

  # Extract as deploy, not root, so the archive cannot create root-owned files. The folder appears
  # under its final name only once tar has finished; an existing one (an earlier run) is reused.
  dir="$upload/$release"
  if [[ -d "$dir" ]]; then
    printf 'Using the folder extracted earlier: %s\n' "$dir"
  else
    rm -rf -- "$upload/.$release.partial"
    mkdir -- "$upload/.$release.partial"
    tar -xzf "$upload/$archive" -C "$upload/.$release.partial"
    mv -T -- "$upload/.$release.partial" "$dir"
  fi
  (cd "$dir" && sha256sum --check --quiet SHA256SUMS) ||
    fail "Files in $dir differ from its SHA256SUMS. Remove the folder (rm -rf $dir) and run this again."
  [[ "$(cat "$dir/release.txt")" == "$release" ]] || fail "$dir/release.txt does not name $release."
  [[ -s "$dir/migrations.txt" ]] ||
    fail 'This package has no migrations.txt: install it with the manual procedure of the self-hosting guide.'
  origin=$(cat "$dir/public-origin.txt")

  printf '\nThe next steps need sudo.\n'
  sudo -v
  sudo test -f "$root/state/current" ||
    fail "No release is installed in $root: the first installation is manual (self-hosting guide, part 1)."
  current=$(sudo cat "$root/state/current")
  [[ "$release" != "$current" ]] || fail "$release is already the installed release."
  [[ ! -e "$root/web/releases/$release" ]] ||
    fail "An earlier attempt already used $release. Fix the cause and upload a new release."
  if [[ "$release" =~ $timestamp_pattern && "$current" =~ $timestamp_pattern &&
    "${release:0:16}" < "${current:0:16}" ]]; then
    fail "$release was built before the installed $current. To go back to an earlier release, use rollback.sh (self-hosting guide)."
  fi

  # Compare the package's migration list with the database's EF history table.
  # shellcheck disable=SC2016
  applied=$(sudo bash "$root/tf.sh" exec -T db \
    sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At' \
    <<<'SELECT "MigrationId" FROM "__EFMigrationsHistory";') ||
    fail "Cannot read the applied migrations. Check the containers: sudo bash $root/tf.sh ps"
  pending=$(LC_ALL=C comm -23 <(sorted <"$dir/migrations.txt") <(sorted <<<"$applied"))
  unknown=$(LC_ALL=C comm -13 <(sorted <"$dir/migrations.txt") <(sorted <<<"$applied"))
  if [[ -n "$unknown" ]]; then
    printf 'The database already has migrations that this package does not contain:\n' >&2
    indented <<<"$unknown" >&2
    fail 'The package was built from older code than production. To go back to an earlier release, use rollback.sh.'
  fi

  printf '\nInstalled release: %s\nNew release:       %s\nPublic address:    %s\n' \
    "$current" "$release" "$origin"
  if [[ -n "$pending" ]]; then
    printf 'Migrations to apply:\n'
    indented <<<"$pending"
  else
    printf 'Migrations to apply: none\n'
  fi
  printf '\nThe installer stops the API, backs up, migrates and starts the new API.\n'
  printf 'Until it finishes, pages open but every /api request fails.\n'
  if [[ -n "$pending" ]]; then
    printf 'The backup before the migrations stays on this server. To keep a copy on your computer\n'
    printf 'first, answer n and download the latest backup (self-hosting guide, Backups).\n'
  fi
  read -r -p "Install $release now? [y/N] " answer || true
  if [[ "$answer" != [yY] ]]; then
    printf 'Nothing changed.\n'
    return 0
  fi

  sudo bash "$dir/ops/install-release.sh" "$dir" "$root" || installer_failed "$current"

  printf '\n'
  sudo bash "$root/tf.sh" ps
  if curl --fail --silent --show-error --max-time 15 --output /dev/null "$origin/api/auth/csrf"; then
    printf 'HTTPS check passed: %s/api/auth/csrf answers.\n' "$origin"
  else
    warn "The release is installed, but $origin/api/auth/csrf did not answer. Check: sudo bash $root/tf.sh logs --tail 80 caddy api"
    status=1
  fi
  check_backup_timer
  clean_uploads
  printf '\nDone. Now reload the app on every staff device (releasing guide, after the release).\n'
  return "$status"
}

main "$@"; exit
