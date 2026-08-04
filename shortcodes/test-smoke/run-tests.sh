#!/usr/bin/env bash
# Builds the shortcode smoke fixture ONCE with hugo (a BUILD, not a server: no
# port binding, and a finite build exits by itself) and runs the Node
# build-output assertion suite against that one tree.
#
# The five modules this covers ship no suite of their own. Before this existed
# nothing in the repository rendered their templates except a fixture belonging
# to another module, and nothing asserted a byte of their output.
#
# THE WARN GATE IS DELIBERATELY ABSENT, unlike every other runner here. All
# five modules fetch remote data at build time and degrade by warning, which is
# their documented contract, so failing on WARN would fail this suite on any
# runner without network -- an assertion about the environment, not the code.
# ERROR and deprecation are still hard failures, and the suite asserts the one
# warning that must appear (an icon URL under the reserved .invalid TLD, which
# no runner can resolve).
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"
CACHE_DIR="$HERE/.hugo-cache"

# The log is retained after a successful run so the documented re-run recipe
# can read it; it is gitignored at the repo root. Only an interrupt discards it.
trap 'rm -f "$LOG_FILE"' INT TERM

# `pgrep -x` matches the process NAME, the semantic twin of the tasklist
# IMAGENAME filter below. `-f` would match the whole command line, and this
# checkout is named hugo-artifacts, so a runner invoked by absolute path
# matches ITSELF and aborts.
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

# A PRIVATE cache directory, emptied first, and --ignoreCache on top of it.
# Hugo caches remote responses, so a cache populated by any earlier build --
# this fixture's or another site's on the same machine -- would let a fetch
# "succeed" with no network at all and silently produce enriched markup. The
# suite tolerates either shape, but a run whose outcome depends on what a
# previous run left behind is not a run that means anything.
rm -rf "$FIXTURE_DIR/public" "$CACHE_DIR"
(cd "$FIXTURE_DIR" && hugo --logLevel info --cleanDestinationDir \
  --cacheDir "$CACHE_DIR" --ignoreCache --destination public) > "$LOG_FILE" 2>&1 || {
  echo "hugo build failed (shortcode smoke):" >&2
  cat "$LOG_FILE" >&2
  exit 1
}
if grep -qi "deprecat" "$LOG_FILE"; then
  echo "Hugo reported deprecations (shortcode smoke):" >&2
  grep -i "deprecat" "$LOG_FILE" >&2
  exit 1
fi
if grep -q "ERROR" "$LOG_FILE"; then
  echo "Hugo reported errors (shortcode smoke):" >&2
  grep "ERROR" "$LOG_FILE" >&2
  exit 1
fi

export FIXTURE_PUBLIC="$FIXTURE_DIR/public"
export HUGO_BUILD_LOG="$LOG_FILE"

cd "$HERE"
npm test "$@"
