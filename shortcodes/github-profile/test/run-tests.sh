#!/usr/bin/env bash
# Builds the offline github-profile fixture TWICE from the SAME fixture
# directory -- once as a plain build, once with --minify -- and runs the
# Node build-output assertion suite against both. The defect this suite
# exists to pin (Hugo's --minify collapsing the note separator's leading
# space across a tag boundary) is invisible without the minified build,
# which is why both builds are mandatory and the specs receive both
# destinations.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check and belt-and-suspenders cleanup afterward.
#
# NETWORK: none. The fixture shadows the module's remote-fetch partial with
# a canned data file (fixture/layouts/_partials/github-profile/fetch.html
# reading fixture/data/github-profile-fetch.json), so both builds are fully
# offline.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"
LOG_FILE_MINIFIED="$HERE/hugo-build-minified.log"

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
cleanup_interrupted() {
  kill_stray_hugo
  rm -f "$LOG_FILE" "$LOG_FILE_MINIFIED"
}
trap cleanup_interrupted INT TERM
trap kill_stray_hugo EXIT

cd "$HERE"

# ---- Pre-launch process check ----
# `pgrep -x` matches the process NAME, the semantic twin of the tasklist
# IMAGENAME filter below. `-f` would match the whole command line, and this
# checkout is named hugo-artifacts, so a runner invoked by absolute path
# matches ITSELF and aborts -- which is exactly what a CI workspace path
# such as /home/runner/work/hugo-artifacts/hugo-artifacts produces.
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

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/normal"
export FIXTURE_PUBLIC_MINIFIED="$FIXTURE_DIR/public/minified"
export HUGO_BUILD_LOG="$LOG_FILE"
export HUGO_BUILD_LOG_MINIFIED="$LOG_FILE_MINIFIED"

npm test "$@"
