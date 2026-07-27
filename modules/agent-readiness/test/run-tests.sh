#!/usr/bin/env bash
# Validates the shipped data files, then builds TEN fixture sites with hugo
# (builds, not servers: no port binding, and a finite build exits by itself)
# and runs the Node build-output assertion suite against all ten.
#
# The data-file check runs FIRST, before any build. That ordering is the
# point: a malformed registry otherwise surfaces as an opaque Hugo failure at
# some unrelated template, and the reader has to work backwards to it.
#
# The ten builds:
#   baseline   -- every content-license key unset, proving the license
#                 surfaces are inert until a consumer opts in;
#   configured -- the license table filled and both switches on;
#   minimal    -- almost nothing configured, which is the shape a consumer
#                 gets on import and the only one that can reach the
#                 unconfigured robots.txt, the zero-skills gate and the
#                 sectionless facts document;
#   notwins    -- twins switched off site-wide while `markdown` stays wired in
#                 [outputs], the only shape in which llms.txt and about.md can
#                 be caught advertising twin URLs for files that do not exist;
#   multilingual -- a two-language build, the only shape in which the
#                 agent-skills index's default-language gate does anything;
#   llmsoff    -- llms.txt off while `llmstxt` stays wired, the counterpart of
#                 notwins for the other pointed-at document;
#   edge       -- a subpath baseURL plus the misconfigurations no other build
#                 reaches (license url without name, an unrecognized
#                 sitemap_section_target, colliding permalinks);
#   off        -- the master switch and every surface switch false while all
#                 four formats stay wired, the only shape that exercises the
#                 `enable` conjunct in any renderer;
#   badtables  -- the section arrays written as bare strings instead of arrays
#                 of tables, which TOML cannot express alongside the real
#                 tables and so needs a build of its own;
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
LOG_FILE_NOTWINS="$HERE/hugo-build-notwins.log"
LOG_FILE_MULTILINGUAL="$HERE/hugo-build-multilingual.log"
LOG_FILE_LLMSOFF="$HERE/hugo-build-llmsoff.log"
LOG_FILE_EDGE="$HERE/hugo-build-edge.log"
LOG_FILE_OFF="$HERE/hugo-build-off.log"
LOG_FILE_BADTABLES="$HERE/hugo-build-badtables.log"
LOG_FILE_SHADOW="$HERE/hugo-build-shadow.log"

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
# Belt-and-suspenders cleanup, mirroring modules/search/test/run-tests.sh.
# These are finite foreground builds rather than a server, so nothing should
# survive -- but a build interrupted mid-flight can leave a hugo process
# holding the public/ lock, and the next runner's pre-launch check would then
# refuse to start for a reason that looks unrelated.
kill_stray_hugo() {
  if command -v pkill >/dev/null 2>&1; then
    pkill hugo 2>/dev/null || true
  else
    taskkill //F //IM hugo.exe >/dev/null 2>&1 || true
  fi
}
cleanup_interrupted() {
  kill_stray_hugo
  rm -f "$LOG_FILE" "$LOG_FILE_CONFIGURED" "$LOG_FILE_MINIMAL" "$LOG_FILE_NOTWINS"     "$LOG_FILE_MULTILINGUAL" "$LOG_FILE_LLMSOFF" "$LOG_FILE_EDGE" "$LOG_FILE_OFF"     "$LOG_FILE_BADTABLES" "$LOG_FILE_SHADOW"
}
trap cleanup_interrupted INT TERM
trap kill_stray_hugo EXIT

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
build "$FIXTURE_DIR" notwins public/notwins "$LOG_FILE_NOTWINS"
build "$FIXTURE_DIR" multilingual public/multilingual "$LOG_FILE_MULTILINGUAL"
build "$FIXTURE_DIR" llmsoff public/llmsoff "$LOG_FILE_LLMSOFF"
build "$FIXTURE_DIR" edge public/edge "$LOG_FILE_EDGE"
build "$FIXTURE_DIR" off public/off "$LOG_FILE_OFF"
build "$FIXTURE_DIR" badtables public/badtables "$LOG_FILE_BADTABLES"
build "$SHADOW_DIR" "" public "$LOG_FILE_SHADOW"

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/baseline"
export FIXTURE_PUBLIC_CONFIGURED="$FIXTURE_DIR/public/configured"
export FIXTURE_PUBLIC_MINIMAL="$FIXTURE_DIR/public/minimal"
export FIXTURE_PUBLIC_NOTWINS="$FIXTURE_DIR/public/notwins"
export FIXTURE_PUBLIC_MULTILINGUAL="$FIXTURE_DIR/public/multilingual"
export FIXTURE_PUBLIC_LLMSOFF="$FIXTURE_DIR/public/llmsoff"
export FIXTURE_PUBLIC_EDGE="$FIXTURE_DIR/public/edge"
export FIXTURE_PUBLIC_OFF="$FIXTURE_DIR/public/off"
export FIXTURE_PUBLIC_BADTABLES="$FIXTURE_DIR/public/badtables"
export FIXTURE_PUBLIC_SHADOW="$SHADOW_DIR/public"
export HUGO_BUILD_LOG="$LOG_FILE"
export HUGO_BUILD_LOG_CONFIGURED="$LOG_FILE_CONFIGURED"
export HUGO_BUILD_LOG_MINIMAL="$LOG_FILE_MINIMAL"
export HUGO_BUILD_LOG_NOTWINS="$LOG_FILE_NOTWINS"
export HUGO_BUILD_LOG_MULTILINGUAL="$LOG_FILE_MULTILINGUAL"
export HUGO_BUILD_LOG_LLMSOFF="$LOG_FILE_LLMSOFF"
export HUGO_BUILD_LOG_EDGE="$LOG_FILE_EDGE"
export HUGO_BUILD_LOG_OFF="$LOG_FILE_OFF"
export HUGO_BUILD_LOG_BADTABLES="$LOG_FILE_BADTABLES"
export HUGO_BUILD_LOG_SHADOW="$LOG_FILE_SHADOW"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

npm test "$@"
