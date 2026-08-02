#!/usr/bin/env bash
# Serves the fixture site with hugo and runs the Playwright suite against it.
# Follows the repository's hugo process lifecycle rule: pre-launch process
# check, a deprecation gate on the server log, and belt-and-suspenders
# cleanup (the trap kills the tracked pid AND pkills stray hugo children).
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
