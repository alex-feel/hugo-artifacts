#!/usr/bin/env bash
# Builds the composition fixture ONCE with hugo (a BUILD, not a server: no
# port binding, and a finite build exits by itself) and runs the Node
# build-output assertion suite against that one tree.
#
# One build is the whole point. The three modules are each proven alone by
# their own suite; what none of those fixtures can see is the surface the
# modules SHARE -- the consuming site's single [outputs] table. Hugo replaces
# the output list per page kind and never merges a module's own [outputs], so
# a consumer following two module READMEs literally ends up either with two
# [outputs] tables in one file (a config-load failure) or with one table
# replacing the other (an exit-0 build that silently stops publishing
# documents). This build holds the merged list that publishes all of them.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check, and hard-fails on any deprecation or error output in the
# build log.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"

# The log is retained after a successful run so the documented re-run recipe
# can read it; it is gitignored at the repo root. Only an interrupt discards
# it mid-run.
trap 'rm -f "$LOG_FILE"' INT TERM

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

# The destination is REMOVED, not merely cleaned. --cleanDestinationDir only
# removes files that no longer exist in the static directories, so a document
# a previous build published and this one does not would survive into the
# tree these specs read -- and a dropped format would then assert green off
# stale bytes. Removing the tree is what makes the presence assertions mean
# "this build published it".
rm -rf "$FIXTURE_DIR/public"
(cd "$FIXTURE_DIR" && hugo --logLevel info --cleanDestinationDir --destination public) > "$LOG_FILE" 2>&1 || {
  echo "hugo build failed (composition):" >&2
  cat "$LOG_FILE" >&2
  exit 1
}
if grep -qi "deprecat" "$LOG_FILE"; then
  echo "Hugo reported deprecations (composition):" >&2
  grep -i "deprecat" "$LOG_FILE" >&2
  exit 1
fi
if grep -q "ERROR" "$LOG_FILE"; then
  echo "Hugo reported errors (composition):" >&2
  grep "ERROR" "$LOG_FILE" >&2
  exit 1
fi

export FIXTURE_PUBLIC="$FIXTURE_DIR/public"
export HUGO_BUILD_LOG="$LOG_FILE"

cd "$HERE"
npm test "$@"
