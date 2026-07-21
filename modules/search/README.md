# search

Fully client-side, privacy-preserving site search for any Hugo v0.160.0+ site: the module emits a per-language JSON index at build time through a custom output format, and a vendored [MiniSearch](https://github.com/lucaong/minisearch) engine searches it entirely in the visitor's browser -- no external service, no post-build indexer, no consumer `npm install`, no telemetry, zero third-party contact. Everything happens at build time or on the visitor's device.

The module emits semantic HTML with [BEM](https://getbem.com/) class hooks and `data-*` attributes and ships **zero CSS** -- no stylesheets, no colors, no dark-mode rules -- so the consuming site owns every visual decision. Three surfaces share one search core: a dedicated search page (a real GET form that works without JavaScript), a command-palette modal (Ctrl/Cmd+K, built on the native `<dialog>` element), and an inline dropdown. English and Russian are first-class: language-aware Snowball stemming, `ё`/`е` folding, typo tolerance, prefix matching, and BM25 field-weighted ranking are applied symmetrically to indexing and querying, so `модуля` finds `модуль` and `running` finds `runs`.

## Installation

Step 1 -- add the module to your site's Hugo configuration:

```toml
[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/search"
```

Step 2 -- fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/search
```

Step 3 -- wire the `searchindex` output format to the home page. This is the one irreducible wiring step: Hugo does not merge `outputs` lists from module configuration, so the module cannot do it for you. Two paths:

**Path A (site config; recommended for multilingual sites).** The edit is ADDITIVE: add `searchindex` to your EXISTING `[outputs]` home list. The config list replaces your entire home list -- not just the defaults -- so keep `html`, `rss`, and every other format you already wire there (for example a web app manifest):

```toml
[outputs]
  # Keep every format your site already wires here and append searchindex.
  home = ['html', 'rss', 'searchindex']
```

**Path B (front matter on the home page's `content/_index.md`).** This APPENDS to the defaults, so it cannot accidentally drop `html`. Front matter is per-file per-language: a multilingual site MUST repeat this on EVERY language's home file (for example `content/_index.ru.md`), or that language's index never emits and its surfaces warn and degrade -- multilingual sites should prefer Path A, which covers all languages at once:

```yaml
outputs:
  - searchindex
```

Step 4 -- verify: run `hugo` and check that `public/searchindex.json` exists (and `public/ru/searchindex.json` for a Russian language tree). Confirm module resolution with `hugo mod graph`.

**Template lookup precedence:** a file with the same path in your site overrides the module's version. The intended override points are `layouts/_partials/search/*.html` (for example `search/result-template.html`, `search/noscript.html`, `search/icon.html`), `layouts/_shortcodes/search.html`, and `layouts/home.searchindex.json`. If you shadow `search/assets.html`, keep the `js.Build` target at its default (`esnext`) or at `es2022`+: the vendored stemmers use ES2022 private class fields. If you shadow the modal surface's inner layout, keep the `.search__input` and `.search__listbox` inside the `<dialog>` -- an open modal makes everything outside it inert, so the script refuses a dialog whose typing or results surface sits outside (the trigger stays hidden); the inert `<template data-search-template>` may sit anywhere inside the surface root.

For local development against a checkout of this repository, use a `hugo.work` workspace or a `go.mod` `require` plus `replace` in your consuming site. Config-level `[module.replacements]` does NOT work for this module: Hugo's collector does not run Go resolution for a replaced module's own imports, so the vendored MiniSearch mount never resolves that way.

Troubleshooting: if surfaces warn that the index is not wired even though you completed Step 3, check the import for `ignoreConfig = true` -- it suppresses the module's whole `hugo.toml`, including the output-format definition and the vendor mount. Diagnose with `hugo config | grep -i searchindex`. If the index file is missing with no warning, check `disableKinds` for `home` (the index is a home-page output) and inspect template resolution with `hugo build --logLevel debug`.

### Content Security Policy

Under a granular CSP the module needs exactly this directive set: `script-src 'self'` (covers the fingerprinted module script AND the dynamic `import()` fallback), `worker-src 'self'` (browsers resolve workers through the `worker-src` -> `child-src` -> `script-src` fallback chain), `connect-src 'self'` (the index `fetch` -- a site whose `connect-src` is an explicit API-endpoint allow-list otherwise gets a permanently erroring search), and `img-src 'self'` plus any external thumbnail origins when `show_image` is on. The module defaults require NO `'unsafe-inline'` for scripts and NO `blob:`; only the consumer-side `blob:` worker wrapper described under Performance additionally needs `worker-src blob:`. A `style-src`/`style-src-attr` policy without `'unsafe-inline'` blocks the dual-hidden controls' inline `display:none` with console violations while the `hidden` attribute still applies -- functionally harmless, and exactly why the dual mechanism exists.

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+ (any edition)
- [Go](https://go.dev/) 1.22+

## Usage

The dedicated search page is the mandatory baseline: create `content/search.md` (and `content/search.ru.md` or that language's equivalent for every language) and place the shortcode on it:

```text
{{</* search */>}}
```

The equivalent partial forms, for layouts:

```go-html-template
{{ partial "search/page.html" . }}
{{ partial "search/modal.html" . }}
{{ partial "search/inline.html" . }}
```

The dot MUST be the current Page; passing anything else is the module's single build-failing error. For call-site overrides, pass an options dict whose `page` key is the current Page:

```go-html-template
{{ partial "search/page.html" (dict "page" . "autofocus" true) }}
```

The command-palette modal belongs in a layout (typically the header); it renders a JavaScript-revealed trigger button plus a native `<dialog>` and opens on the configured hotkey (`mod+k` by default). Every placement emits its own trigger and dialog -- a server-side once-per-page sentinel would strip the dialog from paginated outputs (`/page/2/` and beyond), because Hugo re-renders the same list page per pager; at enhancement time the script keeps the first dialog as the page's single shared palette, detaches the redundant closed ones (invisible until then, since a closed `<dialog>` has no rendering, and stashed so a later swap can restore one), and every trigger opens that shared palette. Triggers reveal only once an owner exists -- and hide again if a swap later leaves no electable dialog -- so a page whose only dialog is structurally broken (a malformed shadowed template) never shows a trigger that cannot open anything. After a DOM swap removes the owning root, dispatching `search:rescan` revives the palette through a swapped-in replacement root, by re-adopting a re-inserted former owner (a host cache restore that brings the same nodes back; a dialog that was open at swap time is closed back to the baseline), or by restoring a stashed dialog on a surviving trigger-only placement -- re-adoption outranks the stash, so the fully wired controller wins and the stash cannot restore a second dialog beside it (a non-winning former owner deliberately keeps its in-place closed dialog, staying re-adoptable later); the document-level trigger delegation and hotkey listeners are singletons that resolve the current owner at event time, so repeated swaps never accumulate listeners. A placement whose wired dialog is later gutted in place -- its input or listbox detached or moved out by a sanitizer or morphing library -- is torn down rather than served broken: the dialog is closed (keeping `search--open` and `search:close` consistent) and removed, and that root becomes permanently inert, exactly like a placement whose dialog failed the structural check at enhancement; anything a host restores into such a root goes unserved (a restored dialog carrying a stray `open` attribute is closed back to the closed baseline on the next rescan -- beside a healthy owner's dialog too -- and re-inserting the module's own torn-down dialog node dispatches a truthful `search:close` from its still-attached listener each time it is closed), and only swapping in a fresh, never-enhanced replacement root revives the placement. The modal machinery addresses only real same-realm `<dialog>` elements: a non-dialog element wearing the `search__dialog` class -- whatever namespace or realm it comes from -- is invisible to wiring and recovery alike, so it can neither be served nor break either of them, and wiring elects the first real dialog past any such impostor; what the host inserts, the host renders and owns. The inline dropdown is the opt-in third surface for a layout or content. Shortcode forms: `{{</* search modal */>}}` and `{{</* search surface="inline" */>}}`.

Every surface renders a real `<form method="get">` targeting the dedicated search page, so a no-JavaScript submission always navigates to `/search/?q=...` with the query intact. If you place the modal or inline surface but never create the search page, the build warns once per language and every search-page link falls back to `page_path` resolved for that language, so a later-created page starts working with no template change.

## The search index

The index template emits one envelope per language (`/searchindex.json`, `/ru/searchindex.json`) with this shape:

```json
{
  "schemaVersion": 1,
  "lang": "en",
  "generated": "2026-07-10T12:00:00Z",
  "docCount": 79,
  "digest": "8d9bb85f86b9ee73",
  "docs": []
}
```

`schemaVersion` is the compatibility contract between the emitted index and the module script: the client validates it and degrades predictably on a mismatch (skewed deploys), and it reserves headroom for future shape evolution such as sharding. `digest` is a content hash of the serialized records; the client-side cache key requires it because the index URL is stable rather than fingerprinted. All fields are DATA ONLY -- no pre-rendered HTML ever enters the index -- and the envelope must not be inlined into a `<script>` tag as-is (it is serialized without HTML escaping, which is safe only for a standalone `.json` file).

Each record carries: `href` (the page's relative permalink; also the engine's document id), `title`, `section` and `sectionTitle` (grouping key and label), `date` (`YYYY-MM-DD`, omitted when the page has none), `description`, `summary` (truncated to `summary_max_length`), `keywords` (extra matching terms: front matter `search.keywords` when present, else the standard `keywords` front matter), one array per configured taxonomy (`tags`, `categories` by default), `content` (indexed body text, truncated to `content_max_length`; never stored client-side), `image` (only when `show_image` is enabled at the defaults or site tier), and `headings` (sub-records with `id`/`level`/`title`, only when `headings = true`).

Inclusion rules, in order: the index ranges over regular pages only (sections, taxonomy pages, and the home page are structurally absent, and drafts, future, and expired pages never reach normal builds); the `sections` allow-list filters case-insensitively at path-segment boundaries (`docs` never matches `docs-internal`, and `docs/guides` never matches `docs/guides-old`); front matter `search: false` or `search.exclude: true` removes a page; the dedicated search page itself (resolved from `page_path`) is dropped so its own UI text never surfaces as a result; and a page whose front matter `robots` contains `noindex` is dropped too -- a page hidden from crawlers should not surface in site search. The last two rules are overridable per page by explicitly setting `search.exclude: false`. A structural alternative: front matter `build.list: never` (or `local`) removes a page from ALL site collections including this index. Records also dedupe by permalink: `href` is the engine's document id and duplicate ids would break client-side search, so when two pages resolve to the same permalink (colliding `url` front matter) the first record wins and the collision warns once per build.

Warnings worth knowing: `hugo server -D` indexes drafts locally; `disableKinds = ['home']` silently kills the home-wired index; taxonomy, term, and section pages are deliberately not indexed.

## Language handling

Every term -- at indexing time and at query time, symmetrically -- runs through the same pipeline: Unicode NFC normalization, lowercasing, `ё` -> `е` folding, a conservative per-language stopword check (~25 pure function words per language; disable with `stopwords = false`, extend with `stopwords_extra`), and language-aware stemming: Cyrillic terms go to the Russian Snowball stemmer, Latin terms (after diacritics folding, so `café` matches `cafe`) to the English Porter2 stemmer, and everything else passes through normalized. Terms shorter than 3 characters skip stemming. Because folding is symmetric and single-valued, exact-diacritic forms cannot receive a rank preference -- results are correct, only the preference is absent.

Stemming is what makes Russian search work: Russian endings REPLACE letters, so prefix matching cannot bridge inflection (`модуля` shares only a prefix-free stem with `модуль`). The known ceiling of all suffix-stripping stemmers applies: stem alternations such as `искать`/`ищет` remain unmatched. Keep `fuzzy` a typo knob, never a morphology substitute -- raising it much beyond the default more than doubles off-lemma Cyrillic noise.

The vendored stemmers are generated artifacts from the [Snowball project](https://snowballstem.org/) (BSD-3-Clause; see `assets/snowball/COPYING`), produced with the Snowball compiler (for example `snowball russian.sbl -js -o russian-stemmer`); regenerate from the upstream `.sbl` sources rather than editing them. The MiniSearch engine (MIT) is vendored by mounting the upstream TypeScript sources as Hugo assets pinned to a tagged release in `go.mod`; the mount assumes the upstream `src/` layout stays stable, so smoke-test the fixture build after any version bump.

## Performance and limits

The index is monolithic per language, fetched lazily (never on general page load: intent -- focus, hover, hotkey -- gates the fetch everywhere except the dedicated search page, which prefetches when the browser is idle). Synthetic-corpus measurements (real corpora with less uniform vocabularies can come in 20-40 percent heavier, so treat these as ranges, not commitments): around 100 pages the index is roughly 250-300 KB raw / 80-90 KB gzipped with a near-instant build; around 1,000 pages roughly 2.5-3 MB / 700-850 KB with an index build in the low hundreds of milliseconds; around 5,000 pages roughly 12-15 MB / 3.5-4.5 MB with a cold build approaching a second. Query latency is a non-issue at every size (single-digit milliseconds).

The index builds and queries in a module Web Worker by default (`worker = true`), so main-thread jank never enters the picture; when worker construction fails (old browsers, blocked CSP, cross-origin asset rewriting), the script transparently falls back to a dynamic `import()` of the same artifact on the main thread. Worker startup is bounded by a boot handshake that covers only script load and evaluation: once the worker acknowledges boot, the index fetch and build take as long as the network honestly needs, so a slow connection never triggers a mid-download fallback that would re-fetch the same index on the main thread. The post-boot phase is deliberately unbounded -- no deadline can tell a slow legitimate download from a hang -- so a stalled fetch is bounded by the browser's own network stack, whose eventual failure surfaces as a `fetch`-phase `search:error`; the accepted residuals, either of which leaves the surface loading, are a fetch a broken service worker parks forever and a hung Cache Storage read while serialized-index caching is active. `new Worker` requires same-origin: consumers rewriting asset URLs to a CDN origin must either keep the worker artifact same-origin or accept the main-thread fallback; a site-side `blob:` wrapper is the escape hatch (it additionally requires `worker-src blob:` in the CSP). The designed-for ceiling is roughly 5,000 pages with the worker; heading sub-records (`headings = true`) raise index size around 1.4x and lower that ceiling accordingly, which is why they are opt-in.

Serialized-index caching (`cache = "auto"`) persists the BUILT index in Cache Storage once the payload is large enough to pay off (several-fold faster warm starts on large sites; pure overhead below the `auto` threshold of roughly five hundred pages or a 1.5 MB index), keyed by a compound discriminator of the envelope digest, the engine version, and the index-shaping options, so any change invalidates cleanly. The write happens after the ready reply, off the critical path, so serializing and persisting a large index never delays first results -- a write that never lands merely costs one rebuild on the next visit. The envelope itself is fetched on every initialization: serve `searchindex.json` with revalidation caching (`Cache-Control: no-cache` or a short max-age) so deploys propagate promptly. A fingerprinted-asset route (`resources.ExecuteAsTemplate` plus `fingerprint`) is a legitimate consumer-side alternative for immutable caching. `minifyOutput = true` also minifies the JSON output.

## Configuration

Four tiers, lowest to highest precedence: the shipped `data/search/defaults.toml`, site `[params.search]`, page front matter `search:` (a map), and call-site arguments on the partial or shortcode. PRESENCE wins at every tier, so an explicit `false` or empty value overrides the tier below it. Values are shape-tolerant: list keys accept a slice or a comma-separated string, booleans accept `true`/`1`/`yes`/`on` and their negatives, and `boost` maps merge across tiers so overriding one field keeps the shipped weights for the rest.

Scope notes: the emitted index is site-wide, so INDEX-TIME keys are resolved from the defaults and site tiers only; all surfaces on a page share ONE client-side backend and one built index, so the BACKEND-SCOPED keys (`stemming`, `stopwords`, `stopwords_extra`, `worker`, `cache`) are likewise site-tier-only. Everything a surface may legitimately vary -- the per-query engine options (`fuzzy`, `prefix`, `boost`), the limits and input behavior, and the display toggles -- remains overridable at the page and call-site tiers.

Kill switches: site `params.search.enable = false` disables every surface AND empties the index (the envelope still emits, so the wired URL never 404s). Page front matter `search.disable: true` suppresses surface rendering on that page, while `search: false` (or `search.exclude: true`) removes the page from the index -- two distinct switches: one hides the UI, the other hides the page.

## Parameters

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `sections` | list or CSV | `[]` | Sections to index: top-level names or nested path prefixes like `docs/guides`; `docs`, `/docs`, and `docs/` all work, and matching is case-insensitive (entries are lowercased to match Hugo's lowercase page paths). Empty indexes ALL regular pages. The sentinel `["mainSections"]` scopes to `site.MainSections`. INDEX-TIME. |
| `taxonomies` | list or CSV | `["tags", "categories"]` | Taxonomies serialized into records and matched during search; every listed taxonomy becomes a search field and accepts a `boost.<name>` key. Only `tags` and `categories` have display slots; other listed taxonomies match but are not displayed. A taxonomy named like a reserved record field (`href`, `title`, `section`, `sectionTitle`, `date`, `description`, `summary`, `keywords`, `content`, `image`, `headings` -- matched case-insensitively) is skipped with a warning, because serializing it would clobber that field. INDEX-TIME. |
| `content` | string | `"full"` | Body strategy: `full` (plain text, truncated), `summary`, or `none`. INDEX-TIME. |
| `content_max_length` | int | `8000` | Character bound for indexed body text; `0` = unlimited. INDEX-TIME. |
| `summary_max_length` | int | `240` | Character bound for the stored result summary. INDEX-TIME. |
| `strip_code_blocks` | bool | `true` | Remove fenced/indented code blocks from indexed body text. INDEX-TIME. |
| `headings` | bool | `false` | Emit heading sub-records (anchor deep links); raises index size ~1.4x. INDEX-TIME. |
| `headings_max_level` | int | `3` | Deepest heading level emitted (`2` = h2 only). INDEX-TIME. |
| `min_query_length` | int | `2` | Minimum query length before a search runs. |
| `debounce_ms` | int | `220` | Search-as-you-type debounce; clearing the input never waits for it. |
| `fuzzy` | float | `0.15` | Typo tolerance as a fraction of term length; `0` disables. |
| `prefix` | bool | `true` | Prefix-match the final query term. |
| `stemming` | bool | `true` | Language-aware stemming (en Porter2 + ru Snowball), symmetric. BACKEND-SCOPED. |
| `stopwords` | bool | `true` | Apply the built-in per-language stopword lists. BACKEND-SCOPED. |
| `stopwords_extra` | list or CSV | `[]` | Extra stopwords, added to the built-ins. BACKEND-SCOPED. |
| `boost.*` | floats | title 5, headings 3, description 2, keywords 2, tags 1.5, content 1 | Per-field BM25 relevance weights; dotted keys, merged across tiers. |
| `show_description` | bool | `true` | Show each result's description/summary line. |
| `show_image` | bool | `false` | Show result thumbnails; also INDEX-TIME (the image field is emitted only when enabled at the defaults or site tier). |
| `show_tags` | bool | `false` | Show each result's tags. |
| `show_categories` | bool | `false` | Show each result's categories. |
| `show_dates` | bool | `true` | Show each result's date as a `<time datetime>` element. |
| `group_by_section` | bool | `false` | Group page-surface results by section, labeled with the section title. |
| `count_pad` | int | `1` | Minimum digit width of the group count element's text (`2` renders a three-hit group as `03`), clamped to 1-10; `data-search-count` always carries the bare number. |
| `page_path` | string | `"/search"` | Path of the consumer-created search page, resolved per language. |
| `results_limit` | int | `8` | Results shown in the modal and inline dropdowns before "see all results". |
| `page_size` | int | `10` | Results per "show more" chunk on the dedicated page. |
| `hotkey` | string | `"mod+k"` | Modal toggle hotkey: modifiers from `mod`/`ctrl`/`alt`/`shift` joined with `+`, ending in one key (`mod` = Ctrl on Windows/Linux, Cmd on macOS). Empty disables; an unparseable value warns once and disables. A hotkey with no non-typing modifier (none of `mod`/`ctrl`/`alt` -- a bare `k`, or shift-only) is suppressed while typing in any field, like `hotkey_slash`, so it cannot eat ordinary keystrokes or close the palette from its own input. |
| `hotkey_slash` | bool | `false` | Also open the modal on `/` (suppressed while typing in any field). |
| `worker` | bool | `true` | Build and query the index in a Web Worker (automatic main-thread fallback). BACKEND-SCOPED. |
| `cache` | string or bool | `"auto"` | Serialized-index Cache Storage persistence: `"auto"`, `true`, or `false`. BACKEND-SCOPED. |
| `enable` | bool | `true` | Master switch: `false` disables every surface and empties the index. Site tier only. |

Page-only front matter keys (no site-wide default): `search: false` or `search.exclude: true` (indexing opt-out), `search.keywords: [...]` (extra author-supplied matching terms, never displayed; when absent, the standard `keywords` front matter feeds the same boosted field, and an explicitly empty `search.keywords: []` is a presence-wins override like every tier of the cascade, suppressing that fallback so the page matches on no keywords at all), `search.disable: true` (per-page surface-rendering opt-out).

Call-site-only keys on the partials and the shortcode: `class` (appended to the root element's class list), `id` (root element id; also seeds the derived input/listbox ids), `placeholder` (input placeholder), `aria_label` (accessible name of the modal dialog, or of the listbox/results container on the other surfaces), `heading` (renders an `<h2 class="search__heading">` before the form; none by default), `autofocus` (page surface only). The shortcode takes `surface` as its one positional parameter: `page` (default), `modal`, or `inline`.

### Validation

Every misconfiguration warns once per build (deduplicated; under Hugo's parallel page rendering, a warning that embeds per-caller context can rarely surface more than once) or degrades: a non-map `params.search` or `search:` front matter value is ignored with a warning (except the bare `search: false` opt-out shorthand), malformed numbers fall back to the shipped defaults, an unknown shortcode surface renders the page surface, an unparseable hotkey disables the hotkey, a taxonomy named like a reserved record field is skipped, an unwired output format renders the page surface's form but no modal, no inline surface, and no scripts, and a missing search page warns per language while every link falls back to the configured path. The single build-failing error is calling an entry partial with something other than a Page -- a wiring mistake, not a content problem.

## CustomEvents reference

All events bubble from the surface root; none carries personal data beyond the query the visitor typed locally. They exist so a consuming site can observe activity without any tracker.

| Event | Detail payload | Fires when |
| --- | --- | --- |
| `search:ready` | `{docCount, lang, source}` | The shared backend finished building the index; `docCount` is the engine's own count of searchable records (heading sub-records included when `headings = true`, client-side duplicate skips excluded -- never the envelope's self-reported `docCount` field); `source` is `"cache"` or `"network"` (the index-build source, not the transfer source). |
| `search:open` | `{surface}` | The modal opened. |
| `search:close` | `{surface}` | The modal closed. |
| `search:query` | `{query, surface}` | A query was sent to the backend. |
| `search:results` | `{query, count, surface}` | Results were rendered; `count` is the total match count. |
| `search:select` | `{href, query, surface}` | A result was activated in a listbox surface. |
| `search:error` | `{phase, message}` | Initialization or a query failed; `phase` is one of `fetch`, `schema`, `build`, `query` (cache read and write failures never surface -- the index silently rebuilds instead). |

Inbound: dispatching `search:rescan` on `document` re-runs initialization for late-inserted roots (PJAX/Turbo swaps, AJAX-loaded content). A rescan also re-adopts a reattached page-surface root: a navigation event or another registration occurring while the root sits outside the document drops its `?q=` synchronization (back/forward navigation against a detached root would otherwise drive stale nodes), and the rescan re-registers the same root's sync and reconciles it with the current URL -- a query navigated to while the root was detached is applied at re-adoption rather than waiting for the next navigation -- mirroring the modal's former-owner re-adoption.

## Accessibility

The dedicated page is deliberately simple: a labeled `type="search"` input, a named results region (`role="region"` with an accessible name, because a bare `div` may not carry one) of ordinary links (grouped under real `<h2>` headings when grouping is on), and a load-more button that keeps focus while appended results are announced. The modal and inline surfaces implement the combobox pattern: `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, and `aria-activedescendant` tracking a `role="listbox"` of `role="option"` items -- DOM focus never leaves the input while arrowing through options, and the active option carries `aria-selected="true"`.

Each surface root is a `<search>` element carrying an explicit `role="search"` -- redundant where the element is mapped natively and the landmark fallback for assistive technology stacks that predate it; the form inside carries no role of its own, so the landmark is never announced twice.

The modal is a native `<dialog>` opened with `showModal()`, so focus containment, background inertness, Escape handling, and focus return to the invoker come from the platform. On engines that predate `<dialog>` the modal is never wired -- its root still carries the `search--enhanced` marker, but no controller exists, its trigger stays hidden, and the server GET form remains the baseline -- while the page and inline surfaces enhance normally. Escape is two-stage: the first press with a non-empty query clears it, the second closes. Result counts are announced through a polite `role="status"` region, debounced so rapid typing does not spam the queue; zero results and errors use the assertive `role="alert"` region. Count announcements decline correctly per language: the script selects among the four `search_count_one`/`few`/`many`/`other` i18n strings with `Intl.PluralRules` for the surface language and substitutes `%d` client-side (so Russian counts pick the right case), while the minimum-length hint resolves its CLDR plural server-side through Hugo's i18n with the configured minimum; a consumer language needing different count strings overrides those i18n keys the ordinary Hugo way. Every control has real visible text (never `aria-label`-only); icon-only presentation belongs to the consumer via the visually-hidden pattern under Styling. The module ships zero animation and never requests smooth scrolling; consumer transitions belong behind their own `prefers-reduced-motion` guards.

## Privacy

The invariant, concretely: all assets are same-origin, the index is fetched from your own site, no query ever leaves the browser, and there is no telemetry of any kind. The CustomEvents exist for consumer-side observation without trackers.

One consumer-side pattern trades this invariant away: replacing the `<noscript>` guidance (by shadowing `layouts/_partials/search/noscript.html`) with a GET form submitting to an external search engine scoped to your site. That is STRICTLY opt-in, never the default, implemented entirely site-side, and it sends the visitor's query to a third party -- label it as such for your visitors. Similarly, when `show_image` is on and your records reference external thumbnail origins, referencing those origins at all is your privacy decision.

## Styling

The module ships zero CSS. Server-rendered surface roots carry `search` plus one modifier: `search--page`, `search--modal`, `search--inline`. The one functional-CSS exception: JavaScript-only controls (the clear button, the load-more button, the modal trigger, the see-all link, the inline listbox) are hidden with BOTH the `hidden` attribute AND an inline `display:none`, because the attribute alone loses to ordinary consumer display rules; the script clears both on reveal.

JS-injected classes -- flagged here because Tailwind-style tree-shaking never sees them in server HTML; safelist them via `hugo_stats.json` or your framework's equivalent: `search--enhanced`, `search--open`, `search--loading`, `search--has-results`, `search--no-results`, `search--error`, `search__option--active`, `search__mark`, plus the JS-created structural classes `search__list`, `search__group`, `search__group-title`, `search__group-count`, `search__option`, `search__result-tag`, `search__result-tag-separator`, `search__result-category`, and `search__result-category-separator`.

Taxonomy slots are filled with one child element per term -- `search__result-tag` / `search__result-category` -- so each term is an addressable hook for chip-style presentation, with every `", "` separator in its own `search__result-tag-separator` / `search__result-category-separator` element a consumer can hide; unstyled, the slot still reads `a, b, c`. A shadowed result template may use a `<ul>`/`<ol>` for either slot: list slots get `<li>` children and no separator elements. When `group_by_section` is on, each JS-created `.search__group` block carries `data-search-section` (the group's section key; empty for root pages) and `data-search-count` -- the number of results currently rendered in the group, which grows as "show more" reveals further chunks -- so per-section accents and group counts are pure CSS on the consumer side. A `span.search__group-count` element carrying the same count as text -- zero-padded to `count_pad` digits, so a two-digit kicker count needs no consumer CSS -- rides beside the group heading; a heading-less root-page group gets the data attributes only, so it never leads with a bare, contextless number.

Element hooks: `search__form`, `search__label` (and `search__label--hidden-hook` on the modal's label for visually-hidden styling), `search__input`, `search__submit`, `search__submit-icon`, `search__submit-label`, `search__clear`, `search__clear-icon`, `search__clear-label`, `search__trigger`, `search__trigger-icon`, `search__trigger-label`, `search__kbd`, `search__dialog`, `search__close`, `search__close-icon`, `search__close-label`, `search__status`, `search__alert`, `search__results`, `search__listbox`, `search__more`, `search__see-all`, `search__hints`, `search__hint`, `search__hint-label`, `search__heading`, `search__noscript`, `search__noscript-text`, and the per-result skeleton `search__result`, `search__result-link`, `search__result-title`, `search__result-section`, `search__result-snippet`, `search__result-date`, `search__result-tags`, `search__result-categories`, `search__result-image`.

The visually-hidden clip pattern for icon-only presentation of the labeled controls:

```css
.search__submit-label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

`data-*` reference (on each surface root): `data-search-surface`, `data-search-index-url`, `data-search-lang`, `data-search-page-url`, `data-search-worker-url`, `data-search-min-length`, `data-search-debounce`, `data-search-options` (one JSON-serialized object carrying the structured configuration), the `data-search-show-*` display toggles (each attribute is present only when its toggle resolves true, so match on presence, never on a `"false"` value), the `data-search-i18n-*` strings the script writes at runtime, plus per surface `data-search-page-size`, `data-search-count-pad`, and `data-search-group-by-section` (page surface only; the last present only when grouping is on) or `data-search-limit` (modal, inline) and the modal's `data-search-hotkey` and `data-search-hotkey-slash`. Inside the modal trigger, `data-search-kbd="mod"` marks the platform-modifier `<kbd>` hint whose text the script rewrites to `⌘` on Apple platforms. Result markup is shadowable as one `<template data-search-template>` via `layouts/_partials/search/result-template.html`: the script clones it per result and fills the `data-search-slot` elements with text only, so consumers restyle result markup for every surface at once; unknown extra elements in a shadowed template are preserved untouched.

### Icons

Shipped glyphs: `search` and `close` -- inline SVGs using `stroke="currentColor"`, `width="1em" height="1em"`, `aria-hidden="true"`, and `focusable="false"`, so they inherit the consumer's text color and font size. Shadow `layouts/_partials/search/icon.html` to replace them.

## Validation

The Playwright suite under [`test/`](test/) validates the module against the multilingual fixture site in `test/fixture` (index shape and filters, the no-JavaScript baseline, enhancement and lazy loading, English and Russian recall, the modal and inline keyboard models, live regions, XSS robustness, caching, and the event contract); see [`test/README.md`](test/README.md) for how to run it. Repository CI verifies `go.mod` parsing, the standalone `hugo mod graph`, and the lint suite; the Playwright suite runs locally.

## Module Structure

```text
modules/search/
├── go.mod                              # module path + pinned MiniSearch upstream
├── go.sum                              # checksum pin for the vendored MiniSearch upstream
├── hugo.toml                           # searchindex output format + vendor mount
├── README.md
├── assets/
│   ├── js/
│   │   ├── search.js                   # page-side entry (ESM)
│   │   ├── search-worker.js            # backend entry (ESM, dual-mode: worker + main thread)
│   │   └── search/
│   │       ├── pipeline.js             # normalization, stopwords, symmetric processTerm
│   │       ├── engine.js               # thin MiniSearch adapter (the only 'minisearch' import)
│   │       ├── highlight.js            # text-node-splitting <mark> highlighter
│   │       ├── render.js               # template cloning + textContent-only slot filling
│   │       └── url-state.js            # ?q= read/replaceState/popstate/pageshow round-trip
│   └── snowball/                       # vendored Snowball stemmers (BSD-3-Clause)
│       ├── COPYING
│       ├── base-stemmer.js
│       ├── english-stemmer.js
│       └── russian-stemmer.js
├── data/
│   └── search/
│       └── defaults.toml               # consumer-facing defaults (tier 1 of the cascade)
├── i18n/
│   ├── en.toml
│   └── ru.toml
├── layouts/
│   ├── home.searchindex.json           # the per-language index template
│   ├── _shortcodes/
│   │   └── search.html
│   └── _partials/
│       └── search/
│           ├── page.html               # PUBLIC ENTRY: dedicated page surface
│           ├── modal.html              # PUBLIC ENTRY: command-palette modal
│           ├── inline.html             # PUBLIC ENTRY: inline dropdown
│           ├── form.html               # shared form fragment
│           ├── results.html            # live regions + results container + template
│           ├── result-template.html    # shadowable per-result skeleton
│           ├── assets.html             # script emission (per placement)
│           ├── config.html             # four-tier cascade resolver
│           ├── icon.html               # inline SVG glyphs
│           ├── noscript.html           # shadowable no-JavaScript guidance
│           └── lib/
│               ├── warn.html           # deduplicated warning funnel
│               ├── guard.html          # config-shape guard
│               ├── record.html         # per-page index record builder
│               └── headings.html       # heading-tree walker
└── test/                               # Playwright suite + fixture (see test/README.md)
```
