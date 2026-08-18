#!/usr/bin/env bash
# Fails when a template calls a Hugo language method the documentation has
# retired.
#
# Hugo's v0.158.0 language deprecations come in two kinds, and only one of them
# is visible to a build. `.LanguageCode`, `.LanguageDirection` and
# `.LanguageName` are deprecated in Hugo's own code: each logs a WARN today and
# is scheduled to fail the build later, so every suite that greps its build log
# for a deprecation already catches them. `.Lang` carries the same
# `deprecated-in 0.158.0` tag on gohugo.io, but nothing in the binary reports
# it -- a build at v0.164.0 prints no notice at any log level -- so no build
# gate in this repository can see it. That silence is what this check exists
# for; the three noisy names are listed beside it because one check that knows
# the whole set is easier to keep true than two that each know half.
#
# `.Weight` carries the same documentation tag and is deliberately NOT listed:
# nothing is documented to replace it, so flagging it would demand a
# substitution nobody can name.
#
# It reads every tracked file under a `layouts/` directory, which is where this
# repository executes Go templates, and it blanks Go-template comments before
# matching, because a docstring that NAMES a retired spelling in order to
# forbid it is an established idiom here and has to keep working.
#
# Markdown is deliberately out of reach. A README that documents a retired
# spelling as the thing to call and one that names it as the thing to avoid are
# the same bytes, and only a reader can tell them apart.
#
# Usage:
#   scripts/check-deprecated-hugo-api.sh
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# The scanner. Reads template files, blanks the comment regions, and reports
# every call to a retired spelling as "<file>:<line>: <message>".
#
# The comment tracker closes on the first `*/` it meets, exactly as Hugo's own
# parser does, so a comment carrying that sequence inside an example ends early
# here for the same reason it ends early in a build. That errs toward reporting
# text a build would also treat as code, never toward missing a real call.
scan() {
  awk '
    BEGIN {
      n = split("Lang:Name LanguageCode:Locale LanguageDirection:Direction LanguageName:Label", pairs, " ")
      for (i = 1; i <= n; i++) {
        split(pairs[i], p, ":")
        retired[i] = p[1]
        modern[i] = p[2]
      }
      status = 0
    }

    FNR == 1 { incomment = 0 }

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

      for (i = 1; i <= n; i++) {
        if (code ~ ("\\." retired[i] "([^A-Za-z0-9_]|$)")) {
          printf "%s:%d: calls .%s, retired in Hugo v0.158.0. Use .%s instead.\n", FILENAME, FNR, retired[i], modern[i]
          status = 1
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
  echo "check-deprecated-hugo-api: no template files found under any layouts/ directory." >&2
  echo "check-deprecated-hugo-api: run this from a checkout of the repository." >&2
  exit 2
fi

if findings="$(scan "${templates[@]}")"; then
  echo "check-deprecated-hugo-api: ${#templates[@]} template(s) call no retired language method."
  exit 0
fi

while IFS= read -r finding; do
  [ -n "$finding" ] || continue
  echo "FAIL $finding" >&2
done <<< "$findings"
echo "     A retired spelling belongs in a comment or a README, never in a template action." >&2
exit 1
