#!/usr/bin/env bash
# Builds the fixture site TWENTY-TWO TIMES with hugo (a BUILD, not a server: no
# port binding, and a finite build exits by itself) and runs the Node
# build-output assertion suite against the twenty-one trees that succeed.
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
# whose content has three pages claiming the same retired URL, which is a
# diagnostic no other build can produce, and `degraded-shapes` holds the faults
# that cannot share a key with the ones in `degraded`. The `multilingual`
# environment is the only shape in which one _redirects file is written by two
# languages and the per-language manifests have siblings to name, and
# `multilingual-partial` is the only one where a sibling exists but publishes
# nothing, so the header must not name it. `multilingual-subdir` moves the
# default language into its own directory, which reverses the root redirect --
# / -> /en/ rather than /en/ -> /, with the site root as the retired URL -- and
# is the only build that renders that arm. The `multihost` environment gives
# each language its own baseURL, the one shape in which /_redirects is written
# once PER HOST instead of once for the deployment, so it is the only build in
# which a rule can be right for the file it landed in and wrong for the host
# serving it; it is also the only one where two languages legitimately resolve
# different redirect settings, and the only one carrying both a baseURL path and
# the language publish directory Hugo prefixes onto every alias.
# The `pagerpath` environment renames Hugo's pagination segment without telling
# the module, so every rule it emits carrying that name was DERIVED from a pager
# URL rather than read from configuration -- which no other build can show,
# because everywhere else the derived segment and the shipped default are the
# same word. The `ugly` environment is the only one in which the URL Hugo
# reports for a page and the URL it serves it at come apart, which is what makes
# a first-pager rule built by string concatenation visibly wrong.
# Five environments change the ORDER, the MEMBERSHIP or the RENDER PASS of the
# home page's output format list, which together decide the URL other pages,
# canonicals, sitemap entries and this module's own documents carry for that
# page. `html-last` moves html to the end of the list at the shipped weight and
# nothing moves; `render-early` keeps the list and weights the manifest below
# html's 10, and nothing moves either; `render-early-html-last` does both, which
# is the only build in which something this module publishes takes over a URL
# Hugo hands outward -- the sitemap's entry for the home page. Those two are
# also the only builds in which the manifest is written BEFORE anything can
# register a URL for it, so every registration the html pass makes arrives too
# late; the module says so once per URL instead of dropping them silently,
# which is why neither build is held to the silent-log gate. `html-missing`
# drops html from the list altogether, the only build in which the home page has
# no html output at all and every URL for it becomes this module's document, and
# the one that shows the assertions about the others are capable of failing.
# `derived-urls` is the only build in which the URLs the MODULE derives -- a
# redirect target, the default site's redirect, a manifest listing one URL per
# page -- can be told apart from the ones Hugo reports for the same page,
# because everywhere else html leads the list and the two are the same string.
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
LOG_MULTISUBDIR="$HERE/hugo-build-multilingual-subdir.log"
LOG_MULTIHOST="$HERE/hugo-build-multihost.log"
LOG_OFF="$HERE/hugo-build-off.log"
LOG_MULTILINGUAL="$HERE/hugo-build-multilingual.log"
LOG_SUBPATH="$HERE/hugo-build-subpath.log"
LOG_CANONIFY="$HERE/hugo-build-canonify.log"
LOG_PAGERPATH="$HERE/hugo-build-pagerpath.log"
LOG_UGLY="$HERE/hugo-build-ugly.log"
LOG_HTMLLAST="$HERE/hugo-build-html-last.log"
LOG_HTMLMISSING="$HERE/hugo-build-html-missing.log"
LOG_RENDEREARLY="$HERE/hugo-build-render-early.log"
LOG_RENDEREARLYLAST="$HERE/hugo-build-render-early-html-last.log"
LOG_DERIVED="$HERE/hugo-build-derived-urls.log"
LOG_UNPUBLISHED="$HERE/hugo-build-unpublished.log"
LOG_EXTRAREDUNDANT="$HERE/hugo-build-extra-redundant.log"
LOG_MULTIEXTRA="$HERE/hugo-build-multilingual-extra.log"
LOG_HOSTILE="$HERE/hugo-build-hostile.log"

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
trap 'rm -f "$LOG_BASELINE" "$LOG_CONFIGURED" "$LOG_DEGRADED" "$LOG_SHAPES" "$LOG_PARTIAL" "$LOG_CONFLICT" "$LOG_OFF" "$LOG_MULTILINGUAL" "$LOG_MULTIPARTIAL" "$LOG_MULTISUBDIR" "$LOG_MULTIHOST" "$LOG_SUBPATH" "$LOG_CANONIFY" "$LOG_PAGERPATH" "$LOG_UGLY" "$LOG_HTMLLAST" "$LOG_HTMLMISSING" "$LOG_RENDEREARLY" "$LOG_RENDEREARLYLAST" "$LOG_DERIVED" "$LOG_UNPUBLISHED" "$LOG_EXTRAREDUNDANT" "$LOG_MULTIEXTRA" "$LOG_HOSTILE"' INT TERM

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
  # The happy path is SILENT. The exempt builds are the ones whose whole point
  # is a diagnostic: the two degraded environments and `conflict` produce one
  # per fault, `unpublished` reports a hook that answers wrongly, and the two
  # render-early environments weight the manifest ahead of html, which is the
  # misconfiguration that leaves every registration too late to be listed.
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
build multilingual-subdir public/multilingual-subdir "$LOG_MULTISUBDIR" strict
build multihost public/multihost "$LOG_MULTIHOST" strict
build subpath public/subpath "$LOG_SUBPATH" strict
build canonify public/canonify "$LOG_CANONIFY" strict
build pagerpath public/pagerpath "$LOG_PAGERPATH" strict
build ugly public/ugly "$LOG_UGLY" strict
build html-last public/html-last "$LOG_HTMLLAST" strict
build html-missing public/html-missing "$LOG_HTMLMISSING" strict
build render-early public/render-early "$LOG_RENDEREARLY"
build render-early-html-last public/render-early-html-last "$LOG_RENDEREARLYLAST"
build derived-urls public/derived-urls "$LOG_DERIVED" strict
build unpublished public/unpublished "$LOG_UNPUBLISHED"
# Two builds whose subject is one diagnostic, so neither is held to the silent
# log gate. `extra-redundant` names one redundant entry and one load-bearing one
# on a single-language site; `multilingual-extra` asks the same question of a
# build with two languages, where one entry is redundant for both and the other
# only for German, which is the case the diagnostic must pass over.
build extra-redundant public/extra-redundant "$LOG_EXTRAREDUNDANT"
build multilingual-extra public/multilingual-extra "$LOG_MULTIEXTRA"
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
export FIXTURE_PUBLIC_MULTISUBDIR="$FIXTURE_DIR/public/multilingual-subdir"
export FIXTURE_PUBLIC_MULTIHOST="$FIXTURE_DIR/public/multihost"
export FIXTURE_PUBLIC_OFF="$FIXTURE_DIR/public/off"
export FIXTURE_PUBLIC_MULTILINGUAL="$FIXTURE_DIR/public/multilingual"
export FIXTURE_PUBLIC_SUBPATH="$FIXTURE_DIR/public/subpath"
export FIXTURE_PUBLIC_CANONIFY="$FIXTURE_DIR/public/canonify"
export FIXTURE_PUBLIC_PAGERPATH="$FIXTURE_DIR/public/pagerpath"
export FIXTURE_PUBLIC_UGLY="$FIXTURE_DIR/public/ugly"
export FIXTURE_PUBLIC_HTMLLAST="$FIXTURE_DIR/public/html-last"
export FIXTURE_PUBLIC_HTMLMISSING="$FIXTURE_DIR/public/html-missing"
export FIXTURE_PUBLIC_RENDEREARLY="$FIXTURE_DIR/public/render-early"
export FIXTURE_PUBLIC_RENDEREARLYLAST="$FIXTURE_DIR/public/render-early-html-last"
export FIXTURE_PUBLIC_DERIVED="$FIXTURE_DIR/public/derived-urls"
export FIXTURE_PUBLIC_UNPUBLISHED="$FIXTURE_DIR/public/unpublished"
export FIXTURE_PUBLIC_EXTRAREDUNDANT="$FIXTURE_DIR/public/extra-redundant"
export FIXTURE_PUBLIC_MULTIEXTRA="$FIXTURE_DIR/public/multilingual-extra"
export HUGO_BUILD_LOG_BASELINE="$LOG_BASELINE"
export HUGO_BUILD_LOG_CONFIGURED="$LOG_CONFIGURED"
export HUGO_BUILD_LOG_DEGRADED="$LOG_DEGRADED"
export HUGO_BUILD_LOG_SHAPES="$LOG_SHAPES"
export HUGO_BUILD_LOG_PARTIAL="$LOG_PARTIAL"
export HUGO_BUILD_LOG_CONFLICT="$LOG_CONFLICT"
export HUGO_BUILD_LOG_MULTIPARTIAL="$LOG_MULTIPARTIAL"
export HUGO_BUILD_LOG_MULTISUBDIR="$LOG_MULTISUBDIR"
export HUGO_BUILD_LOG_MULTIHOST="$LOG_MULTIHOST"
export HUGO_BUILD_LOG_OFF="$LOG_OFF"
export HUGO_BUILD_LOG_MULTILINGUAL="$LOG_MULTILINGUAL"
export HUGO_BUILD_LOG_SUBPATH="$LOG_SUBPATH"
export HUGO_BUILD_LOG_CANONIFY="$LOG_CANONIFY"
export HUGO_BUILD_LOG_PAGERPATH="$LOG_PAGERPATH"
export HUGO_BUILD_LOG_UGLY="$LOG_UGLY"
export HUGO_BUILD_LOG_HTMLLAST="$LOG_HTMLLAST"
export HUGO_BUILD_LOG_HTMLMISSING="$LOG_HTMLMISSING"
export HUGO_BUILD_LOG_RENDEREARLY="$LOG_RENDEREARLY"
export HUGO_BUILD_LOG_RENDEREARLYLAST="$LOG_RENDEREARLYLAST"
export HUGO_BUILD_LOG_DERIVED="$LOG_DERIVED"
export HUGO_BUILD_LOG_UNPUBLISHED="$LOG_UNPUBLISHED"
export HUGO_BUILD_LOG_EXTRAREDUNDANT="$LOG_EXTRAREDUNDANT"
export HUGO_BUILD_LOG_MULTIEXTRA="$LOG_MULTIEXTRA"
export HUGO_BUILD_LOG_HOSTILE="$LOG_HOSTILE"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

cd "$HERE"
npm test "$@"
