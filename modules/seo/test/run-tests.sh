#!/usr/bin/env bash
# Builds the fixture site THREE TIMES with hugo (a BUILD, not a server: no port
# binding, and a finite build exits by itself) and runs the Node
# build-output assertion suite against all three trees.
#
# The three builds are the point of this suite. The default environment omits
# [seo.alternates], [seo.links] and [seo] content_license entirely, so it
# proves those additions are INERT when unconfigured; the `configured`
# environment adds exactly those three blocks, so it proves each surface
# appears when they are set. An assertion that only ever saw one of those two
# builds could not tell "works" from "always on". The `subpath` environment
# repeats the configured surfaces under a baseURL that carries a PATH, which
# is the only shape that can tell a correct URL absolutization from a broken
# one -- at a domain root the two emit identical bytes.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check, and hard-fails on any deprecation or error output in any
# build log.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"
LOG_FILE_CONFIGURED="$HERE/hugo-build-configured.log"
LOG_FILE_SUBPATH="$HERE/hugo-build-subpath.log"

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
trap 'rm -f "$LOG_FILE" "$LOG_FILE_CONFIGURED" "$LOG_FILE_SUBPATH"' INT TERM

if command -v pgrep >/dev/null 2>&1; then
  if pgrep -af hugo >/dev/null 2>&1; then
    echo "A hugo process is already running; stop it first (pkill hugo)." >&2
    exit 1
  fi
elif command -v tasklist >/dev/null 2>&1; then
  if tasklist //FI "IMAGENAME eq hugo.exe" 2>/dev/null | grep -qi "hugo.exe"; then
    echo "A hugo process is already running; stop it first: taskkill /F /IM hugo.exe" >&2
    exit 1
  fi
fi

build() {
  local env_name="$1" dest="$2" log="$3"
  local args=(--logLevel info --cleanDestinationDir --destination "$dest")
  if [ -n "$env_name" ]; then
    args+=(-e "$env_name")
  fi
  (cd "$FIXTURE_DIR" && hugo "${args[@]}") > "$log" 2>&1 || {
    echo "hugo build failed (${env_name:-default}):" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$log"; then
    echo "Hugo reported deprecations (${env_name:-default}):" >&2
    grep -i "deprecat" "$log" >&2
    exit 1
  fi
  if grep -q "ERROR" "$log"; then
    echo "Hugo reported errors (${env_name:-default}):" >&2
    grep "ERROR" "$log" >&2
    exit 1
  fi
}

build "" public/baseline "$LOG_FILE"
build configured public/configured "$LOG_FILE_CONFIGURED"
build subpath public/subpath "$LOG_FILE_SUBPATH"

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/baseline"
export FIXTURE_PUBLIC_CONFIGURED="$FIXTURE_DIR/public/configured"
export FIXTURE_PUBLIC_SUBPATH="$FIXTURE_DIR/public/subpath"
export HUGO_BUILD_LOG="$LOG_FILE"
export HUGO_BUILD_LOG_CONFIGURED="$LOG_FILE_CONFIGURED"
export HUGO_BUILD_LOG_SUBPATH="$LOG_FILE_SUBPATH"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

cd "$HERE"
npm test "$@"
