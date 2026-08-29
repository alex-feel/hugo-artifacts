# Shortcode smoke suite

Node build-output assertions for the five shortcode modules that ship no suite of their own: [`arxiv-paper`](../arxiv-paper/README.md), [`callout`](../callout/README.md), [`github-repo`](../github-repo/README.md), [`hf-space`](../hf-space/README.md) and [`youtube-embed`](../youtube-embed/README.md). This directory is a test suite, not a Hugo module -- it ships no `layouts/`, no `assets/` and no `go.mod` of its own, and nothing imports it. Only [`fixture/`](fixture/) carries a `go.mod`, because a Hugo consumer site needs one.

## Why this suite exists

Until it existed, nothing in this repository rendered these five modules' templates except one fixture belonging to a different module, and nothing asserted a single byte of their output. A parse error, a call to a partial that no longer exists, or a rendering that silently lost its identity attributes reached consumers with every check green.

`shortcodes/github-profile` is the sixth shortcode module and is excluded here: it has its own suite, which builds its fixture twice and asserts considerably more than this one does.

## Running

```bash
bash shortcodes/test-smoke/run-tests.sh
```

or, on Windows:

```text
shortcodes\test-smoke\run-tests.cmd
```

Both runners perform the repository's pre-launch Hugo process check, build the fixture once into a private empty cache directory, hard-fail on any `deprecat` or `ERROR` line in the build log, and then run the assertions.

## Why the assertions are narrow

Every one of these modules fetches remote data at build time, so each emits not one shape but two: an **enriched** rendering when the fetch succeeded and a **degraded** one when it did not. Which shape a build produces is not a property of the code. It depends on whether the runner has network, whether an intercepting proxy answers, and whether Hugo's resource cache already holds a response.

Asserting the enriched shape would fail this suite on an offline machine; asserting the degraded shape would fail it on a connected one. Both would be assertions about the environment wearing the costume of assertions about the code. So every assertion holds in **both** modes:

| Asserted | Not asserted, and why |
| --- | --- |
| The BEM **block** class renders (`github-repo`, `hf-space`, `arxiv-paper`, `youtube-embed`, `callout`) | The **variant modifier** -- `--card` versus `--inline`, `--has-poster` versus `--no-poster` -- is exactly the pair that differs between the two modes |
| The **identity attribute** each module derives from its own parameter (`data-repo`, `data-space`, `data-arxiv-id`, `data-video-id`, `data-callout-type`) | Every attribute sourced from a response (`data-arxiv-category`, `data-sdk`, star counts, titles) |
| The **Markdown variant**'s parameter-derived line, which no other build in this repository renders for these five | The enrichment appended to that line when a fetch succeeded |
| No `map[`, `<no value>`, `ZgotmplZ` or `%!` reaches published output | -- |
| No `ERROR` and no deprecation in the build log | `WARN` is deliberately **not** gated: degrading by warning is these modules' documented contract, so a blanket gate would fail the suite on any runner without network |

The build cache is emptied and `--ignoreCache` is passed for the same reason: a cache populated by an earlier build would let a fetch "succeed" with no network at all. The suite tolerates either shape, but a run whose outcome depends on what a previous run left behind is not a run that means anything.

## The one pinned failure

Graceful degradation is the contract every one of these modules claims, and nothing tested it. The fixture pins one case: a callout whose `icon` is `https://icons.invalid/nonexistent.svg`. `.invalid` is reserved by [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606) and is guaranteed never to resolve, so that fetch fails on any runner, with or without network, and immediately rather than by timeout. The suite asserts exactly one warning, the callout still rendering, and the icon absent rather than emitted broken.

That is the only remote failure this fixture can make deterministic. The other four modules address hosts they hard-code, so their fetch outcome is whatever the runner's network gives.

## The time-label probes

The three modules that render a human-visible time label -- `github-repo`, `hf-space` and `arxiv-paper` -- share one contract: the relative ladder counts calendar days and starts at "today", every shown label sits inside a `<time datetime="...">` element carrying the raw ISO 8601 value, and the display parameter offers `relative`, `date` and `none`. A fetched timestamp can never pin that ladder, so the fixture's home layout calls the modules' partials directly with inputs derived from the build's own clock IN THE UTC FRAME (`now.UTC`, `now.UTC.AddDate 0 0 -5`, and so on), which makes every expected label a build-time constant that `tests/02-time-labels.spec.js` asserts byte for byte, offline or online, on any machine in any timezone -- the UTC frame matters because the ladder counts UTC calendar days, and a local-zone derivation crossing a DST transition would move a probe's day count by one. The probe matrix is uniform across the three modules and crosses every ladder boundary (29/30 days, 364/365 days, unparseable and empty inputs, a malformed input under the `date` mode). The `now`-input probes are the discriminating ones: an hours-based ladder answers "just now" where the calendar-day ladder answers "today", so a regression to sub-day phrasing fails exactly there. Beside the matrix sit the rendered-element probes (each module's meta-item partial under `date` and `none`, plus arxiv-paper's unrevised case) and the variant probes: each time-bearing variant rendered from a synthetic data dict, which is the only execution of the hf-space and arxiv-paper hero templates anywhere in this repository and the only deterministic proof that a variant reads the display mode under the key its entry template merges. The same spec asserts both shipped languages of each module carry the calendar-day i18n vocabulary (`*_today`, `*_yesterday` and the `*_ago` plural tables with the full CLDR category set per language), none of the retired sub-day keys, and -- for arxiv-paper -- the full UI-label key set its README's Localization claim depends on.

## What this suite does NOT catch

Worth stating plainly, because the gap is not obvious and was measured rather than assumed.

Hugo resolves `partial` calls at EXECUTION time, not at parse time. A call to a partial that does not exist, placed in a branch this fixture never enters, builds and passes: it was verified by inserting exactly that into `arxiv-paper`'s citation branch, which needs enrichment the fixture does not configure. What a build does catch anywhere in a template, executed or not, is a **parse** error -- an unbalanced action fails the build immediately, which was verified the same way.

So this suite proves: every template parses, the paths the fixture exercises render, and what they emit carries the right identity. It does not prove that a conditional branch nobody enters is correct. Widening that means widening the fixture's parameter surface, one branch at a time.

## Fixture shape

One page invokes each module exactly **once**. That is deliberate for the fetching ones: three of them open a host-down circuit breaker on first failure, so a second call site in the same build takes a different code path and emits a different warning, which would make the assertions depend on render order.

The home page renders in two output formats, `html` and `markdown`. The second is what selects each module's `<name>.markdown.md` variant over its HTML entry template.

The home layout additionally carries the time-label probe elements described above. They call partials directly rather than invoking any shortcode a second time, and they fetch nothing, so the once-per-module rule and the warning set are untouched.

The fixture also carries a `[security.http] mediaTypes` entry for `application/atom+xml`, which `arxiv-paper` needs and which a module cannot ship because Hugo resolves security policy from the site configuration alone. The pattern is deliberately unanchored at the end: the response carries a `; charset=utf-8` suffix that a trailing `$` defeats.

`timeout = '300s'` is set well above Hugo's 60-second default. Three of these modules budget around 30 seconds per fetch attempt, and a black-holed network -- a host that neither resolves quickly nor refuses, which is what restricted CI egress looks like -- burns that budget before degrading. At the default the page dies with `timed out rendering the page`, a hard build failure that graceful degradation cannot rescue.
