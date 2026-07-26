#!/usr/bin/env bash
# Validates the shipped data files, then builds FOUR fixture sites with hugo
# (builds, not servers: no port binding, and a finite build exits by itself)
# and runs the Node build-output assertion suite against all four.
#
# The data-file check runs FIRST, before any build. That ordering is the
# point: a malformed registry otherwise surfaces as an opaque Hugo failure at
# some unrelated template, and the reader has to work backwards to it.
#
# The four builds:
#   baseline   -- every content-license key unset, proving the license
#                 surfaces are inert until a consumer opts in;
#   configured -- the license table filled and both switches on;
#   minimal    -- almost nothing configured, which is the shape a consumer
#                 gets on import and the only one that can reach the
#                 unconfigured robots.txt, the zero-skills gate and the
#                 sectionless facts document;
#   shadow     -- a fixture shipping its own layouts/robots.txt, proving the
#                 documented silent-override hazard.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check, and hard-fails on any deprecation or error output in any
# build log.
#
# NETWORK: the agent-skills specs exercise a real build-time remote fetch,
# because the digest guarantee cannot be proven without one.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
SHADOW_DIR="$HERE/fixture-shadow"
LOG_FILE="$HERE/hugo-build.log"
LOG_FILE_CONFIGURED="$HERE/hugo-build-configured.log"
LOG_FILE_MINIMAL="$HERE/hugo-build-minimal.log"
LOG_FILE_SHADOW="$HERE/hugo-build-shadow.log"

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
trap 'rm -f "$LOG_FILE" "$LOG_FILE_CONFIGURED" "$LOG_FILE_MINIMAL" "$LOG_FILE_SHADOW"' INT TERM

cd "$HERE"

# ---- Data files first, before anything builds ----
npm run --silent test:data

# ---- Pre-launch process check ----
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
  local dir="$1" env_name="$2" dest="$3" log="$4"
  local args=(--gc --logLevel info --cleanDestinationDir --destination "$dest")
  if [ -n "$env_name" ]; then
    args+=(-e "$env_name")
  fi
  (cd "$dir" && hugo "${args[@]}") > "$log" 2>&1 || {
    echo "hugo build failed (${env_name:-default} in ${dir}):" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$log"; then
    echo "Hugo reported deprecations (${env_name:-default} in ${dir}):" >&2
    grep -i "deprecat" "$log" >&2
    exit 1
  fi
  if grep -q "ERROR" "$log"; then
    echo "Hugo reported errors (${env_name:-default} in ${dir}):" >&2
    grep "ERROR" "$log" >&2
    exit 1
  fi
  if grep -q "found no layout file" "$log"; then
    echo "Hugo reported a missing layout (${env_name:-default} in ${dir}):" >&2
    grep "found no layout file" "$log" >&2
    exit 1
  fi
}

build "$FIXTURE_DIR" "" public/baseline "$LOG_FILE"
build "$FIXTURE_DIR" configured public/configured "$LOG_FILE_CONFIGURED"
build "$FIXTURE_DIR" minimal public/minimal "$LOG_FILE_MINIMAL"
build "$SHADOW_DIR" "" public "$LOG_FILE_SHADOW"

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/baseline"
export FIXTURE_PUBLIC_CONFIGURED="$FIXTURE_DIR/public/configured"
export FIXTURE_PUBLIC_MINIMAL="$FIXTURE_DIR/public/minimal"
export FIXTURE_PUBLIC_SHADOW="$SHADOW_DIR/public"
export HUGO_BUILD_LOG="$LOG_FILE"
export HUGO_BUILD_LOG_CONFIGURED="$LOG_FILE_CONFIGURED"
export HUGO_BUILD_LOG_MINIMAL="$LOG_FILE_MINIMAL"
export HUGO_BUILD_LOG_SHADOW="$LOG_FILE_SHADOW"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

npm test "$@"
