#!/usr/bin/env bash
# Verifies that every intra-repository go.mod require names a real, fetchable,
# CURRENT commit of the module it points at.
#
# A module in this repository may require a sibling module of the same
# repository (modules/pwa requires modules/workbox, which requires
# modules/idb). Go resolves such a require over the module proxy exactly like
# any third-party dependency, so the version must be a real commit
# pseudo-version. Two things can silently break that:
#
#   1. The placeholder version v0.0.0-00010101000000-000000000000. Go writes it
#      when a module is resolved through a workspace or a replace. It can never
#      be fetched, so a published module carrying one is unresolvable on its own
#      and forces every consuming site to add the sibling as a direct require --
#      a compensating construct nothing protects. Inside a test fixture the
#      placeholder is CORRECT, because the fixture pairs it with a replace
#      pointing at the local directory, and this script skips those.
#
#   2. A pin left behind. A commit cannot name its own hash, so the pin is moved
#      by a FOLLOW-UP commit; forget it and consumers keep resolving the
#      sibling's previous content with no error anywhere. This script fails in
#      that case, which turns a silent staleness into a red pull request.
#
# Usage:
#   scripts/check-module-pins.sh          # verify, exit non-zero on a problem
#   scripts/check-module-pins.sh --fix    # rewrite stale pins to the current commit
#
# --fix reads the sibling's latest commit from git history, so run it AFTER
# committing the change to that sibling. Push before relying on the result: the
# module proxy can only serve a commit that exists on the remote.
set -euo pipefail

MODULE_PREFIX='github.com/alex-feel/hugo-artifacts/'
PLACEHOLDER='v0.0.0-00010101000000-000000000000'

FIX=0
case "${1:-}" in
  --fix) FIX=1 ;;
  '') ;;
  *)
    echo "usage: $(basename "$0") [--fix]" >&2
    exit 2
    ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if ! git rev-parse --verify --quiet HEAD~1 >/dev/null 2>&1; then
  echo "check-module-pins: the repository history is too shallow to resolve pins." >&2
  echo "check-module-pins: check out with full history (actions/checkout fetch-depth: 0)." >&2
  exit 2
fi

status=0
checked=0

# Emits "<required-path> <version>" for every require of an intra-repository
# module that this go.mod does NOT also replace. A replace means the require is
# resolved locally and its version is never fetched, which is the fixture case.
requires_of() {
  awk -v prefix="$MODULE_PREFIX" '
    $1 == "replace" { replaced[$2] = 1; next }
    { lines[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        n = split(lines[i], f, /[ \t]+/)
        for (j = 1; j <= n; j++) {
          if (index(f[j], prefix) == 1 && j < n && substr(f[j + 1], 1, 1) == "v") {
            if (!(f[j] in replaced)) print f[j], f[j + 1]
          }
        }
      }
    }
  ' "$1"
}

while IFS= read -r gomod; do
  while read -r req_path req_version; do
    [ -n "${req_path:-}" ] || continue
    checked=$((checked + 1))

    sibling_dir="${req_path#"$MODULE_PREFIX"}"
    if [ ! -f "$sibling_dir/go.mod" ]; then
      echo "FAIL $gomod: requires $req_path, but $sibling_dir/go.mod does not exist." >&2
      status=1
      continue
    fi

    last_commit="$(git log -1 --format=%H -- "$sibling_dir")"
    want_version="v0.0.0-$(TZ=UTC git log -1 --date=format-local:'%Y%m%d%H%M%S' --format='%cd' "$last_commit")-$(git rev-parse --short=12 "$last_commit")"

    if [ "$req_version" = "$want_version" ]; then
      continue
    fi

    if [ "$FIX" -eq 1 ]; then
      ( cd "$(dirname "$gomod")" && go mod edit -require="$req_path@$want_version" )
      echo "FIXED $gomod: $req_path $req_version -> $want_version"
      continue
    fi

    if [ "$req_version" = "$PLACEHOLDER" ]; then
      echo "FAIL $gomod: $req_path is pinned to the unfetchable placeholder $PLACEHOLDER." >&2
    else
      echo "FAIL $gomod: $req_path is pinned to $req_version, which predates the latest commit to $sibling_dir/." >&2
    fi
    echo "     Expected $want_version (commit $(git rev-parse --short=12 "$last_commit")). Run: npm run check:pins -- --fix" >&2
    status=1
  done < <(requires_of "$gomod")
done < <(git ls-files '*/go.mod' 'go.mod')

if [ "$status" -eq 0 ]; then
  echo "check-module-pins: $checked intra-repository require(s) are current."
fi
exit "$status"
