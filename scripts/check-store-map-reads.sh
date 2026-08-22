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
# GetSortedMapValues keeps the map inside the store, and that is NOT the same as
# reading it under the lock. Measured in Hugo's source at v0.164.0 and unchanged
# on main: it takes the read lock, copies out the map HEADER, releases the lock,
# and only then ranges the map and indexes it. Every one of those reads is
# therefore unsynchronized against a concurrent SetInMap, which is the same
# fatal pair as above, reached through the store's own accessor.
#
# So it is flagged too, and a call clears the check by carrying a
# `no-concurrent-writer:` comment naming why no write to that key can be in
# flight where the call runs. The marker may sit anywhere in the comment block
# immediately above the call, or on the call's own line; the first line carrying
# code consumes it, so it covers the one call it was written for and never the
# next one. It counts only inside a Go-template comment, which is checked by
# requiring it to survive in the raw line and vanish from the blanked code -- a
# marker emitted as output text is not a marker, and neither is a bare one with
# no reason after the colon.
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

    FNR == 1 { delete fromstore; incomment = 0; marked = 0 }

    {
      rest = $0
      code = ""
      while (rest != "") {
        if (incomment) {
          at = index(rest, "*/")
          if (at == 0) break
          rest = substr(rest, at + 2)
          incomment = 0
          # The opener swallowed the `{{` that introduced the comment, so the
          # closer swallows the `}}` that ends it. Left behind, those two
          # characters are the only thing on the closing line of a block
          # comment and read as code, which would consume a marker the block
          # carries before the call below it ever sees it.
          sub(/^[ \t]*-?\}\}/, "", rest)
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

      # The exemption marker, honored only where it sits inside a Go-template
      # comment: present in the raw line and absent from the blanked code is
      # exactly what being inside a comment means here, so a marker emitted as
      # output text never clears anything. A bare marker does not either -- the
      # colon has to be followed by the reason.
      # A letter, not merely a non-space: the closing `*/` of the comment the
      # marker sits in is itself a non-space character, so a weaker test lets a
      # reasonless marker through.
      if (($0 ~ /no-concurrent-writer:[ \t]*[A-Za-z]/) && (code !~ /no-concurrent-writer:/)) {
        marked = 1
      }

      # Enumeration through the accessor the store provides, which releases the
      # lock before it reads the map.
      if (code ~ /Store\.GetSortedMapValues([^A-Za-z0-9_]|$)/ && !marked) {
        printf "%s:%d: enumerates a store map through GetSortedMapValues, which reads it outside the store lock. Add a `no-concurrent-writer:` comment naming why no SetInMap on that key can be in flight here.\n", FILENAME, FNR
        status = 1
      }

      # A map read written straight into the call, with no variable between.
      # Get is matched at a word boundary, so GetSortedMapValues -- reported
      # above on its own terms -- is not counted twice here.
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

      # A marker reaches the call it was written for and no further: it survives
      # the blank lines and the rest of its own comment block, and the first
      # line carrying any code at all consumes it. So one marker never covers a
      # second call further down the file.
      if (code ~ /[^ \t]/) {
        marked = 0
      }
    }

    END { exit status }
  ' "$@"
}

# The scanner is checked against known-answer cases before it is trusted with
# the repository, because every way this check can break makes it QUIETER: a
# marker rule that accepts too much, or a pattern that matches nothing, reports
# a clean sweep. The exemption cases are the ones that need it most -- a marker
# that stops being read is invisible, and the failing case that proves each rule
# is the only thing separating "found nothing" from "looked for nothing".
selftest() {
  local dir case expectation failures=0 checked=0
  dir="$(mktemp -d)"

  cat > "$dir/unmarked.html" <<'CASE'
{{- $v := hugo.Store.GetSortedMapValues "k" -}}
CASE

  cat > "$dir/marked-in-block.html" <<'CASE'
{{/* Prose about the key, then the reason on a later line of the same comment.

     no-concurrent-writer: nothing writes this key in this pass. */}}
{{- $v := hugo.Store.GetSortedMapValues "k" -}}
CASE

  cat > "$dir/marker-as-output.html" <<'CASE'
no-concurrent-writer: written as output text rather than in a comment
{{- $v := hugo.Store.GetSortedMapValues "k" -}}
CASE

  cat > "$dir/marker-without-reason.html" <<'CASE'
{{/* no-concurrent-writer: */}}
{{- $v := hugo.Store.GetSortedMapValues "k" -}}
CASE

  cat > "$dir/marker-not-reused.html" <<'CASE'
{{/* no-concurrent-writer: the reason for the first call only. */}}
{{- $a := hugo.Store.GetSortedMapValues "k" -}}
{{- $b := hugo.Store.GetSortedMapValues "other" -}}
CASE

  cat > "$dir/get-in-place.html" <<'CASE'
{{- range (index (hugo.Store.Get "k") "u") -}}{{- end -}}
CASE

  cat > "$dir/get-through-variable.html" <<'CASE'
{{- $m := hugo.Store.Get "k" -}}
{{- range $m -}}{{- end -}}
CASE

  cat > "$dir/docstring-names-the-hazard.html" <<'CASE'
{{/* Never write `index (hugo.Store.Get $k) $u` here: it aborts the build. */}}
{{- $ok := "plain" -}}
CASE

  cat > "$dir/no-store-at-all.html" <<'CASE'
{{- $page := .page -}}
{{- return $page.Title -}}
CASE

  for case in unmarked marker-as-output marker-without-reason marker-not-reused \
              get-in-place get-through-variable; do
    checked=$((checked + 1))
    if scan "$dir/$case.html" >/dev/null 2>&1; then
      echo "check-store-map-reads: SELF-TEST FAILED -- $case was not reported." >&2
      failures=$((failures + 1))
    fi
  done

  for case in marked-in-block docstring-names-the-hazard no-store-at-all; do
    checked=$((checked + 1))
    if ! scan "$dir/$case.html" >/dev/null 2>&1; then
      echo "check-store-map-reads: SELF-TEST FAILED -- $case was reported and must not be." >&2
      failures=$((failures + 1))
    fi
  done

  rm -rf "$dir"

  if [ "$failures" -ne 0 ]; then
    echo "check-store-map-reads: the scanner does not do what it claims, so its verdict on the repository means nothing." >&2
    exit 2
  fi

  echo "check-store-map-reads: scanner self-test passed ($checked cases)."
}

selftest

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
echo "     A map a store hands out is the live one, and GetSortedMapValues reads it after releasing the lock, so either read aborts the build when a page beside this one writes that map." >&2
exit 1
