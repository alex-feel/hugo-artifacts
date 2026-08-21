#!/usr/bin/env bash
# Fails when a template reads a map it took out of a Hugo store.
#
# `hugo.Store.Get` (and the site, page and shortcode stores beside it) returns
# the LIVE value, not a copy. When that value is a map, every read of it from a
# template -- `index`, `range`, `len`, `in`, a field access -- runs a Go map
# read outside the store's own lock, while any page rendering beside this one
# can be writing the same map through SetInMap. The Go runtime does not tolerate
# that pair: it prints `fatal error: concurrent map read and map write` and
# aborts the process mid-render. The build exits 1 with no output, and the same
# commit builds clean on the next run, so nothing about the failure points at
# the line that caused it.
#
# Nothing in a build reports the hazard before it fires, which is why this check
# exists. Ask the question of a scalar key instead: a per-item sentinel answers
# membership without letting the map escape into the template layer, and the
# store's own accessors keep the map to themselves.
#
# GetSortedMapValues is deliberately NOT flagged. It reads the map inside the
# store rather than handing it out, and whether it holds a lock while doing so
# has not been measured here -- so this check makes no claim about it in either
# direction, and flagging it would assert one.
#
# It reads every tracked file under a `layouts/` directory, which is where this
# repository executes Go templates, and it blanks Go-template comments before
# matching, so a docstring may explain the hazard -- as record-url.html's does
# -- without tripping the check that forbids it.
#
# Usage:
#   scripts/check-store-map-reads.sh
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# The scanner. Blanks the comment regions, remembers every variable a store's
# Get filled, and reports each later read of one as "<file>:<line>: <message>".
#
# A variable is always assigned before it is read in a Go template, so one
# forward pass sees the assignment first and needs no second look at the file.
#
# The comment tracker closes on the first `*/` it meets, exactly as Hugo's own
# parser does, so a comment carrying that sequence inside an example ends early
# here for the same reason it ends early in a build. That errs toward reporting
# text a build would also treat as code, never toward missing a real read.
scan() {
  awk '
    BEGIN { status = 0 }

    FNR == 1 { delete fromstore; incomment = 0 }

    {
      rest = $0
      code = ""
      while (rest != "") {
        if (incomment) {
          at = index(rest, "*/")
          if (at == 0) break
          rest = substr(rest, at + 2)
          incomment = 0
        } else {
          if (match(rest, /\{\{-?[ \t]*\/\*/) == 0) {
            code = code rest
            break
          }
          code = code substr(rest, 1, RSTART - 1)
          rest = substr(rest, RSTART + RLENGTH)
          incomment = 1
        }
      }

      # A map read written straight into the call, with no variable between.
      # Get is matched at a word boundary, so GetSortedMapValues -- which keeps
      # the map inside the store -- is not mistaken for it.
      if (code ~ /(index|range|len)[ \t]*\([^()]*Store\.Get([^A-Za-z0-9_]|$)/) {
        printf "%s:%d: reads a store value as a collection in place. Ask a scalar sentinel key instead.\n", FILENAME, FNR
        status = 1
      }

      # Every read of a variable an earlier line filled from a store.
      for (name in fromstore) {
        if (code ~ ("(index|range|len|in)[ \\t]+\\" name "([^A-Za-z0-9_]|$)") ||
            code ~ ("\\" name "\\.[A-Za-z_]")) {
          printf "%s:%d: reads %s as a collection, and an earlier line filled it from a store. Ask a scalar sentinel key instead.\n", FILENAME, FNR, name
          status = 1
        }
      }

      # Recorded after the reads above, so one line may both fill a variable and
      # be reported for a different one.
      if (match(code, /\$[A-Za-z_][A-Za-z0-9_]*[ \t]*:?=[ \t]*[^}]*Store\.Get([^A-Za-z0-9_]|$)/)) {
        assignment = substr(code, RSTART, RLENGTH)
        if (match(assignment, /\$[A-Za-z_][A-Za-z0-9_]*/)) {
          fromstore[substr(assignment, RSTART, RLENGTH)] = 1
        }
      }
    }

    END { exit status }
  ' "$@"
}

templates=()
while IFS= read -r -d '' file; do
  templates+=("$file")
done < <(git ls-files -z -- '*/layouts/*')

if [ "${#templates[@]}" -eq 0 ]; then
  echo "check-store-map-reads: no template files found under any layouts/ directory." >&2
  echo "check-store-map-reads: run this from a checkout of the repository." >&2
  exit 2
fi

if findings="$(scan "${templates[@]}")"; then
  echo "check-store-map-reads: ${#templates[@]} template(s) read no map out of a store."
  exit 0
fi

while IFS= read -r finding; do
  [ -n "$finding" ] || continue
  echo "FAIL $finding" >&2
done <<< "$findings"
echo "     A map a store hands out is the live one, and reading it while another page writes it aborts the build." >&2
exit 1
