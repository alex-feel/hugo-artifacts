#!/usr/bin/env bash
# Serves the fixture site with hugo and runs the Playwright suite against it.
# Follows the repository's hugo process lifecycle rule: pre-launch process
# check, a deprecation gate on the server log, and belt-and-suspenders
# cleanup (the trap kills the tracked pid AND pkills stray hugo children).
set -euo pipefail

PORT="${PORT:-1515}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/.hugo-server.log"

# Git Bash on Windows ships neither pgrep nor pkill, so both lifecycle steps
# fall back to the Windows-native tasklist/taskkill equivalents there;
# without the fallback the pre-launch check silently passes and the cleanup
# leaks an orphaned hugo.exe.
hugo_running() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f hugo >/dev/null 2>&1
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
}
trap cleanup EXIT INT TERM

if hugo_running; then
  echo "A hugo process is already running; stop it first (pkill hugo, or taskkill /F /IM hugo.exe on Windows)." >&2
  exit 1
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

FIXTURE_URL="http://localhost:$PORT" npx playwright test "$@"
