#!/usr/bin/env bash
# Validates the shipped data files, then builds SIXTEEN fixture sites with
# hugo (builds, not servers: no port binding, and a finite build exits by
# itself) and runs the Node build-output assertion suite against all sixteen.
#
# The data-file check runs FIRST, before any build. That ordering is the
# point: a malformed registry otherwise surfaces as an opaque Hugo failure at
# some unrelated template, and the reader has to work backwards to it.
#
# The sixteen builds:
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
#   off        -- the master switch ALONE, false, while all four formats stay
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
# NETWORK: the agent-skills specs exercise a real build-time remote fetch,
# because the digest guarantee cannot be proven without one. The widgets
# build additionally fetches the widget modules' remote APIs (GitHub, the
# Hugging Face Hub, arXiv, YouTube posters); those fetches degrade with
# WARN lines when tokenless or rate-limited, which the log gates below
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
LOG_FILE_SHADOW="$HERE/hugo-build-shadow.log"
LOG_FILE_PAGINATED="$HERE/hugo-build-paginated.log"
LOG_FILE_WIDGETS="$HERE/hugo-build-widgets.log"
LOG_FILE_EXTRA="$HERE/hugo-build-extra.log"

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
cleanup_interrupted() {
  kill_stray_hugo
  rm -f "$LOG_FILE" "$LOG_FILE_CONFIGURED" "$LOG_FILE_MINIMAL" "$LOG_FILE_NOTWINS"     "$LOG_FILE_MULTILINGUAL" "$LOG_FILE_LLMSOFF" "$LOG_FILE_EDGE" "$LOG_FILE_OFF"     "$LOG_FILE_BADTABLES" "$LOG_FILE_NSOFF" "$LOG_FILE_NOSECTIONPAGES" "$LOG_FILE_NOLINKMD"     "$LOG_FILE_SHADOW" "$LOG_FILE_PAGINATED" "$LOG_FILE_WIDGETS" "$LOG_FILE_EXTRA"
}
trap cleanup_interrupted INT TERM
trap kill_stray_hugo EXIT

cd "$HERE"

# ---- Data files first, before anything builds ----
npm run --silent test:data

# ---- Pre-launch process check ----
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
export HUGO_BUILD_LOG_SHADOW="$LOG_FILE_SHADOW"
export HUGO_BUILD_LOG_PAGINATED="$LOG_FILE_PAGINATED"
export HUGO_BUILD_LOG_WIDGETS="$LOG_FILE_WIDGETS"
export HUGO_BUILD_LOG_EXTRA="$LOG_FILE_EXTRA"
HUGO_VERSION="$(hugo version | sed -E 's/^hugo v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
export HUGO_VERSION

npm test "$@"
