#!/usr/bin/env bash
# Serves the fixture site with hugo and runs the Playwright suite against it.
# Follows the repository's hugo process lifecycle rule: pre-launch process
# check, a deprecation gate on the server log, and belt-and-suspenders
# cleanup (the trap kills the tracked pid AND pkills stray hugo children).
set -euo pipefail

PORT="${PORT:-1616}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/.hugo-server.log"

cleanup() {
  if [[ -n "${HUGO_PID:-}" ]] && kill -0 "$HUGO_PID" 2>/dev/null; then
    kill "$HUGO_PID" 2>/dev/null || true
  fi
  # pkill does not exist in Git Bash on Windows, and killing the tracked pid
  # only signals the wrapping subshell there, so the taskkill fallback is
  # what actually reaps the served hugo.exe (the search runner's approach).
  if command -v pkill >/dev/null 2>&1; then
    pkill hugo 2>/dev/null || true
  else
    taskkill //F //IM hugo.exe >/dev/null 2>&1 || true
  fi
  rm -f "$LOG_FILE"
}

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

# The cleanup trap is registered AFTER the pre-launch check, and the ordering
# is load-bearing: the check exists to hand a foreign hugo process -- a dev
# server serving some other project -- back to the human, and a trap
# registered above it would fire on this very abort and kill the process the
# message just said to go and deal with. Registered here, the trap can only
# ever kill strays of this runner's own builds and server, because a passed
# check proves no foreign hugo existed when it armed.
trap cleanup EXIT INT TERM

# ---- Static overlay: the site-wide kill switch ----
# Built once before the server starts: params.copy_page.enable = false must
# strip every widget root and script tag from the whole build, which the
# suite proves with filesystem assertions against this tree (a second server
# would be wasteful). The log is retained and gitignored (hugo-build*.log).
KILLED_LOG="$HERE/hugo-build-killed.log"
(cd "$FIXTURE_DIR" && hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,killed.toml --destination public/killed) >"$KILLED_LOG" 2>&1 || {
  echo "hugo build failed (killed overlay):" >&2
  cat "$KILLED_LOG" >&2
  exit 1
}
if grep -qi "deprecat" "$KILLED_LOG"; then
  echo "Hugo reported deprecations (killed overlay):" >&2
  grep -i "deprecat" "$KILLED_LOG" >&2
  exit 1
fi

# ---- Static overlays: a subpath deployment, and the same one canonified ----
# The served fixture sits at a domain root, where a URL that keeps the
# baseURL path and one that drops it are byte-identical, so neither mistake
# is visible there. The second build adds canonifyURLs, under which the whole
# Page family stops emitting that path and Hugo repairs the loss in HTML
# attributes only -- never in the Markdown twins this fixture publishes, which
# the widget renders into as well. The two are chained rather than restated so
# they differ in exactly one setting.
overlay_build() { # overlay_build <name> <config chain>
  local name="$1"
  local chain="$2"
  local log="$HERE/hugo-build-$name.log"
  (cd "$FIXTURE_DIR" && hugo --gc --logLevel info --cleanDestinationDir \
    --config "$chain" --destination "public/$name") >"$log" 2>&1 || {
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
overlay_build subpath hugo.toml,subpath.toml
overlay_build subpath-canonify hugo.toml,subpath.toml,canonify.toml

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

# `npm test` rather than `npx playwright test`: npx resolves the binary through
# its own global cache first, and when that cache holds a Playwright of its own
# the run loads two copies at once and dies with "No tests found" -- a failure
# that reads like a missing spec rather than a resolution collision. npm runs
# the package's own script, which resolves the binary from this directory's
# node_modules. Pass Playwright flags after a `--` separator.
cd "$HERE"
FIXTURE_URL="http://localhost:$PORT" npm test "$@"
