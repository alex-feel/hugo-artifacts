#!/usr/bin/env bash
# Builds the fixture site FOURTEEN TIMES with hugo (a BUILD, not a server: no
# port binding, and a finite build exits by itself) and runs the Node
# build-output assertion suite against the thirteen trees that succeed.
#
# Each environment earns its place by a distinction no other one can make. The
# default environment omits [params.url_retirement] entirely, so it is the only
# build that shows what the module publishes for a site that configured nothing
# -- a TOML overlay can add a table but never delete one, which is why the
# unconfigured state has to be config/_default. The `configured` environment
# turns on every knob at once (hand-written rules, a non-default status, a
# single trailing-slash spelling, extra manifest URLs) and is the build every
# positive assertion about configuration is made against. The `degraded`
# environment holds every fault class at once, each on its own key, because "N
# distinct faults produce N distinct diagnostics and none masks another" is
# provable only when they are present together -- and it cannot be merged into
# `configured`, which has to stay quiet. The `off` environment is the only one
# that shows a disabled module writing nothing at all while the site around it
# builds normally, and `partial` is its counterpart, switching ONE document off
# and leaving the other publishing. The `conflict` environment is the only one
# whose content has two pages claiming the same retired URL, which is a
# diagnostic no other build can produce, and `degraded-shapes` holds the faults
# that cannot share a key with the ones in `degraded`. The `multilingual`
# environment is the only shape in which one _redirects file is written by two
# languages and the per-language manifests have siblings to name, and
# `multilingual-partial` is the only one where a sibling exists but publishes
# nothing, so the header must not name it.
# The `pagerpath` environment renames Hugo's pagination segment without telling
# the module, so every rule it emits carrying that name was DERIVED from a pager
# URL rather than read from configuration -- which no other build can show,
# because everywhere else the derived segment and the shipped default are the
# same word. The `ugly` environment is the only one in which the URL Hugo
# reports for a page and the URL it serves it at come apart, which is what makes
# a first-pager rule built by string concatenation visibly wrong.
# The `subpath` and `canonify` environments are a PAIR and neither is redundant:
# a baseURL carrying a path is the only shape in which a rule that keeps the
# base segment and one that drops it are different bytes, and canonifyURLs is
# the only shape in which .RelPermalink stops carrying that segment on its own
# -- the two builds must agree byte for byte, which a root-baseURL build cannot
# check. The `hostile` environment is the only build that MUST FAIL: its content
# carries an alias containing whitespace, which would silently corrupt the file
# format, so the module stops the build instead of publishing it.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch process
# check, and hard-fails on any deprecation or error output in any build log.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_BASELINE="$HERE/hugo-build-baseline.log"
LOG_CONFIGURED="$HERE/hugo-build-configured.log"
LOG_DEGRADED="$HERE/hugo-build-degraded.log"
LOG_SHAPES="$HERE/hugo-build-degraded-shapes.log"
LOG_PARTIAL="$HERE/hugo-build-partial.log"
LOG_CONFLICT="$HERE/hugo-build-conflict.log"
LOG_MULTIPARTIAL="$HERE/hugo-build-multilingual-partial.log"
LOG_OFF="$HERE/hugo-build-off.log"
LOG_MULTILINGUAL="$HERE/hugo-build-multilingual.log"
LOG_SUBPATH="$HERE/hugo-build-subpath.log"
LOG_CANONIFY="$HERE/hugo-build-canonify.log"
LOG_PAGERPATH="$HERE/hugo-build-pagerpath.log"
LOG_UGLY="$HERE/hugo-build-ugly.log"
LOG_HOSTILE="$HERE/hugo-build-hostile.log"

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
trap 'rm -f "$LOG_BASELINE" "$LOG_CONFIGURED" "$LOG_DEGRADED" "$LOG_SHAPES" "$LOG_PARTIAL" "$LOG_CONFLICT" "$LOG_OFF" "$LOG_MULTILINGUAL" "$LOG_MULTIPARTIAL" "$LOG_SUBPATH" "$LOG_CANONIFY" "$LOG_PAGERPATH" "$LOG_UGLY" "$LOG_HOSTILE"' INT TERM

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
# drops files absent from the STATIC directories, so a document a previous build
# published and this one does not would survive into the tree the specs read --
# and one of this suite's central assertions is that a disabled module publishes
# NOTHING, which a stale file from an earlier build satisfies silently.
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
  # The happy path is SILENT. Only the degraded build is exempt, because
  # producing one diagnostic per fault is the thing it exists to demonstrate.
  if [ "$strict" = "strict" ] && grep -q "WARN" "$log"; then
    echo "The ${env_name:-default} build must warn about nothing:" >&2
    grep "WARN" "$log" >&2
    exit 1
  fi
}

build_must_fail() { # build_must_fail <environment> <destination> <log>
  local env_name="$1" dest="$2" log="$3"
  if (cd "$FIXTURE_DIR" && hugo --logLevel info --cleanDestinationDir --destination "$dest" -e "$env_name") > "$log" 2>&1; then
    echo "The ${env_name} build was expected to FAIL and did not." >&2
    cat "$log" >&2
    exit 1
  fi
}

build "" public/baseline "$LOG_BASELINE" strict
build configured public/configured "$LOG_CONFIGURED" strict
build degraded public/degraded "$LOG_DEGRADED"
build degraded-shapes public/degraded-shapes "$LOG_SHAPES"
build conflict public/conflict "$LOG_CONFLICT"
build partial public/partial "$LOG_PARTIAL" strict
build off public/off "$LOG_OFF" strict
build multilingual public/multilingual "$LOG_MULTILINGUAL" strict
build multilingual-partial public/multilingual-partial "$LOG_MULTIPARTIAL" strict
build subpath public/subpath "$LOG_SUBPATH" strict
build canonify public/canonify "$LOG_CANONIFY" strict
build pagerpath public/pagerpath "$LOG_PAGERPATH" strict
build ugly public/ugly "$LOG_UGLY" strict
build_must_fail hostile public/hostile "$LOG_HOSTILE"

export FIXTURE_DIR
MODULE_ROOT="$(cd "$HERE/.." && pwd)"
export MODULE_ROOT
export FIXTURE_PUBLIC_BASELINE="$FIXTURE_DIR/public/baseline"
export FIXTURE_PUBLIC_CONFIGURED="$FIXTURE_DIR/public/configured"
export FIXTURE_PUBLIC_DEGRADED="$FIXTURE_DIR/public/degraded"
export FIXTURE_PUBLIC_SHAPES="$FIXTURE_DIR/public/degraded-shapes"
export FIXTURE_PUBLIC_PARTIAL="$FIXTURE_DIR/public/partial"
export FIXTURE_PUBLIC_CONFLICT="$FIXTURE_DIR/public/conflict"
export FIXTURE_PUBLIC_MULTIPARTIAL="$FIXTURE_DIR/public/multilingual-partial"
export FIXTURE_PUBLIC_OFF="$FIXTURE_DIR/public/off"
export FIXTURE_PUBLIC_MULTILINGUAL="$FIXTURE_DIR/public/multilingual"
export FIXTURE_PUBLIC_SUBPATH="$FIXTURE_DIR/public/subpath"
export FIXTURE_PUBLIC_CANONIFY="$FIXTURE_DIR/public/canonify"
export FIXTURE_PUBLIC_PAGERPATH="$FIXTURE_DIR/public/pagerpath"
export FIXTURE_PUBLIC_UGLY="$FIXTURE_DIR/public/ugly"
export HUGO_BUILD_LOG_BASELINE="$LOG_BASELINE"
export HUGO_BUILD_LOG_CONFIGURED="$LOG_CONFIGURED"
export HUGO_BUILD_LOG_DEGRADED="$LOG_DEGRADED"
export HUGO_BUILD_LOG_SHAPES="$LOG_SHAPES"
export HUGO_BUILD_LOG_PARTIAL="$LOG_PARTIAL"
export HUGO_BUILD_LOG_CONFLICT="$LOG_CONFLICT"
export HUGO_BUILD_LOG_MULTIPARTIAL="$LOG_MULTIPARTIAL"
export HUGO_BUILD_LOG_OFF="$LOG_OFF"
export HUGO_BUILD_LOG_MULTILINGUAL="$LOG_MULTILINGUAL"
export HUGO_BUILD_LOG_SUBPATH="$LOG_SUBPATH"
export HUGO_BUILD_LOG_CANONIFY="$LOG_CANONIFY"
export HUGO_BUILD_LOG_PAGERPATH="$LOG_PAGERPATH"
export HUGO_BUILD_LOG_UGLY="$LOG_UGLY"
export HUGO_BUILD_LOG_HOSTILE="$LOG_HOSTILE"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

cd "$HERE"
npm test "$@"
