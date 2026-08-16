#!/usr/bin/env bash
# Builds the fixture site SEVEN TIMES with hugo (a BUILD, not a server: no
# port binding, and a finite build exits by itself) and runs the Node
# build-output assertion suite against all seven trees.
#
# Each environment earns its place by a distinction no other one can make. The
# default environment omits [params.ogcard] entirely, so it is the only build
# that can tell "inert when unconfigured" from "works" -- a TOML overlay can
# add a table but never delete one, which is why the unconfigured state has to
# be config/_default and every working configuration lives in config/<env>/.
# The `configured` environment holds the working card set and is the only
# build whose log must be silent, so every positive assertion is made against
# it. The `degraded` environment holds every fault class at once, each on its
# own section, template or slot, because "N distinct faults produce N distinct
# diagnostics and none masks another" is provable only when they are present
# together -- and it cannot be merged into `configured`, which has to stay
# quiet. The `multilingual` environment composes a card for a page of one
# language while another language is rendering, which is the only shape in
# which a configuration read through the page's own language and one read
# through the rendering language give different answers. The `subpath`
# environment repeats the card set under a baseURL carrying a PATH, which is
# the only shape in which a published card URL that keeps the base path and
# one that drops it are different bytes. The `routing` environment is the only
# one that sets `default_template`, the card template for a page no route
# names: `configured` proves the contradictory statement that such a page gets
# nothing at all, and its decline set is that proof, so the two cannot share a
# build. The `typography` environment is the only one whose MODULE level names
# a face, a width table and a line height, which is what makes the three-level
# typography cascade measurable: in `configured` every slot names its own
# face, so nothing there can tell a value a slot supplied from one the site
# supplied -- and `configured` has to keep naming none of them, because that
# absence is what makes its `unstyled` card a statement about the SHIPPED
# defaults.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check, and hard-fails on any deprecation or error output in any
# build log.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_BASELINE="$HERE/hugo-build-baseline.log"
LOG_CONFIGURED="$HERE/hugo-build-configured.log"
LOG_DEGRADED="$HERE/hugo-build-degraded.log"
LOG_MULTILINGUAL="$HERE/hugo-build-multilingual.log"
LOG_SUBPATH="$HERE/hugo-build-subpath.log"
LOG_ROUTING="$HERE/hugo-build-routing.log"
LOG_TYPOGRAPHY="$HERE/hugo-build-typography.log"

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
trap 'rm -f "$LOG_BASELINE" "$LOG_CONFIGURED" "$LOG_DEGRADED" "$LOG_MULTILINGUAL" "$LOG_SUBPATH" "$LOG_ROUTING" "$LOG_TYPOGRAPHY"' INT TERM

# `pgrep -x` matches the process NAME, the semantic twin of the tasklist
# IMAGENAME filter below. `-f` would match the whole command line, and this
# checkout is named hugo-artifacts, so a runner invoked by absolute path
# matches ITSELF and aborts -- which is exactly what a CI workspace path such
# as /home/runner/work/hugo-artifacts/hugo-artifacts produces.
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
# drops files absent from the STATIC directories, so a card a previous build
# published and this one does not would survive into the tree the specs read --
# and this suite's central negative assertion is "a declining page produces NO
# card", which stale bytes satisfy silently.
rm -rf "$FIXTURE_DIR/public"

build() { # build <environment> <destination> <log> [strict]
  local env_name="$1" dest="$2" log="$3" strict="${4:-}"
  local args=(--logLevel info --cleanDestinationDir --destination "$dest")
  if [ -n "$env_name" ]; then
    args+=(-e "$env_name")
  fi
  (cd "$FIXTURE_DIR" && hugo "${args[@]}") > "$log" 2>&1 || {
    echo "hugo build failed (${env_name:-default}):" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$log"; then
    echo "Hugo reported deprecations (${env_name:-default}):" >&2
    grep -i "deprecat" "$log" >&2
    exit 1
  fi
  if grep -q "ERROR" "$log"; then
    echo "Hugo reported errors (${env_name:-default}):" >&2
    grep "ERROR" "$log" >&2
    exit 1
  fi
  # The happy path is SILENT, and only the configured and routing builds are
  # gated this way. The degraded build exists to produce warnings, the baseline
  # build carries the unconfigured notice, and the multilingual build carries
  # the two colors it exists to prove are reported separately.
  if [ "$strict" = "strict" ] && grep -q "WARN" "$log"; then
    echo "The ${env_name:-default} build must warn about nothing:" >&2
    grep "WARN" "$log" >&2
    exit 1
  fi
}

build "" public/baseline "$LOG_BASELINE"
build configured public/configured "$LOG_CONFIGURED" strict
build degraded public/degraded "$LOG_DEGRADED"
build multilingual public/multilingual "$LOG_MULTILINGUAL"
build subpath public/subpath "$LOG_SUBPATH"
build routing public/routing "$LOG_ROUTING" strict
build typography public/typography "$LOG_TYPOGRAPHY"

export FIXTURE_DIR
MODULE_ROOT="$(cd "$HERE/.." && pwd)"
export MODULE_ROOT
export FIXTURE_PUBLIC_BASELINE="$FIXTURE_DIR/public/baseline"
export FIXTURE_PUBLIC_CONFIGURED="$FIXTURE_DIR/public/configured"
export FIXTURE_PUBLIC_DEGRADED="$FIXTURE_DIR/public/degraded"
export FIXTURE_PUBLIC_MULTILINGUAL="$FIXTURE_DIR/public/multilingual"
export FIXTURE_PUBLIC_SUBPATH="$FIXTURE_DIR/public/subpath"
export FIXTURE_PUBLIC_ROUTING="$FIXTURE_DIR/public/routing"
export FIXTURE_PUBLIC_TYPOGRAPHY="$FIXTURE_DIR/public/typography"
export HUGO_BUILD_LOG_BASELINE="$LOG_BASELINE"
export HUGO_BUILD_LOG_CONFIGURED="$LOG_CONFIGURED"
export HUGO_BUILD_LOG_DEGRADED="$LOG_DEGRADED"
export HUGO_BUILD_LOG_MULTILINGUAL="$LOG_MULTILINGUAL"
export HUGO_BUILD_LOG_SUBPATH="$LOG_SUBPATH"
export HUGO_BUILD_LOG_ROUTING="$LOG_ROUTING"
export HUGO_BUILD_LOG_TYPOGRAPHY="$LOG_TYPOGRAPHY"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

cd "$HERE"
npm test "$@"
