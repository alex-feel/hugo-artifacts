#!/usr/bin/env bash
# Validates the shipped data files, starts the fixture ORIGIN, then builds
# TWENTY-TWO fixture sites with hugo (builds, not servers: no port binding, and
# a finite build exits by itself) and runs the Node build-output assertion
# suite against all twenty-two.
#
# The data-file check runs FIRST, before any build. That ordering is the
# point: a malformed registry otherwise surfaces as an opaque Hugo failure at
# some unrelated template, and the reader has to work backwards to it.
#
# The twenty-two builds:
#   baseline   -- every content-license key unset, proving the license
#                 surfaces are inert until a consumer opts in;
#   configured -- the license table filled and both switches on, plus
#                 bots_allow configured together with bots_disallow, the only
#                 build in which the bot-group Allow emission path executes;
#   minimal    -- almost nothing configured, which is the shape a consumer
#                 gets on import and the only one that can reach the
#                 unconfigured robots.txt, the zero-skills gate and the
#                 sectionless facts document;
#   notwins    -- twins switched off site-wide while `markdown` stays wired in
#                 [outputs], the only shape in which llms.txt and about.md can
#                 be caught advertising twin URLs for files that do not exist;
#   multilingual -- a two-language build, the only shape in which the
#                 agent-skills index's default-language gate does anything;
#   llmsoff    -- llms.txt off while `llmstxt` stays wired, the counterpart of
#                 notwins for the other pointed-at document;
#   edge       -- a subpath baseURL plus the misconfigurations no other build
#                 reaches (license url without name, an unrecognized
#                 sitemap_section_target, colliding permalinks);
#   off        -- the master switch ALONE, false, while all five formats stay
#                 wired; setting the surface switches too would mask the
#                 conjunct this build exists to lock;
#   badtables  -- the section arrays written as bare strings instead of arrays
#                 of tables, which TOML cannot express alongside the real
#                 tables and so needs a build of its own;
#   nsoff      -- the whole [params] agent namespace written as a bare value,
#                 the shorthand a consumer reaches for to switch the module
#                 off;
#   nosectionpages -- the single key section_pages = false on top of the
#                 default configuration, the only build in which stripping
#                 the roster block from a baseline section twin must
#                 reproduce the published twin byte for byte;
#   nolinkmd   -- the single key link_markdown = false with the twins left ON,
#                 the only build in which that conjunct alone decides whether
#                 llms.txt names a twin, so deleting it from either emitter
#                 changes a published byte;
#   nobuildtime -- the four per-surface build_time switches set false on top
#                 of the default configuration, the only build in which those
#                 switches decide a published byte: everywhere else the stamp
#                 is on, so deleting a build_time conjunct from the twin
#                 builder, llms.html or facts.html would change nothing;
#   llmsindexoff -- the single key llms_index.enable = false while the
#                 llmsindex format stays wired, the complete index's
#                 counterpart of llmsoff and the only build in which that
#                 conjunct alone decides whether /llms-index.txt exists and
#                 whether /llms.txt names it -- with no warning, because the
#                 surface was switched off deliberately;
#   nolinkindexes -- NEITHER link-index format wired while both surfaces stay
#                 enabled: the minimal-adoption shape, in which the module
#                 must publish no index and say nothing about either, and the
#                 twins' pointer section is dropped with one warning;
#   nocompact  -- the mirror of `unwired`: `llmsindex` wired while `llmstxt` is
#                 absent from the [outputs] home list, the only build in which
#                 the twins' pointer section carries the complete index alone
#                 and the only one that proves the compact index's own publish
#                 gate decides a byte;
#   unwired    -- the complete index left ENABLED while llmsindex is absent
#                 from the [outputs] home list, which is the state every
#                 existing consumer lands in after upgrading, because a
#                 site-level [outputs] key replaces the default list rather
#                 than extending it. The only build in which the format
#                 conjunct decides a byte, and the only one that must emit the
#                 wire-it-up warning;
#   strictskills -- the single key skills_index.on_supporting_files = 'omit'
#                 over the default configuration, the only build in which a
#                 skill PROVEN to ship supporting files is refused rather than
#                 published with a warning, and therefore the only one in which
#                 that whole branch executes at all;
#   shadow     -- a fixture shipping its own layouts/robots.txt, proving the
#                 documented silent-override hazard;
#   paginated  -- a fixture whose single section spills past pagerSize, so
#                 Hugo publishes pager shells: the only shape in which a
#                 surface can be caught enumerating a pager alongside the
#                 pages it lists;
#   widgets    -- a fixture importing every widget shortcode module, whose
#                 single regular page calls all eight widget shortcodes: the
#                 only shape in which a page twin can be caught embedding
#                 widget BEM HTML or inline SVG instead of the compact
#                 Markdown citations the markdown shortcode variants emit;
#   extra      -- a fixture carrying a consumer-authored
#                 layouts/_partials/agent-readiness/twin-extra.html hook
#                 partial and an agent_sitemap_heading i18n override, the
#                 only shape in which the twin-extra hook contract and the
#                 override-wins-over-both-target-defaults precedence can be
#                 proven together.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check, and hard-fails on any deprecation or error output in any
# build log.
#
# THE ORIGIN: the agent-skills specs exercise a real build-time remote fetch,
# because the digest guarantee -- the advertised hash is computed from the
# bytes this site republishes -- cannot be proven without one. Those fetches
# are answered by serve-origin.mjs on 127.0.0.1, started below and stopped
# afterwards, so nothing outside this repository can change what the fixture
# fetches or turn a pull request red. See that file for why serving the bytes
# ourselves also buys the response headers and the pathological cases.
#
# NETWORK: the widgets build still fetches the widget modules' remote APIs
# (GitHub, the Hugging Face Hub, arXiv, YouTube posters); those fetches degrade
# with WARN lines when tokenless or rate-limited, which the log gates below
# deliberately tolerate -- they hard-fail on deprecations and errors only.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
SHADOW_DIR="$HERE/fixture-shadow"
PAGINATED_DIR="$HERE/fixture-paginated"
WIDGETS_DIR="$HERE/fixture-widgets"
EXTRA_DIR="$HERE/fixture-extra"
LOG_FILE="$HERE/hugo-build.log"
LOG_FILE_CONFIGURED="$HERE/hugo-build-configured.log"
LOG_FILE_MINIMAL="$HERE/hugo-build-minimal.log"
LOG_FILE_NOTWINS="$HERE/hugo-build-notwins.log"
LOG_FILE_MULTILINGUAL="$HERE/hugo-build-multilingual.log"
LOG_FILE_LLMSOFF="$HERE/hugo-build-llmsoff.log"
LOG_FILE_EDGE="$HERE/hugo-build-edge.log"
LOG_FILE_OFF="$HERE/hugo-build-off.log"
LOG_FILE_BADTABLES="$HERE/hugo-build-badtables.log"
LOG_FILE_NSOFF="$HERE/hugo-build-nsoff.log"
LOG_FILE_NOSECTIONPAGES="$HERE/hugo-build-nosectionpages.log"
LOG_FILE_NOLINKMD="$HERE/hugo-build-nolinkmd.log"
LOG_FILE_NOBUILDTIME="$HERE/hugo-build-nobuildtime.log"
LOG_FILE_LLMSINDEXOFF="$HERE/hugo-build-llmsindexoff.log"
LOG_FILE_UNWIRED="$HERE/hugo-build-unwired.log"
LOG_FILE_NOLINKINDEXES="$HERE/hugo-build-nolinkindexes.log"
LOG_FILE_NOCOMPACT="$HERE/hugo-build-nocompact.log"
LOG_FILE_STRICTSKILLS="$HERE/hugo-build-strictskills.log"
LOG_FILE_SHADOW="$HERE/hugo-build-shadow.log"
LOG_FILE_PAGINATED="$HERE/hugo-build-paginated.log"
LOG_FILE_WIDGETS="$HERE/hugo-build-widgets.log"
LOG_FILE_EXTRA="$HERE/hugo-build-extra.log"
ORIGIN_LOG="$HERE/fixture-origin.log"
# The origin's per-request record, written by serve-origin.mjs at a path it
# fixes itself. Named here only so an interrupted run discards it with the
# rest; nothing passes it in.
ORIGIN_REQUEST_LOG="$HERE/fixture-origin-requests.log"
# Fixed, because a Hugo configuration file cannot learn a port at run time and
# the fixture's `source` URLs name this one. Kept in step with the value in
# serve-origin.mjs and in fixture/config/_default/hugo.toml.
ORIGIN_PORT=51313

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
# Belt-and-suspenders cleanup, mirroring modules/search/test/run-tests.sh.
# These are finite foreground builds rather than a server, so nothing should
# survive -- but a build interrupted mid-flight can leave a hugo process
# holding the public/ lock, and the next runner's pre-launch check would then
# refuse to start for a reason that looks unrelated.
kill_stray_hugo() {
  if command -v pkill >/dev/null 2>&1; then
    pkill hugo 2>/dev/null || true
  else
    taskkill //F //IM hugo.exe >/dev/null 2>&1 || true
  fi
}
stop_origin() {
  node "$HERE/serve-origin.mjs" stop >/dev/null 2>&1 || true
}
cleanup_interrupted() {
  kill_stray_hugo
  stop_origin
  rm -f "$LOG_FILE" "$LOG_FILE_CONFIGURED" "$LOG_FILE_MINIMAL" "$LOG_FILE_NOTWINS"     "$LOG_FILE_MULTILINGUAL" "$LOG_FILE_LLMSOFF" "$LOG_FILE_EDGE" "$LOG_FILE_OFF"     "$LOG_FILE_BADTABLES" "$LOG_FILE_NSOFF" "$LOG_FILE_NOSECTIONPAGES" "$LOG_FILE_NOLINKMD"     "$LOG_FILE_NOBUILDTIME" "$LOG_FILE_LLMSINDEXOFF" "$LOG_FILE_UNWIRED" "$LOG_FILE_NOLINKINDEXES" "$LOG_FILE_NOCOMPACT" "$LOG_FILE_STRICTSKILLS" "$LOG_FILE_SHADOW" "$LOG_FILE_PAGINATED" "$LOG_FILE_WIDGETS" "$LOG_FILE_EXTRA" "$ORIGIN_LOG" "$ORIGIN_REQUEST_LOG"
}
cleanup_exit() {
  kill_stray_hugo
  stop_origin
}
trap cleanup_interrupted INT TERM
trap cleanup_exit EXIT

cd "$HERE"

# ---- Data files first, before anything builds ----
npm run --silent test:data

# ---- Pre-launch process check ----
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

# ---- The fixture origin ----
# Started before any build, stopped by the EXIT trap. The stop first clears an
# origin left behind by an aborted run; a port held by anything else makes the
# listen fail, which `wait` reports with the server's own message rather than
# letting the builds fetch from whatever is actually there.
stop_origin
node "$HERE/serve-origin.mjs" serve "$ORIGIN_PORT" > "$ORIGIN_LOG" 2>&1 &
if ! node "$HERE/serve-origin.mjs" wait "$ORIGIN_PORT"; then
  echo "The fixture origin did not start on 127.0.0.1:${ORIGIN_PORT}:" >&2
  cat "$ORIGIN_LOG" >&2
  exit 1
fi

build() {
  local dir="$1" env_name="$2" dest="$3" log="$4"
  local args=(--gc --logLevel info --cleanDestinationDir --destination "$dest")
  if [ -n "$env_name" ]; then
    args+=(-e "$env_name")
  fi
  (cd "$dir" && hugo "${args[@]}") > "$log" 2>&1 || {
    echo "hugo build failed (${env_name:-default} in ${dir}):" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$log"; then
    echo "Hugo reported deprecations (${env_name:-default} in ${dir}):" >&2
    grep -i "deprecat" "$log" >&2
    exit 1
  fi
  if grep -q "ERROR" "$log"; then
    echo "Hugo reported errors (${env_name:-default} in ${dir}):" >&2
    grep "ERROR" "$log" >&2
    exit 1
  fi
  if grep -q "found no layout file" "$log"; then
    echo "Hugo reported a missing layout (${env_name:-default} in ${dir}):" >&2
    grep "found no layout file" "$log" >&2
    exit 1
  fi
}

# ---- Stale-output purge ----
# Hugo's --cleanDestinationDir never deletes dot-prefixed paths, so a stale
# .well-known/ artifact -- or a whole abandoned destination directory --
# survives every rebuild and can flip a published-surface assertion years
# after the build that wrote it. Each destination root is removed outright
# before its builds instead.
rm -rf "$FIXTURE_DIR/public" "$SHADOW_DIR/public" "$PAGINATED_DIR/public" "$WIDGETS_DIR/public" "$EXTRA_DIR/public"

build "$FIXTURE_DIR" "" public/baseline "$LOG_FILE"
build "$FIXTURE_DIR" configured public/configured "$LOG_FILE_CONFIGURED"
build "$FIXTURE_DIR" minimal public/minimal "$LOG_FILE_MINIMAL"
build "$FIXTURE_DIR" notwins public/notwins "$LOG_FILE_NOTWINS"
build "$FIXTURE_DIR" multilingual public/multilingual "$LOG_FILE_MULTILINGUAL"
build "$FIXTURE_DIR" llmsoff public/llmsoff "$LOG_FILE_LLMSOFF"
build "$FIXTURE_DIR" edge public/edge "$LOG_FILE_EDGE"
build "$FIXTURE_DIR" off public/off "$LOG_FILE_OFF"
build "$FIXTURE_DIR" badtables public/badtables "$LOG_FILE_BADTABLES"
build "$FIXTURE_DIR" nsoff public/nsoff "$LOG_FILE_NSOFF"
build "$FIXTURE_DIR" nosectionpages public/nosectionpages "$LOG_FILE_NOSECTIONPAGES"
build "$FIXTURE_DIR" nolinkmd public/nolinkmd "$LOG_FILE_NOLINKMD"
build "$FIXTURE_DIR" nobuildtime public/nobuildtime "$LOG_FILE_NOBUILDTIME"
build "$FIXTURE_DIR" llmsindexoff public/llmsindexoff "$LOG_FILE_LLMSINDEXOFF"
build "$FIXTURE_DIR" unwired public/unwired "$LOG_FILE_UNWIRED"
build "$FIXTURE_DIR" nolinkindexes public/nolinkindexes "$LOG_FILE_NOLINKINDEXES"
build "$FIXTURE_DIR" nocompact public/nocompact "$LOG_FILE_NOCOMPACT"
build "$FIXTURE_DIR" strictskills public/strictskills "$LOG_FILE_STRICTSKILLS"
build "$SHADOW_DIR" "" public "$LOG_FILE_SHADOW"
build "$PAGINATED_DIR" "" public "$LOG_FILE_PAGINATED"
build "$WIDGETS_DIR" "" public "$LOG_FILE_WIDGETS"
build "$EXTRA_DIR" "" public "$LOG_FILE_EXTRA"

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/baseline"
export FIXTURE_PUBLIC_CONFIGURED="$FIXTURE_DIR/public/configured"
export FIXTURE_PUBLIC_MINIMAL="$FIXTURE_DIR/public/minimal"
export FIXTURE_PUBLIC_NOTWINS="$FIXTURE_DIR/public/notwins"
export FIXTURE_PUBLIC_MULTILINGUAL="$FIXTURE_DIR/public/multilingual"
export FIXTURE_PUBLIC_LLMSOFF="$FIXTURE_DIR/public/llmsoff"
export FIXTURE_PUBLIC_EDGE="$FIXTURE_DIR/public/edge"
export FIXTURE_PUBLIC_OFF="$FIXTURE_DIR/public/off"
export FIXTURE_PUBLIC_BADTABLES="$FIXTURE_DIR/public/badtables"
export FIXTURE_PUBLIC_NSOFF="$FIXTURE_DIR/public/nsoff"
export FIXTURE_PUBLIC_NOSECTIONPAGES="$FIXTURE_DIR/public/nosectionpages"
export FIXTURE_PUBLIC_NOLINKMD="$FIXTURE_DIR/public/nolinkmd"
export FIXTURE_PUBLIC_NOBUILDTIME="$FIXTURE_DIR/public/nobuildtime"
export FIXTURE_PUBLIC_LLMSINDEXOFF="$FIXTURE_DIR/public/llmsindexoff"
export FIXTURE_PUBLIC_UNWIRED="$FIXTURE_DIR/public/unwired"
export FIXTURE_PUBLIC_NOLINKINDEXES="$FIXTURE_DIR/public/nolinkindexes"
export FIXTURE_PUBLIC_NOCOMPACT="$FIXTURE_DIR/public/nocompact"
export FIXTURE_PUBLIC_STRICTSKILLS="$FIXTURE_DIR/public/strictskills"
export FIXTURE_PUBLIC_SHADOW="$SHADOW_DIR/public"
export FIXTURE_PUBLIC_PAGINATED="$PAGINATED_DIR/public"
export FIXTURE_PUBLIC_WIDGETS="$WIDGETS_DIR/public"
export FIXTURE_PUBLIC_EXTRA="$EXTRA_DIR/public"
export HUGO_BUILD_LOG="$LOG_FILE"
export HUGO_BUILD_LOG_CONFIGURED="$LOG_FILE_CONFIGURED"
export HUGO_BUILD_LOG_MINIMAL="$LOG_FILE_MINIMAL"
export HUGO_BUILD_LOG_NOTWINS="$LOG_FILE_NOTWINS"
export HUGO_BUILD_LOG_MULTILINGUAL="$LOG_FILE_MULTILINGUAL"
export HUGO_BUILD_LOG_LLMSOFF="$LOG_FILE_LLMSOFF"
export HUGO_BUILD_LOG_EDGE="$LOG_FILE_EDGE"
export HUGO_BUILD_LOG_OFF="$LOG_FILE_OFF"
export HUGO_BUILD_LOG_BADTABLES="$LOG_FILE_BADTABLES"
export HUGO_BUILD_LOG_NSOFF="$LOG_FILE_NSOFF"
export HUGO_BUILD_LOG_NOSECTIONPAGES="$LOG_FILE_NOSECTIONPAGES"
export HUGO_BUILD_LOG_NOLINKMD="$LOG_FILE_NOLINKMD"
export HUGO_BUILD_LOG_NOBUILDTIME="$LOG_FILE_NOBUILDTIME"
export HUGO_BUILD_LOG_LLMSINDEXOFF="$LOG_FILE_LLMSINDEXOFF"
export HUGO_BUILD_LOG_UNWIRED="$LOG_FILE_UNWIRED"
export HUGO_BUILD_LOG_NOLINKINDEXES="$LOG_FILE_NOLINKINDEXES"
export HUGO_BUILD_LOG_NOCOMPACT="$LOG_FILE_NOCOMPACT"
export HUGO_BUILD_LOG_STRICTSKILLS="$LOG_FILE_STRICTSKILLS"
export HUGO_BUILD_LOG_SHADOW="$LOG_FILE_SHADOW"
export HUGO_BUILD_LOG_PAGINATED="$LOG_FILE_PAGINATED"
export HUGO_BUILD_LOG_WIDGETS="$LOG_FILE_WIDGETS"
export HUGO_BUILD_LOG_EXTRA="$LOG_FILE_EXTRA"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

npm test "$@"
