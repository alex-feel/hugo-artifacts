#!/usr/bin/env bash
# Builds the fixture site TWELVE TIMES with hugo (a BUILD, not a server: no port
# binding, and a finite build exits by itself) and runs the Node
# build-output assertion suite against all twelve trees.
#
# The environments are the point of this suite. The default environment omits
# [seo.alternates], [seo.links] and [seo] content_license entirely, so it
# proves those additions are INERT when unconfigured; the `configured`
# environment adds exactly those three blocks, so it proves each surface
# appears when they are set. An assertion that only ever saw one of those two
# builds could not tell "works" from "always on". The `subpath` environment
# repeats the configured surfaces under a baseURL that carries a PATH, which
# is the only shape that can tell a correct URL absolutization from a broken
# one -- at a domain root the two emit identical bytes. The `badtypes` and
# `offswitch` environments hold the config shapes that used to stop the build
# or silently disable the module. The `multilingual` environment adds a second
# language whose params set a noindex robots baseline, the only shape that can
# tell a per-language params read from a rendering-language one. The
# `pagination` environment paginates all FOUR kinds that can paginate -- home,
# section, taxonomy and term -- because seo/resolve/pager.html gates on all
# four and a suite that only ever paginated a section left three quarters of
# that gate unrendered; it is also the one environment that sets
# `webpage_on_lists`, without which a taxonomy or term pager carries no page
# node to check. It is built a SECOND time under a baseURL that carries a
# path, which is a combination no build had: the resolver claims the pager URL
# only while the pager URL still extends the page's own RelPermalink, and both
# shapes change when the baseURL gains a path. The `graph`
# environment republishes the baseline content with
# `seo.jsonld_container = 'graph'`, the only build that reaches the @graph
# serialization site. The `sitename` environment gives the site and its
# publisher DIFFERENT names, the only shape that can tell the two ends of the
# site-name chain apart, because the other two environments that declare one of
# those tables write it as a bare scalar on purpose. The `generated`
# environment wires the generated-image hook to a fixture partial and also sets
# a site default image, the only shape that can tell a per-page composed card
# from the site-wide banner, since either one alone renders as "an og:image is
# present". The `hometitle` environment declares a home-page SEO title and a
# site-wide title suffix, the only shape that exercises either branch of
# resolve/title.html: nowhere else is a suffix configured at all, and nowhere
# else does a home page state a headline of its own. Its third language
# declares nothing, which is what pins the fallback arm while the suffix is in
# force -- a declaring home leaves that arm unrendered.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check, and hard-fails on any deprecation or error output in any
# build log.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_FILE="$HERE/hugo-build.log"
LOG_FILE_CONFIGURED="$HERE/hugo-build-configured.log"
LOG_FILE_SUBPATH="$HERE/hugo-build-subpath.log"
LOG_FILE_BADTYPES="$HERE/hugo-build-badtypes.log"
LOG_FILE_OFFSWITCH="$HERE/hugo-build-offswitch.log"
LOG_FILE_MULTILINGUAL="$HERE/hugo-build-multilingual.log"
LOG_FILE_PAGINATION="$HERE/hugo-build-pagination.log"
LOG_FILE_PAGINATION_SUBPATH="$HERE/hugo-build-pagination-subpath.log"
LOG_FILE_GRAPH="$HERE/hugo-build-graph.log"
LOG_FILE_SITENAME="$HERE/hugo-build-sitename.log"
LOG_FILE_GENERATED="$HERE/hugo-build-generated.log"
LOG_FILE_HOMETITLE="$HERE/hugo-build-hometitle.log"

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
trap 'rm -f "$LOG_FILE" "$LOG_FILE_CONFIGURED" "$LOG_FILE_SUBPATH" "$LOG_FILE_BADTYPES" "$LOG_FILE_OFFSWITCH" "$LOG_FILE_MULTILINGUAL" "$LOG_FILE_PAGINATION" "$LOG_FILE_PAGINATION_SUBPATH" "$LOG_FILE_GRAPH" "$LOG_FILE_SITENAME" "$LOG_FILE_GENERATED" "$LOG_FILE_HOMETITLE"' INT TERM

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

build() {
  local env_name="$1" dest="$2" log="$3"
  shift 3
  local args=(--logLevel info --cleanDestinationDir --destination "$dest")
  if [ -n "$env_name" ]; then
    args+=(-e "$env_name")
  fi
  # Any remaining arguments are passed to hugo verbatim, which is how one
  # environment can be built twice under different deployment settings without
  # a second config directory restating the first one line for line.
  args+=("$@")
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
}

build "" public/baseline "$LOG_FILE"
build configured public/configured "$LOG_FILE_CONFIGURED"
build subpath public/subpath "$LOG_FILE_SUBPATH"
build badtypes public/badtypes "$LOG_FILE_BADTYPES"
build offswitch public/offswitch "$LOG_FILE_OFFSWITCH"
build multilingual public/multilingual "$LOG_FILE_MULTILINGUAL"
build pagination public/pagination "$LOG_FILE_PAGINATION"
# The same environment under a baseURL that carries a PATH. Pagination and a
# subpath deploy had never been combined: seo/resolve/pager.html claims the
# pager URL only while `hasPrefix .URL $page.RelPermalink` holds, and both of
# those shapes change when the baseURL gains a path, so a Hugo release that
# moved either one would silently return every pager to naming its pager-one
# URL. A CLI override rather than a twelfth config directory, because the
# environment differs in exactly this one setting.
build pagination public/pagination-subpath "$LOG_FILE_PAGINATION_SUBPATH" \
  --baseURL 'https://seo-fixture.example/docs/'
build graph public/graph "$LOG_FILE_GRAPH"
build sitename public/sitename "$LOG_FILE_SITENAME"
build generated public/generated "$LOG_FILE_GENERATED"
build hometitle public/hometitle "$LOG_FILE_HOMETITLE"

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/baseline"
export FIXTURE_PUBLIC_CONFIGURED="$FIXTURE_DIR/public/configured"
export FIXTURE_PUBLIC_SUBPATH="$FIXTURE_DIR/public/subpath"
export FIXTURE_PUBLIC_BADTYPES="$FIXTURE_DIR/public/badtypes"
export FIXTURE_PUBLIC_OFFSWITCH="$FIXTURE_DIR/public/offswitch"
export FIXTURE_PUBLIC_MULTILINGUAL="$FIXTURE_DIR/public/multilingual"
export FIXTURE_PUBLIC_PAGINATION="$FIXTURE_DIR/public/pagination"
export FIXTURE_PUBLIC_PAGINATION_SUBPATH="$FIXTURE_DIR/public/pagination-subpath"
export FIXTURE_PUBLIC_GRAPH="$FIXTURE_DIR/public/graph"
export FIXTURE_PUBLIC_SITENAME="$FIXTURE_DIR/public/sitename"
export FIXTURE_PUBLIC_GENERATED="$FIXTURE_DIR/public/generated"
export FIXTURE_PUBLIC_HOMETITLE="$FIXTURE_DIR/public/hometitle"
export HUGO_BUILD_LOG="$LOG_FILE"
export HUGO_BUILD_LOG_CONFIGURED="$LOG_FILE_CONFIGURED"
export HUGO_BUILD_LOG_SUBPATH="$LOG_FILE_SUBPATH"
export HUGO_BUILD_LOG_BADTYPES="$LOG_FILE_BADTYPES"
export HUGO_BUILD_LOG_OFFSWITCH="$LOG_FILE_OFFSWITCH"
export HUGO_BUILD_LOG_MULTILINGUAL="$LOG_FILE_MULTILINGUAL"
export HUGO_BUILD_LOG_PAGINATION="$LOG_FILE_PAGINATION"
export HUGO_BUILD_LOG_PAGINATION_SUBPATH="$LOG_FILE_PAGINATION_SUBPATH"
export HUGO_BUILD_LOG_GRAPH="$LOG_FILE_GRAPH"
export HUGO_BUILD_LOG_SITENAME="$LOG_FILE_SITENAME"
export HUGO_BUILD_LOG_GENERATED="$LOG_FILE_GENERATED"
export HUGO_BUILD_LOG_HOMETITLE="$LOG_FILE_HOMETITLE"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

cd "$HERE"
npm test "$@"
