#!/usr/bin/env bash
# Builds the github-profile fixture THREE TIMES from the SAME fixture
# directory -- plain, with --minify, and origin-backed -- and runs the Node
# build-output assertion suite against all three. The defect the first pair
# exists to pin (Hugo's --minify collapsing the note separator's leading
# space across a tag boundary) is invisible without the minified build, which
# is why both offline builds are mandatory and the specs receive both
# destinations. The third build layers fixture/origin.toml over the same
# configuration and is the ONE build that fetches: its avatar-fetch page
# renders the shared avatar partial's fetch success arm -- including the
# false arm of the templates.Exists probe for the OPTIONAL url-retirement
# sibling, which only a site importing github-profile ALONE can take.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check and belt-and-suspenders cleanup afterward.
#
# NETWORK: loopback only. The fixture shadows the module's remote-fetch
# partial with a canned data file (fixture/layouts/_partials/github-profile/
# fetch.html reading fixture/data/github-profile-fetch.json), so the first
# two builds are fully offline; the third fetches one avatar image from
# serve-origin.mjs, a static origin over the committed fixture-origin/
# corpus, listening on 127.0.0.1.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"
LOG_FILE_MINIFIED="$HERE/hugo-build-minified.log"
LOG_FILE_ORIGIN="$HERE/hugo-build-origin.log"
ORIGIN_LOG="$HERE/fixture-origin.log"
ORIGIN_PORT=1717
ORIGIN_PID=""

# The logs are retained after a successful run so the documented re-run
# recipe can read them; they are gitignored at the repo root
# (hugo-build*.log). Only an interrupt discards them mid-run.
# Belt-and-suspenders cleanup, mirroring modules/agent-readiness/test/run-tests.sh.
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
stop_origin() {
  if [ -n "$ORIGIN_PID" ]; then
    kill "$ORIGIN_PID" 2>/dev/null || true
    wait "$ORIGIN_PID" 2>/dev/null || true
    ORIGIN_PID=""
  fi
}
cleanup_exit() {
  stop_origin
  kill_stray_hugo
}
cleanup_interrupted() {
  cleanup_exit
  rm -f "$LOG_FILE" "$LOG_FILE_MINIFIED" "$LOG_FILE_ORIGIN" "$ORIGIN_LOG"
}

cd "$HERE"

# ---- Pre-launch process check ----
# `pgrep -x` matches the process NAME, the semantic twin of the tasklist
# IMAGENAME filter below. `-f` would match the whole command line, and this
# checkout is named hugo-artifacts, so a runner invoked by absolute path
# matches ITSELF and aborts -- which is exactly what a CI workspace path
# such as /home/runner/work/hugo-artifacts/hugo-artifacts produces.
#
# The cleanup traps are registered AFTER this check, and the ordering is
# load-bearing: the check exists to hand a foreign hugo process -- a dev
# server serving some other project -- back to the human, and a trap
# registered above it would fire on this very abort and taskkill the process
# the message just said to go and deal with. Registered here, the traps can
# only ever kill strays of this runner's own builds, because a passed check
# proves no foreign hugo existed when they armed.
if command -v pgrep >/dev/null 2>&1; then
  if pgrep -x hugo >/dev/null 2>&1; then
    echo "A hugo process is already running; stop it first (pkill hugo)." >&2
    exit 1
  fi
elif command -v tasklist >/dev/null 2>&1; then
  if tasklist //FI "IMAGENAME eq hugo.exe" 2>/dev/null | grep -qi "hugo.exe"; then
    echo "A hugo process is already running; stop it first: taskkill /F /IM hugo.exe" >&2
    exit 1
  fi
fi
trap cleanup_interrupted INT TERM
trap cleanup_exit EXIT

if [ ! -d "$HERE/node_modules" ]; then
  npm install
fi

build() {
  local dir="$1" dest="$2" log="$3" extra_flags="$4"
  local args=(--gc --logLevel info --cleanDestinationDir --destination "$dest")
  if [ -n "$extra_flags" ]; then
    args+=($extra_flags)
  fi
  (cd "$dir" && hugo "${args[@]}") > "$log" 2>&1 || {
    echo "hugo build failed (${dest} in ${dir}):" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$log"; then
    echo "Hugo reported deprecations (${dest} in ${dir}):" >&2
    grep -i "deprecat" "$log" >&2
    exit 1
  fi
  if grep -q "ERROR" "$log"; then
    echo "Hugo reported errors (${dest} in ${dir}):" >&2
    grep "ERROR" "$log" >&2
    exit 1
  fi
  if grep -q "found no layout file" "$log"; then
    echo "Hugo reported a missing layout (${dest} in ${dir}):" >&2
    grep "found no layout file" "$log" >&2
    exit 1
  fi
}

# ---- Stale-output purge ----
# Hugo's --cleanDestinationDir never deletes dot-prefixed paths, so a stale
# .well-known/ artifact -- or the whole abandoned destination directory --
# survives every rebuild. The destination root is removed outright before
# both builds instead: public/normal and public/minified are both under it.
rm -rf "$FIXTURE_DIR/public"

build "$FIXTURE_DIR" public/normal "$LOG_FILE" ""
build "$FIXTURE_DIR" public/minified "$LOG_FILE_MINIFIED" "--minify"

# ---- The origin-backed build ----
# The origin serves only this build and is stopped right after it, with the
# EXIT trap as the backstop. The stop first clears an origin left behind by an
# aborted Windows run, which has no trap; a port held by anything else makes
# the listen fail, which `wait` reports with the server's own message rather
# than letting the build fetch from whatever is actually there.
node "$HERE/serve-origin.mjs" stop >/dev/null 2>&1 || true
node "$HERE/serve-origin.mjs" serve "$ORIGIN_PORT" > "$ORIGIN_LOG" 2>&1 &
ORIGIN_PID=$!
if ! node "$HERE/serve-origin.mjs" wait "$ORIGIN_PORT"; then
  echo "The fixture origin did not start on 127.0.0.1:${ORIGIN_PORT}:" >&2
  cat "$ORIGIN_LOG" >&2
  exit 1
fi
build "$FIXTURE_DIR" public/origin "$LOG_FILE_ORIGIN" "--config hugo.toml,origin.toml"
stop_origin

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/normal"
export FIXTURE_PUBLIC_MINIFIED="$FIXTURE_DIR/public/minified"
export FIXTURE_PUBLIC_ORIGIN="$FIXTURE_DIR/public/origin"
export HUGO_BUILD_LOG="$LOG_FILE"
export HUGO_BUILD_LOG_MINIFIED="$LOG_FILE_MINIFIED"
export HUGO_BUILD_LOG_ORIGIN="$LOG_FILE_ORIGIN"

npm test "$@"
