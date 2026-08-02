#!/usr/bin/env bash
# Serves the composed fixture site with hugo and runs the Playwright suite
# against it, after three static builds (standalone fixture-bare, killed
# overlay, multilingual overlay) and one intentionally failing build
# (fixture-invalid). Follows the repository's hugo process lifecycle rule:
# pre-launch process check, a deprecation gate on every build/server log, and
# belt-and-suspenders cleanup (the trap kills the tracked pid AND
# pkills/taskkills stray hugo children).
set -euo pipefail

PORT="${PORT:-1717}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
FIXTURE_BARE_DIR="$HERE/fixture-bare"
FIXTURE_INVALID_DIR="$HERE/fixture-invalid"
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
trap cleanup EXIT INT TERM

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

# ---- Static build 1: the standalone fixture (fixture-bare) ----
# Built once, statically, before the server starts: proves the module
# renders its plain-<img> fallback with modules/images absent. Specs assert
# on this tree via fs (the copy-page killed-overlay filesystem pattern),
# so the public/ dir and this log are exported for them below.
export CAROUSEL_BARE_LOG="$HERE/hugo-build-bare.log"
export CAROUSEL_BARE_PUBLIC="$FIXTURE_BARE_DIR/public"
(cd "$FIXTURE_BARE_DIR" && hugo --gc --logLevel info --cleanDestinationDir) >"$CAROUSEL_BARE_LOG" 2>&1 || {
  echo "hugo build failed (fixture-bare):" >&2
  cat "$CAROUSEL_BARE_LOG" >&2
  exit 1
}
if grep -qi "deprecat" "$CAROUSEL_BARE_LOG"; then
  echo "Hugo reported deprecations (fixture-bare):" >&2
  grep -i "deprecat" "$CAROUSEL_BARE_LOG" >&2
  exit 1
fi

# ---- Static build 2: the composed fixture's site-wide kill overlay ----
# params.carousel.enable = false must strip every carousel root and every
# script tag from the whole build, which the suite proves with filesystem
# assertions against this tree (a second server would be wasteful).
export CAROUSEL_KILLED_LOG="$HERE/hugo-build-killed.log"
export CAROUSEL_KILLED_PUBLIC="$FIXTURE_DIR/public/killed"
(cd "$FIXTURE_DIR" && hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,../killed.toml --destination public/killed) >"$CAROUSEL_KILLED_LOG" 2>&1 || {
  echo "hugo build failed (killed overlay):" >&2
  cat "$CAROUSEL_KILLED_LOG" >&2
  exit 1
}
if grep -qi "deprecat" "$CAROUSEL_KILLED_LOG"; then
  echo "Hugo reported deprecations (killed overlay):" >&2
  grep -i "deprecat" "$CAROUSEL_KILLED_LOG" >&2
  exit 1
fi

# ---- Static build 3: the multilingual overlay (en + ru) ----
# Mirrors the modules/agent-readiness multilingual build precedent: a second
# language is the only shape in which module output routed through i18n (here
# i18n/ru.toml) can be proven to resolve for a non-default language rather
# than only ever exercising the English defaults every other build uses.
# content/gallery/index.ru.md is a translate-by-filename sibling of
# content/gallery/index.md, so /ru/gallery/ is a carousel-bearing page whose
# aria strings resolve through i18n/ru.toml. A static build (not the server)
# is enough, since the suite only needs filesystem assertions against the
# published ru markup.
export CAROUSEL_MULTILINGUAL_LOG="$HERE/hugo-build-multilingual.log"
export CAROUSEL_MULTILINGUAL_PUBLIC="$FIXTURE_DIR/public/multilingual"
(cd "$FIXTURE_DIR" && hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,../multilingual.toml --destination public/multilingual) >"$CAROUSEL_MULTILINGUAL_LOG" 2>&1 || {
  echo "hugo build failed (multilingual overlay):" >&2
  cat "$CAROUSEL_MULTILINGUAL_LOG" >&2
  exit 1
}
if grep -qi "deprecat" "$CAROUSEL_MULTILINGUAL_LOG"; then
  echo "Hugo reported deprecations (multilingual overlay):" >&2
  grep -i "deprecat" "$CAROUSEL_MULTILINGUAL_LOG" >&2
  exit 1
fi

# ---- Negative build: fixture-invalid (match + items together) ----
# The shortcode's match/items exclusivity errorf contract must fail the
# build with a non-zero exit and a [carousel]-prefixed message; a
# succeeding build here is itself the failure.
export CAROUSEL_INVALID_LOG="$HERE/hugo-build-invalid.log"
if (cd "$FIXTURE_INVALID_DIR" && hugo --gc --logLevel info --cleanDestinationDir) >"$CAROUSEL_INVALID_LOG" 2>&1; then
  echo "hugo build unexpectedly succeeded for fixture-invalid (match+items must errorf):" >&2
  cat "$CAROUSEL_INVALID_LOG" >&2
  exit 1
fi
if ! grep -q "\[carousel\]" "$CAROUSEL_INVALID_LOG"; then
  echo "fixture-invalid build failed as expected, but the error text did not contain \"[carousel]\":" >&2
  cat "$CAROUSEL_INVALID_LOG" >&2
  exit 1
fi

# ---- Dev server: the composed fixture ----
# Exported so specs can grep this log for the alt-less-slide dedup warning
# (05-a11y-warnings): it is the only build that renders the composed
# gallery page with the alt-less resource AND the module enabled (the
# killed overlay renders the same page with enable=false, emitting no
# warning at all).
export CAROUSEL_SERVER_LOG="$LOG_FILE"
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
  echo "Fixture server did not become ready on port $PORT. Server log:" >&2
  cat "$LOG_FILE" >&2 || true
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
