#!/usr/bin/env bash
# Builds the fixture site with hugo (a BUILD, not a server: no port binding,
# and a finite build exits by itself) and runs the Node build-output
# assertion suite against the generated HTML and published files. Follows
# the repository's hugo process lifecycle rule with a pre-launch process
# check, and hard-fails on any deprecation or error output in the build log.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"

# The log is retained after a successful run so the documented re-run recipe
# (FIXTURE_PUBLIC=... HUGO_BUILD_LOG=hugo-build.log npm test) can read it; it
# is gitignored at the repo root. Only an interrupt discards it mid-run.
trap 'rm -f "$LOG_FILE"' INT TERM

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

(cd "$FIXTURE_DIR" && hugo --logLevel info --cleanDestinationDir --destination public) > "$LOG_FILE" 2>&1 || {
  echo "hugo build failed:" >&2
  cat "$LOG_FILE" >&2
  exit 1
}

if grep -qi "deprecat" "$LOG_FILE"; then
  echo "Hugo reported deprecations:" >&2
  grep -i "deprecat" "$LOG_FILE" >&2
  exit 1
fi
if grep -q "ERROR" "$LOG_FILE"; then
  echo "Hugo reported errors:" >&2
  grep "ERROR" "$LOG_FILE" >&2
  exit 1
fi

export FIXTURE_PUBLIC="$FIXTURE_DIR/public"
export HUGO_BUILD_LOG="$LOG_FILE"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

cd "$HERE"
npm test "$@"
