#!/usr/bin/env bash
# Builds the fixture site once as a STATIC subpath overlay, then serves it and
# runs the Playwright suite against both. Follows the repository's hugo process
# lifecycle rule: pre-launch process check, a deprecation gate on every hugo
# log, and belt-and-suspenders cleanup (the trap kills the tracked pid AND
# pkills stray hugo children).
set -euo pipefail

PORT="${PORT:-1414}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/.hugo-server.log"

cleanup() {
  if [[ -n "${HUGO_PID:-}" ]] && kill -0 "$HUGO_PID" 2>/dev/null; then
    kill "$HUGO_PID" 2>/dev/null || true
  fi
  # pkill does not exist in Git Bash on Windows, and killing the tracked pid
  # only signals the wrapping subshell there, so the taskkill fallback is
  # what actually reaps the served hugo.exe.
  if command -v pkill >/dev/null 2>&1; then
    pkill hugo 2>/dev/null || true
  else
    taskkill //F //IM hugo.exe >/dev/null 2>&1 || true
  fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT INT TERM

# Same reason the cleanup branches: neither pgrep nor pkill ships with Git
# Bash, so a bare pgrep here silently reports "no hugo running" on Windows and
# the pre-launch check passes over a live server.
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

# ---- Static overlays: the two subpath deployment shapes ----
# Built before the server starts, because the served fixture sits at a domain
# root and a domain root CANNOT tell a correct URL absolutization from a
# broken one: absURL discards the baseURL's path for a value that starts with
# "/", so both forms emit identical bytes there. Each overlay differs from
# hugo.toml in exactly one respect, its baseURL, and tests/04-subpath.spec.js
# reads both trees off disk:
#   subpath     baseURL = "http://localhost:1414/docs/" -- catches a value
#               that LOST the baseURL path.
#   schemeless  baseURL = "/docs/" -- catches a Hugo-resolved value that
#               GAINED it twice; under subpath every .Permalink carries a
#               scheme and is waved through untouched, hiding that mistake.
# Each build is finite and binds no port. The logs are retained and gitignored
# (hugo-build*.log). Convention: overlay NAME reads fixture/NAME.toml, writes
# fixture/public/NAME, and logs to hugo-build-NAME.log.
build_overlay() {
  local name="$1"
  local config="$FIXTURE_DIR/$name.toml"
  local log="$HERE/hugo-build-$name.log"
  # hugo drops a nonexistent entry from a --config list and still exits 0, so
  # without this a mistyped overlay name would quietly build the domain-root
  # config and surface as a baffling assertion mismatch instead of a missing
  # file.
  if [[ ! -f "$config" ]]; then
    echo "Missing overlay config: $config" >&2
    exit 1
  fi
  (cd "$FIXTURE_DIR" && hugo --gc --logLevel info --cleanDestinationDir --config "hugo.toml,$name.toml" --destination "public/$name") >"$log" 2>&1 || {
    echo "hugo build failed ($name overlay):" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$log"; then
    echo "Hugo reported deprecations ($name overlay):" >&2
    grep -i "deprecat" "$log" >&2
    exit 1
  fi
  if grep -q "ERROR" "$log"; then
    echo "Hugo reported errors ($name overlay):" >&2
    grep "ERROR" "$log" >&2
    exit 1
  fi
}

SUBPATH_DIR="$FIXTURE_DIR/public/subpath"
SCHEMELESS_DIR="$FIXTURE_DIR/public/schemeless"
build_overlay subpath
build_overlay schemeless

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
FIXTURE_URL="http://localhost:$PORT" \
  FIXTURE_PUBLIC_SUBPATH="$SUBPATH_DIR" \
  FIXTURE_PUBLIC_SCHEMELESS="$SCHEMELESS_DIR" \
  npm test "$@"
