#!/usr/bin/env bash
# Serves the fixture site with hugo and runs the Playwright suite against it.
# Follows the repository's hugo process lifecycle rule: pre-launch process
# check, a deprecation gate on the server log, and belt-and-suspenders
# cleanup (the trap kills the tracked pid AND pkills stray hugo children).
#
# Nine STATIC builds run first, before the server starts. They exist because
# the module has states the single served fixture cannot be in at once -- a
# hostile site title, which proves the OpenSearch document escapes what it
# interpolates; the default-off gate, which is what every consumer gets until
# they opt in; a subpath baseURL, the only place a discarded baseURL path is
# visible; scalar values written for the table-valued config keys, whose
# warnings the suite counts from the captured build log; a single-page corpus
# of edge-case front matter, which proves the index round-trips the authored
# characters; the three list-valued keys written as tables, as booleans and
# as lists, which is the shape matrix the resolver degrades over; and a
# per-language override of two site-scoped keys. All are plain builds, so
# they cost a few seconds and bind no port; each one's output is captured
# next to its destination directory as <dir>.log.
set -euo pipefail

PORT="${PORT:-1515}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/.hugo-server.log"
OPENSEARCH_HOSTILE_DIR="$HERE/.opensearch-hostile"
OPENSEARCH_OFF_DIR="$HERE/.opensearch-off"
SUBPATH_DIR="$HERE/.subpath"
SCALAR_TABLES_DIR="$HERE/.scalar-tables"
SERIALIZATION_DIR="$HERE/.serialization"
SHAPE_TABLES_DIR="$HERE/.shape-tables"
SHAPE_BOOLS_DIR="$HERE/.shape-bools"
SHAPE_LISTS_DIR="$HERE/.shape-lists"
MULTILINGUAL_DIR="$HERE/.multilingual"

# Git Bash on Windows ships neither pgrep nor pkill, so both lifecycle steps
# fall back to the Windows-native tasklist/taskkill equivalents there;
# without the fallback the pre-launch check silently passes and the cleanup
# leaks an orphaned hugo.exe.
# `pgrep -x` matches the process NAME, the semantic twin of the tasklist
# IMAGENAME filter; `-f` would match the whole command line, and this
# checkout is named hugo-artifacts, so the runner would match ITSELF.
hugo_running() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -x hugo >/dev/null 2>&1
  else
    tasklist 2>/dev/null | grep -qi "hugo.exe"
  fi
}

kill_stray_hugo() {
  if command -v pkill >/dev/null 2>&1; then
    pkill hugo 2>/dev/null || true
  else
    taskkill //F //IM hugo.exe >/dev/null 2>&1 || true
  fi
}

cleanup() {
  if [[ -n "${HUGO_PID:-}" ]] && kill -0 "$HUGO_PID" 2>/dev/null; then
    kill "$HUGO_PID" 2>/dev/null || true
  fi
  kill_stray_hugo
  rm -f "$LOG_FILE"
  for dir in "$OPENSEARCH_HOSTILE_DIR" "$OPENSEARCH_OFF_DIR" "$SUBPATH_DIR" "$SCALAR_TABLES_DIR" \
    "$SERIALIZATION_DIR" "$SHAPE_TABLES_DIR" "$SHAPE_BOOLS_DIR" "$SHAPE_LISTS_DIR" "$MULTILINGUAL_DIR"; do
    rm -rf "$dir"
    rm -f "$dir.log"
  done
}
trap cleanup EXIT INT TERM

if hugo_running; then
  echo "A hugo process is already running; stop it first (pkill hugo, or taskkill /F /IM hugo.exe on Windows)." >&2
  exit 1
fi

# ---- Static overlay builds, before the server binds anything ----
# Each build's output lands in <dest>.log (not --quiet: the scalar-tables
# spec counts the config-shape warnings), gated on the same deprecation
# check the served fixture gets.
static_build() {
  local overlay="$1" dest="$2"
  (cd "$FIXTURE_DIR" && hugo --config "hugo.toml,$overlay" --cleanDestinationDir \
    --destination "$dest" >"$dest.log" 2>&1) || {
    echo "Static overlay build failed ($overlay)." >&2
    cat "$dest.log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$dest.log"; then
    echo "Hugo reported deprecations ($overlay):" >&2
    grep -i "deprecat" "$dest.log" >&2
    exit 1
  fi
}
static_build config-opensearch-hostile.toml "$OPENSEARCH_HOSTILE_DIR"
static_build config-opensearch-off.toml "$OPENSEARCH_OFF_DIR"
static_build config-subpath.toml "$SUBPATH_DIR"
static_build config-scalar-tables.toml "$SCALAR_TABLES_DIR"
static_build config-serialization.toml "$SERIALIZATION_DIR"
static_build config-shape-tables.toml "$SHAPE_TABLES_DIR"
static_build config-shape-bools.toml "$SHAPE_BOOLS_DIR"
static_build config-shape-lists.toml "$SHAPE_LISTS_DIR"
static_build config-multilingual.toml "$MULTILINGUAL_DIR"
export OPENSEARCH_HOSTILE_DIR OPENSEARCH_OFF_DIR SUBPATH_DIR SCALAR_TABLES_DIR
export SERIALIZATION_DIR SHAPE_TABLES_DIR SHAPE_BOOLS_DIR SHAPE_LISTS_DIR MULTILINGUAL_DIR

(cd "$FIXTURE_DIR" && hugo server --port "$PORT" --bind 127.0.0.1 --logLevel info >"$LOG_FILE" 2>&1) &
HUGO_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:$PORT/" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done
if [[ "$ready" -ne 1 ]]; then
  echo "Fixture server did not become ready on port $PORT." >&2
  exit 1
fi

if grep -qi "deprecat" "$LOG_FILE"; then
  echo "Hugo reported deprecations:" >&2
  grep -i "deprecat" "$LOG_FILE" >&2
  exit 1
fi

# `npm test` rather than `npx playwright test`: npx resolves the binary
# through its own global cache first, and when that cache holds a Playwright
# of its own the run loads two copies at once and dies with "No tests found"
# -- a failure that reads like a missing spec rather than a resolution
# collision. npm runs the package's own script, which resolves the binary
# from this directory's node_modules. Pass Playwright flags after a `--`
# separator.
cd "$HERE"
FIXTURE_URL="http://localhost:$PORT" npm test "$@"
