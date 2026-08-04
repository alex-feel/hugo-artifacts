# github-profile module test suite

Node build-output assertions for `shortcodes/github-profile`, pinning a defect in the headline metric strip's separators that only surfaces after Hugo's `--minify` pass runs. The module ships no client-side JavaScript, so there is no browser behavior to test and the suite carries no Playwright dependency; every assertion reads bytes straight out of a published `index.html`.

**This is the only test suite in this repository that builds its fixture with `hugo --minify`, and that matters because the defect it pins is invisible without it.** Hugo's minifier collapses every run of whitespace to a single character and then deletes any whitespace that immediately follows it, even across a tag boundary, so a newline-plus-indent sitting just inside a wrapper's closing tag can eat the LEADING space of the separator element that follows it. A plain build's pretty-printed whitespace still contains that same newline-plus-indent, but nothing depends on it there, so a plain-only suite reads a well-formed strip and never sees the byte the minifier deletes. Every spec here therefore reads two builds of the same fixture rather than one, and the assertions that matter most read the minified tree specifically.

## Running

```bash
bash shortcodes/github-profile/test/run-tests.sh
```

or, on Windows:

```text
shortcodes\github-profile\test\run-tests.cmd
```

Both runners perform the repository's pre-launch Hugo process check, purge stale output, build the offline fixture TWICE from the same fixture directory -- once plain, once with `--minify` -- fail hard on any `deprecat`, `ERROR`, or `found no layout file` line in either build log, and then run the assertions.

> **These builds need no network access.** The fixture shadows the module's remote-fetch partial (`layouts/_partials/github-profile/fetch.html`) with one that reads a canned GraphQL snapshot from `data/github-profile-fetch.json`, so both builds are fully offline. The one remaining network call the module can make -- `avatar="fetch"` copying the avatar image at build time -- is sidestepped by requesting `avatar="hotlink"` instead.

Re-run the assertions alone against existing builds by setting the same environment variables the runner exports and calling `npm test` directly:

```bash
FIXTURE_PUBLIC=fixture/public/normal \
FIXTURE_PUBLIC_MINIFIED=fixture/public/minified \
HUGO_BUILD_LOG=hugo-build.log \
HUGO_BUILD_LOG_MINIFIED=hugo-build-minified.log \
npm test
```

## Two builds, one fixture

| Build | Destination | Extra flags | What it proves |
| --- | --- | --- | --- |
| normal | `fixture/public/normal` | none | The control. Whatever the minifier does to the published bytes, a reader must get the same sentence out of either tree, and only the plain tree proves the markup was well-formed before the minifier touched it -- if the plain build ever failed the text-layer assertions, the defect would be in the templates rather than in `--minify`. |
| minified | `fixture/public/minified` | `--minify` | Where the defect actually lives. The note separator's leading space and the calendar summary's total-to-window separating space only vanish here, because only here does the minifier delete the whitespace that a reformatted wrapper's closing tag leaves behind. |

## Specs

63 assertions across 7 spec files plus the shared `helpers.js`, run with Node's own `node --test`.

| File | Assertions | Covers |
| --- | --- | --- |
| `tests/helpers.js` | — | The shared byte-level HTML scanner: quote-aware tag scanning, class-token extraction that tolerates the minifier's unquoted single-token form, entity decoding (the plain build escapes `A&#43;` where the minified build writes `A+`), element and child-node extraction, and the `extractedText` extractor model an HTML-to-text reader would apply. `BUILDS = [{normal}, {minified}]` drives every two-build loop. |
| `tests/01-separator-bytes.spec.js` | 8 (4 x 2 builds) | THE REGRESSION LOCK. The note separator's inner bytes equal `20 e2 80 94 20` (space, em dash, space) in both builds; the whole `<span class="github-profile__sep github-profile__sep--note"> — </span>` element is published verbatim; every one of the five group separators keeps its trailing space; no separator is published empty. |
| `tests/02-headline-text-layer.spec.js` | 11 | The assertion that would have caught the original report: the headline strip reads as one correctly separated sentence through the extractor model, the recency-count -> em-dash -> note run is never glued on either side, every pair of metric groups is joined by `", "`, the strip's own text nodes carry no content, and both builds read identically once the extractor's whitespace collapse is applied. |
| `tests/03-minify-whitespace-guard.spec.js` | 8 | The structural rule the fix consists of, asserted directly rather than only through its currently visible consequence: no wrapper in the strip ends with a trailing whitespace text node, every wrapping metric group's markup ends in the literal `</span></span>`, masking the separators out of the strip leaves no whitespace immediately before any closing tag, the rank-group-to-note-separator byte run is published as one literal in both trees, and the minified build glues the floor note straight onto the separator with no whitespace of its own. |
| `tests/04-calendar-summary.spec.js` | 9 | The second live instance of the same defect class: the calendar summary's total and window stay separated in the text layer, its total wrapper never ends with trailing whitespace, both streak lines keep their label apart from their value, the minified build publishes exactly one whitespace character between the total and the window, and the calendar grid's `data-total` attribute agrees with the number the summary prints. |
| `tests/05-build-log.spec.js` | 10 | A second, independent gate on top of the runner's own log grep: each captured log is a real Hugo build log (banner plus a `Total in N ms` completion line), and it carries zero `WARN` lines, zero case-insensitive `deprecat` mentions, zero `ERROR` or `found no layout file` lines, and zero mentions of `github-profile` itself -- the last of which would mean the canned-data seam stopped working and every other spec was passing against a degraded rendering instead of the real one. |
| `tests/06-sibling-boundaries.spec.js` | 7 | The same whitespace rule at the two boundaries that lie OUTSIDE the headline strip and the calendar summary, which specs 01 through 04 are scoped to and therefore cannot reach: the two `github-profile__streak` spans are siblings of the calendar summary rather than children of it, and the identity section's meta items are in neither scope, so a revert there republishes the defect one section down while every other assertion stays green. Structural rather than textual, because the identity section prints a tenure derived from the wall clock: each streak and meta-item wrapper closes on its last child, the website item closes directly on its anchor, the minified build keeps exactly one whitespace character at both boundaries, and a page-wide backstop states the invariant over every INLINE wrapper in the widget so a section added later inherits it. |
| `tests/07-language-shares.spec.js` | 10 (5 x 2 builds) | One format for every percentage in the language row. A share is a float and a float prints its shortest form, so a language landing on a whole number rendered `44%` beside `23.9%` -- invisible to a person, an exception to the format for anything parsing the row as a set. Every rendered share matches a one-decimal shape and the row equals its expected values; the three surfaces of an item (the printed text, `data-pct`, and `--github-profile-lang-share`) carry ONE string, which is what formatting in `derive.html` rather than at each render site buys and what a render-site fix fails; a language under 0.05% renders `0.0%` and keeps its entry while the ninth language is cut by the top-eight cap. One assertion exists purely to keep the rest from going vacuous: the fixture's byte counts MUST produce shares that land on a whole number, because the counts that shipped produced none and the broken and fixed templates emitted byte-identical rows here. |

## The fixture's shadowed fetch seam

The module fetches live GitHub GraphQL data at build time and needs `HUGO_GITHUB_TOKEN` to do it; this fixture is fully offline instead. `fixture/layouts/_partials/github-profile/fetch.html` shadows the module's own partial of the same path and returns a canned dict read from `fixture/data/github-profile-fetch.json` (a 1186-line GraphQL snapshot) via `index hugo.Data "github-profile-fetch"` rather than calling `resources.GetRemote`. Every other partial in the chain -- derive, render, and every section template -- runs for real, which is the whole point: the suite asserts the markup those real templates emit, not a stub of it. A login other than the canned `fixture-dev` returns `apiOk false` with `degradedReason "not-found"`, and a missing data file raises `errorf` rather than degrading silently, because a silent degradation there would make every assertion in the suite pass vacuously against the identity chip.

The canned values were chosen to exercise every branch the headline strip and calendar summary render: commits `1842` formats to `1.8k`; `mergedPrCount 1289` formats to `1.3k` and is non-negative, so the merged-PRs branch wins over the plain PR-count branch; `repositoriesContributedTo.totalCount 18` is read against only 6 returned nodes, proving the external-repositories metric reads the total count rather than the node-list length; 3 distinct organization owners produce `externalOrgs 3`; the calendar spans 14 weeks (98 days) with 63 active days but only 55 of them inside the trailing 90-day window, exercising the truncation branch that the recency metric reads; `restrictedContributionsCount 7934` formats to the grouped `7,934` that the floor note and its separator sit next to, which is the defect site; `show-rank` resolves to level `A+` at percentile `7.4`; the current streak is `12` days and the longest is `21`. The language byte counts are cut to the same standard and sum to exactly 1,500,000 so the shares are exact: they produce values landing ON a whole number (Go `44.0%`, HTML `4.0%`), values ROUNDING onto one (Rust from 8.98, CSS from 3.02), ordinary one-decimal values, and one language under 0.05% of the total that renders `0.0%` from inside the top eight while a smaller ninth is cut by the cap. That last group is the point: the counts that shipped gave every language a nonzero decimal, so the row a broken template published was byte-identical to the row a correct one did, and no assertion here could have told them apart. The one value the fixture cannot pin is `tenureYears` in the identity section, computed as `now - createdAt`, so no spec here asserts it.
