#!/usr/bin/env bash
# Hugo PWA module validation matrix orchestrator (Linux/macOS).
#
# Three-pass orchestration:
#   Pass 1 (default):  rows 1, 2, 3, 5, 6, 7, 9 against the unmodified fixture.
#                      --grep-invert "Row 4:|Row 8:".
#   Pass 2 (legacy):   row 4 only, against a fixture rebuilt with mode=legacy.
#                      LEGACY_FIXTURE=1, --grep "Row 4:".
#   Pass 3 (v1->v2):   row 8 only, with concurrent v1->v2 fixture swap watcher.
#                      MATRIX_PASS3_PERSISTENT=1, --grep "Row 8:".
#
# Hugo Process Lifecycle Management (~/.claude/aegis/rules/hugo-development.md
# Section 3.1 / 3.2) is enforced: pre-launch process+port check and `pkill hugo`
# between passes (and inside the Pass 3 watcher when swapping to v2).
#
# Aggregate target: 9 PASS / 0 SKIPPED / 0 FAIL.
#
# Usage:
#   ./run-matrix.sh                    # full triple-pass; default port 1313
#   HUGO_PORT=4000 ./run-matrix.sh     # custom port (applies to all three passes)
#   MATRIX_PASS=default ./run-matrix.sh    # pass 1 only (rows 1-3, 5-7, 9)
#   MATRIX_PASS=legacy ./run-matrix.sh     # pass 2 only (row 4)
#   MATRIX_PASS=v2 ./run-matrix.sh         # pass 3 only (row 8)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURE_DIR="$SCRIPT_DIR/fixture"
TESTS_DIR="$SCRIPT_DIR"

PORT="${HUGO_PORT:-1313}"
MATRIX_PASS="${MATRIX_PASS:-all}"

SENTINEL_TRIGGER="$SCRIPT_DIR/.matrix-v2-trigger"
SENTINEL_READY="$SCRIPT_DIR/.matrix-v2-ready"

HUGO_PID=""
HUGO_LOG=""
WATCHER_PID=""

# Per-pass exit codes for aggregate decision (-1 = pass not executed).
PASS1_EXIT=-1
PASS2_EXIT=-1
PASS3_EXIT=-1

# ----- Lifecycle helpers --------------------------------------------------------------

restore_fixture() {
  if [[ -f "$FIXTURE_DIR/hugo.toml.bak" ]]; then
    mv "$FIXTURE_DIR/hugo.toml.bak" "$FIXTURE_DIR/hugo.toml"
  fi
  if [[ -f "$FIXTURE_DIR/content/blog/post-1.md.bak" ]]; then
    mv "$FIXTURE_DIR/content/blog/post-1.md.bak" "$FIXTURE_DIR/content/blog/post-1.md"
  fi
}

remove_sentinels() {
  rm -f "$SENTINEL_TRIGGER" "$SENTINEL_READY" 2>/dev/null || true
}

stop_hugo() {
  if [[ -n "$HUGO_PID" ]]; then
    kill "$HUGO_PID" 2>/dev/null || true
    HUGO_PID=""
  fi
  # Belt-and-suspenders: kill any hugo process that survived parent shell termination.
  pkill hugo 2>/dev/null || true
  # Wait for the port to be released (up to 5s) so the next pass's pre-launch
  # check does not false-fail.
  if command -v lsof >/dev/null 2>&1; then
    for _ in $(seq 1 10); do
      if ! lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
  fi
}

stop_watcher() {
  if [[ -n "$WATCHER_PID" ]]; then
    kill "$WATCHER_PID" 2>/dev/null || true
    WATCHER_PID=""
  fi
}

cleanup() {
  stop_watcher
  stop_hugo
  restore_fixture
  remove_sentinels
  if [[ -n "$HUGO_LOG" && -f "$HUGO_LOG" ]]; then
    rm -f "$HUGO_LOG" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

start_hugo() {
  HUGO_LOG="$(mktemp)"
  cd "$FIXTURE_DIR"
  hugo server --port "$PORT" --bind 127.0.0.1 --logLevel info >"$HUGO_LOG" 2>&1 &
  HUGO_PID=$!

  local ready=0
  local i
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" -ne 1 ]]; then
    echo "ERROR: hugo server did not become ready within 30s. Log:"
    cat "$HUGO_LOG"
    return 1
  fi
  if grep -q "deprecate" "$HUGO_LOG"; then
    echo "ERROR: deprecation warnings detected in hugo log:"
    grep "deprecate" "$HUGO_LOG"
    return 1
  fi
  return 0
}

# Pass 3 v1->v2 watcher. Polls for SENTINEL_TRIGGER; on appearance, mutates the
# fixture to v2 + restarts hugo + writes SENTINEL_READY.
v1_to_v2_watcher() {
  local deadline=$(($(date +%s) + 90))
  while [[ $(date +%s) -lt $deadline ]]; do
    if [[ -f "$SENTINEL_TRIGGER" ]]; then
      rm -f "$SENTINEL_TRIGGER" 2>/dev/null || true
      stop_hugo
      cd "$FIXTURE_DIR"
      cp hugo.toml hugo.toml.bak
      sed -i 's/^version = "v1"/version = "v2"/' hugo.toml
      cp content/blog/post-1.md content/blog/post-1.md.bak
      sed -i 's/^date: 2026-01-02$/date: 2026-05-10/' content/blog/post-1.md
      start_hugo
      touch "$SENTINEL_READY"
      return 0
    fi
    sleep 0.2
  done
  echo "ERROR: Pass 3 watcher timeout: spec did not write $SENTINEL_TRIGGER within 90s."
  return 1
}

# ----- Pre-launch (Hugo Development Rule R3 Section 3.1) -----------------------------

if pgrep -af hugo >/dev/null 2>&1; then
  echo "ERROR: a hugo process is already running. Terminate it before re-running the matrix."
  echo "       pkill hugo            # graceful"
  echo "       pkill -9 hugo         # force"
  exit 1
fi
if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: port $PORT is already bound. Set HUGO_PORT to a free port."
    exit 1
  fi
fi

remove_sentinels

cd "$SCRIPT_DIR"

# ----- Pass 1: default fixture -------------------------------------------------------

if [[ "$MATRIX_PASS" == "all" || "$MATRIX_PASS" == "default" ]]; then
  echo "INFO: ===== Pass 1/3 (default fixture; rows 1-3, 5-7, 9) ====="
  start_hugo
  cd "$TESTS_DIR"
  set +e
  FIXTURE_URL="http://127.0.0.1:$PORT" \
    npx playwright test \
      --reporter=list \
      --grep-invert "Row 4:|Row 8:"
  PASS1_EXIT=$?
  set -e
  stop_hugo
fi

# ----- Pass 2: legacy fixture --------------------------------------------------------

if [[ "$MATRIX_PASS" == "all" || "$MATRIX_PASS" == "legacy" ]]; then
  echo "INFO: ===== Pass 2/3 (legacy RFG fixture; row 4) ====="
  cd "$FIXTURE_DIR"
  cp hugo.toml hugo.toml.bak
  sed -i 's/^mode = "modern"/mode = "legacy"/' hugo.toml
  start_hugo
  cd "$TESTS_DIR"
  set +e
  FIXTURE_URL="http://127.0.0.1:$PORT" \
  LEGACY_FIXTURE=1 \
    npx playwright test --reporter=list --grep "Row 4:"
  PASS2_EXIT=$?
  set -e
  stop_hugo
  restore_fixture
fi

# ----- Pass 3: v1->v2 transition (row 8) ---------------------------------------------

if [[ "$MATRIX_PASS" == "all" || "$MATRIX_PASS" == "v2" ]]; then
  echo "INFO: ===== Pass 3/3 (v1->v2 fixture transition; row 8) ====="
  remove_sentinels
  start_hugo
  v1_to_v2_watcher &
  WATCHER_PID=$!
  cd "$TESTS_DIR"
  set +e
  FIXTURE_URL="http://127.0.0.1:$PORT" \
  MATRIX_PASS3_PERSISTENT=1 \
    npx playwright test --reporter=list --grep "Row 8:"
  PASS3_EXIT=$?
  set -e
  wait "$WATCHER_PID" 2>/dev/null || true
  WATCHER_PID=""
  stop_hugo
  restore_fixture
  remove_sentinels
fi

# ----- Aggregate verdict -------------------------------------------------------------

echo "INFO: ===== Matrix complete ====="
echo "INFO: Pass 1 (default): exit=$PASS1_EXIT"
echo "INFO: Pass 2 (legacy):  exit=$PASS2_EXIT"
echo "INFO: Pass 3 (v2):      exit=$PASS3_EXIT"

# Each pass exit is either -1 (skipped via MATRIX_PASS), 0 (PASS), or non-zero (FAIL).
agg=0
for x in "$PASS1_EXIT" "$PASS2_EXIT" "$PASS3_EXIT"; do
  if [[ "$x" != "-1" && "$x" != "0" ]]; then
    agg=1
  fi
done
if [[ "$agg" -eq 0 ]]; then
  echo "INFO: aggregate matrix verdict: PASS"
else
  echo "INFO: aggregate matrix verdict: FAIL"
fi
exit "$agg"
