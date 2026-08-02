#!/usr/bin/env bash
# Builds the fixture site with hugo (a BUILD, not a server: no port binding,
# and a finite build exits by itself) and runs the Node build-output
# assertion suite against the generated HTML and published files. Follows
# the repository's hugo process lifecycle rule with a pre-launch process
# check, and hard-fails on any deprecation or error output in the build log.
#
# THREE builds run, each with its own captured log: the default fixture at a
# domain-root baseURL, a subpath overlay (../subpath.toml) at a baseURL that
# carries a PATH, and a canonifyURLs overlay (../canonify.toml) on top of that
# subpath baseURL. The second exists because a domain-root baseURL cannot tell
# a correct static-path resolution from a broken one -- Hugo discards the
# baseURL path for a value that already starts with "/" -- so it is the only
# build where a dropped baseURL path is visible. The third exists because
# canonifyURLs makes relURL stop emitting the baseURL path altogether, which
# the HTML post-processor compensates for and the Markdown output format does
# not.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"
SUBPATH_DIR="$FIXTURE_DIR/public/subpath"
SUBPATH_LOG_FILE="$HERE/hugo-build-subpath.log"
CANONIFY_DIR="$FIXTURE_DIR/public/canonify"
CANONIFY_LOG_FILE="$HERE/hugo-build-canonify.log"

# All three logs are retained after a successful run so the documented re-run
# recipe (FIXTURE_PUBLIC=... HUGO_BUILD_LOG=hugo-build.log
# IMAGES_SUBPATH_PUBLIC=fixture/public/subpath
# IMAGES_CANONIFY_PUBLIC=fixture/public/canonify npm test) can read them; they
# are gitignored at the repo root. Only an interrupt discards them mid-run.
trap 'rm -f "$LOG_FILE" "$SUBPATH_LOG_FILE" "$CANONIFY_LOG_FILE"' INT TERM

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

# ---- Subpath build: the same fixture under a path-carrying baseURL ----
# Published INSIDE fixture/public (as public/subpath), so the repository's
# public/-scoped ignore rules cover its output; it MUST therefore run AFTER
# the default build, whose --cleanDestinationDir over public/ would wipe it.
# tests/helpers.js skips this directory when it walks public/ recursively.
(cd "$FIXTURE_DIR" && hugo --logLevel info --cleanDestinationDir \
  --config hugo.toml,../subpath.toml --destination public/subpath) > "$SUBPATH_LOG_FILE" 2>&1 || {
  echo "hugo build failed (subpath overlay):" >&2
  cat "$SUBPATH_LOG_FILE" >&2
  exit 1
}

if grep -qi "deprecat" "$SUBPATH_LOG_FILE"; then
  echo "Hugo reported deprecations (subpath overlay):" >&2
  grep -i "deprecat" "$SUBPATH_LOG_FILE" >&2
  exit 1
fi
if grep -q "ERROR" "$SUBPATH_LOG_FILE"; then
  echo "Hugo reported errors (subpath overlay):" >&2
  grep "ERROR" "$SUBPATH_LOG_FILE" >&2
  exit 1
fi

# ---- canonifyURLs build: the subpath overlay plus canonifyURLs ----
# Published alongside the subpath build inside fixture/public, for the same
# ignore-rule reason and with the same must-run-after-the-default ordering.
(cd "$FIXTURE_DIR" && hugo --logLevel info --cleanDestinationDir \
  --config hugo.toml,../subpath.toml,../canonify.toml --destination public/canonify) > "$CANONIFY_LOG_FILE" 2>&1 || {
  echo "hugo build failed (canonifyURLs overlay):" >&2
  cat "$CANONIFY_LOG_FILE" >&2
  exit 1
}

if grep -qi "deprecat" "$CANONIFY_LOG_FILE"; then
  echo "Hugo reported deprecations (canonifyURLs overlay):" >&2
  grep -i "deprecat" "$CANONIFY_LOG_FILE" >&2
  exit 1
fi
if grep -q "ERROR" "$CANONIFY_LOG_FILE"; then
  echo "Hugo reported errors (canonifyURLs overlay):" >&2
  grep "ERROR" "$CANONIFY_LOG_FILE" >&2
  exit 1
fi

export FIXTURE_PUBLIC="$FIXTURE_DIR/public"
export HUGO_BUILD_LOG="$LOG_FILE"
export IMAGES_SUBPATH_PUBLIC="$SUBPATH_DIR"
export IMAGES_CANONIFY_PUBLIC="$CANONIFY_DIR"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

cd "$HERE"
npm test "$@"
