#!/usr/bin/env bash
# Builds the accordion fixture TWICE from the SAME fixture directory -- once
# at Hugo's default Markdown settings and once with fixture/unsafe.toml
# layered over them -- and runs the Node build-output assertion suite against
# both trees.
#
# WHY TWO BUILDS. Everything the module emits is raw HTML, and an item's body
# goes back through Goldmark (.Page.RenderString), whose default
# markup.goldmark.renderer.unsafe = false REPLACES raw HTML with an omission
# comment. So an accordion nested inside another accordion's item -- and any
# other HTML-emitting shortcode there -- is silently dropped at the default
# settings and rendered whole with unsafe enabled. Both are real consumer
# configurations, the README documents the remedy, and only a pair of builds
# can prove BOTH the limitation and the remedy rather than asserting whichever
# one the fixture happened to be configured for.
#
# The two builds some sibling suites carry for a subpath baseURL and for
# canonifyURLs are deliberately absent instead: this module emits no URL at
# all -- its only href-shaped output is a fragment id, which is
# baseURL-independent -- so both would publish byte-identical trees with
# nothing to assert. The fixture DOES render two output formats (html and the
# markdown twin) from each build, which is where the module's second template
# surface is proven.
#
# NETWORK: none. The module fetches nothing at build time, so this suite runs
# fully offline and every asserted byte comes from the fixture's own content.
#
# THE WARN GATE IS DELIBERATELY ABSENT here, and 05-warnings.spec.js is what
# replaces it: the fixture exercises every degradation path on purpose, so a
# blanket WARN failure would fail the suite on its own subject matter. That
# spec asserts the EXACT set of warnings instead, which is strictly stronger
# -- a warning that stops firing fails it just as loudly as an unexpected new
# one. ERROR and deprecation lines remain hard failures.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"
LOG_FILE_UNSAFE="$HERE/hugo-build-unsafe.log"

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root (hugo-build*.log). Only
# an interrupt discards them.
# Belt-and-suspenders cleanup, mirroring the sibling suites. These are finite
# foreground builds rather than a server, so nothing should survive -- but a
# build interrupted mid-flight can leave a hugo process holding the public/
# lock, and the next runner's pre-launch check would then refuse to start for
# a reason that looks unrelated.
kill_stray_hugo() {
  if command -v pkill >/dev/null 2>&1; then
    pkill hugo 2>/dev/null || true
  else
    taskkill //F //IM hugo.exe >/dev/null 2>&1 || true
  fi
}
cleanup_interrupted() {
  kill_stray_hugo
  rm -f "$LOG_FILE" "$LOG_FILE_UNSAFE"
}

cd "$HERE"

# ---- Pre-launch process check ----
# `pgrep -x` matches the process NAME, the semantic twin of the tasklist
# IMAGENAME filter below. `-f` would match the whole command line, and this
# checkout is named hugo-artifacts, so a runner invoked by absolute path
# matches ITSELF and aborts -- which is exactly what a CI workspace path such
# as /home/runner/work/hugo-artifacts/hugo-artifacts produces.
#
# The cleanup traps are registered AFTER this check, and the ordering is
# load-bearing: the check exists to hand a foreign hugo process -- a dev
# server serving some other project -- back to the human, and a trap
# registered above it would fire on this very abort and kill the process the
# message just said to go and deal with. Registered here, the traps can only
# ever kill strays of this runner's own builds, because a passed check proves
# no foreign hugo existed when they armed.
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
trap kill_stray_hugo EXIT

build() {
  local dest="$1" log="$2" config="$3"
  (cd "$FIXTURE_DIR" && hugo --gc --logLevel info --cleanDestinationDir --config "$config" --destination "$dest") > "$log" 2>&1 || {
    echo "hugo build failed (${dest}):" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$log"; then
    echo "Hugo reported deprecations (${dest}):" >&2
    grep -i "deprecat" "$log" >&2
    exit 1
  fi
  if grep -q "ERROR" "$log"; then
    echo "Hugo reported errors (${dest}):" >&2
    grep "ERROR" "$log" >&2
    exit 1
  fi
  if grep -q "found no layout file" "$log"; then
    echo "Hugo reported a missing layout (${dest}):" >&2
    grep "found no layout file" "$log" >&2
    exit 1
  fi
}

# ---- Stale-output purge ----
# Hugo's --cleanDestinationDir only removes files that no longer exist in the
# static directories, and never removes dot-prefixed paths at all, so a
# document a previous build published and this one does not would survive into
# the trees these specs read. The destination root is removed outright
# instead: both destinations live under it.
rm -rf "$FIXTURE_DIR/public"

build public/default "$LOG_FILE" hugo.toml
build public/unsafe "$LOG_FILE_UNSAFE" hugo.toml,unsafe.toml

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/default"
export FIXTURE_PUBLIC_UNSAFE="$FIXTURE_DIR/public/unsafe"
export HUGO_BUILD_LOG="$LOG_FILE"
export HUGO_BUILD_LOG_UNSAFE="$LOG_FILE_UNSAFE"

npm test "$@"
