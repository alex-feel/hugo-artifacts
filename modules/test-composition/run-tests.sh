#!/usr/bin/env bash
# Builds the composition fixture THREE TIMES with hugo (builds, not servers: no
# port binding for Hugo itself, and a finite build exits by itself) and runs the
# Node build-output assertion suite against the three trees.
#
# Every module here is proven alone by its own suite; what none of those
# fixtures can see is what the modules do in each other's company. Several such
# surfaces live in these builds.
#
# The consuming site's single [outputs] table. Hugo replaces the output list
# per page kind and never merges a module's own [outputs], so a consumer
# following two module READMEs literally ends up either with two [outputs]
# tables in one file (a config-load failure) or with one table replacing the
# other (an exit-0 build that silently stops publishing documents). These
# builds hold the merged list that publishes all of them.
#
# The generated-image hook. seo names a partial to compose an image for a page
# that has no image of its own, og-image composes one, and only a site holding
# both can show a real card reaching og:image -- with the file it names on
# disk, at the right size, drawn on this site's own base raster.
#
# The URL registry. Four content-side modules publish files belonging to THIS
# site by reading their URLs, github-profile copies remote avatars at build
# time, and agent-readiness publishes skill artifacts no walk of the page graph
# reaches; only a site that also holds url-retirement can show those URLs
# arriving in /url-manifest.txt with nothing configured for them, and only
# these builds can show the derivatives beside them staying out.
#
# WHY THREE BUILDS.
#   base            -- no skill configured, which is the ONLY coverage of an
#                      unconfigured skills surface: the agentskills format stays
#                      wired while publishing no document, and the manifest must
#                      not list a URL nothing wrote.
#   skills          -- one skill configured, so the artifacts exist and the
#                      writes hook has something to answer with.
#   one-url-per-page -- the same, with url_retirement.manifest.output_formats
#                      switched off. That setting decides whether the
#                      publication hook runs, and therefore whether a
#                      registration placed at the copy would be in time; the
#                      artifacts must be listed here too, which is the assertion
#                      every push design fails and the shipped pull passes.
#
# The last two fetch their skills AND the github-profile avatars over HTTP from
# an origin this suite owns, served by serve-origin.mjs out of fixture-origin/.
# A skill entry names a REMOTE source and has no local form, and a fetch-mode
# avatar copy is likewise a remote image the module fetches at build time, so
# there is no offline way to make either artifact exist; serving the bytes
# ourselves keeps the suite off anybody else's endpoint.
#
# Follows the repository's hugo process lifecycle rule with a pre-launch
# process check, and hard-fails on any deprecation or error output in any build
# log.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$HERE/fixture"
LOG_BASE="$HERE/hugo-build.log"
LOG_SKILLS="$HERE/hugo-build-skills.log"
LOG_ONE_URL="$HERE/hugo-build-one-url-per-page.log"
ORIGIN_LOG="$HERE/fixture-origin.log"
ORIGIN_PORT=1919
ORIGIN_PID=""

# The logs are retained after a successful run so the documented re-run recipe
# can read them; they are gitignored at the repo root. Only an interrupt
# discards them mid-run.
cleanup() {
  if [ -n "$ORIGIN_PID" ]; then
    kill "$ORIGIN_PID" 2>/dev/null || true
    wait "$ORIGIN_PID" 2>/dev/null || true
  fi
}
trap 'cleanup; rm -f "$LOG_BASE" "$LOG_SKILLS" "$LOG_ONE_URL" "$ORIGIN_LOG"' INT TERM
trap cleanup EXIT

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

# The destination is REMOVED, not merely cleaned. --cleanDestinationDir only
# removes files that no longer exist in the static directories, so a document a
# previous build published and this one does not would survive into the trees
# these specs read -- and a dropped format would then assert green off stale
# bytes. Removing the tree is what makes the presence assertions mean "this
# build published it".
rm -rf "$FIXTURE_DIR/public"

build() {
  local name="$1" dest="$2" configs="$3" log="$4"
  (cd "$FIXTURE_DIR" && hugo --logLevel info --config "$configs" --cleanDestinationDir --destination "$dest") > "$log" 2>&1 || {
    echo "hugo build failed (composition/$name):" >&2
    cat "$log" >&2
    exit 1
  }
  if grep -qi "deprecat" "$log"; then
    echo "Hugo reported deprecations (composition/$name):" >&2
    grep -i "deprecat" "$log" >&2
    exit 1
  fi
  if grep -q "ERROR" "$log"; then
    echo "Hugo reported errors (composition/$name):" >&2
    grep "ERROR" "$log" >&2
    exit 1
  fi
}

build base public/base "hugo.toml" "$LOG_BASE"

# The origin serves only the two builds below, and is stopped by the EXIT trap
# whatever happens to them. The stop first clears an origin left behind by an
# aborted Windows run, which has no trap; a port held by anything else makes the
# listen fail, which `wait` reports with the server's own message rather than
# letting the builds fetch from whatever is actually there.
node "$HERE/serve-origin.mjs" stop >/dev/null 2>&1 || true
node "$HERE/serve-origin.mjs" serve "$ORIGIN_PORT" > "$ORIGIN_LOG" 2>&1 &
ORIGIN_PID=$!
if ! node "$HERE/serve-origin.mjs" wait "$ORIGIN_PORT"; then
  echo "The fixture origin did not start on 127.0.0.1:${ORIGIN_PORT}:" >&2
  cat "$ORIGIN_LOG" >&2
  exit 1
fi

build skills public/skills "hugo.toml,skills.toml" "$LOG_SKILLS"
build one-url-per-page public/one-url-per-page "hugo.toml,skills.toml,one-url-per-page.toml" "$LOG_ONE_URL"

export FIXTURE_PUBLIC="$FIXTURE_DIR/public/base"
export FIXTURE_PUBLIC_SKILLS="$FIXTURE_DIR/public/skills"
export FIXTURE_PUBLIC_ONE_URL="$FIXTURE_DIR/public/one-url-per-page"
export HUGO_BUILD_LOG="$LOG_BASE"
export HUGO_BUILD_LOG_SKILLS="$LOG_SKILLS"
export HUGO_BUILD_LOG_ONE_URL="$LOG_ONE_URL"

cd "$HERE"
npm test "$@"
