# arxiv-paper

Hugo shortcode module that renders an [arXiv.org](https://arxiv.org/) paper reference in one of six display variants. The module outputs style-agnostic semantic HTML with [BEM](https://getbem.com/) CSS class hooks, delegating all visual styling to the consuming site. It is a sibling of [`shortcodes/github-repo`](../github-repo/README.md) and [`shortcodes/hf-space`](../hf-space/README.md) and follows the same conventions (build-time API fetch, header-aware retries, graceful degradation, data-driven lookups), acting as a single data provider that feeds any number of card designs.

## Installation

Import the module in your site's Hugo configuration:

```toml
# hugo.toml

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/shortcodes/arxiv-paper'
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/shortcodes/arxiv-paper
```

**Important -- template lookup precedence:** If your site already has a file at `layouts/_shortcodes/arxiv-paper.html`, Hugo will use the local file instead of the module's shortcode. You must delete the local file for the module to take effect.

### Allow the arXiv media type (required)

The arXiv API responds with `Content-Type: application/atom+xml`, which is **not** in Hugo's default remote-fetch allow-list. Add it to your site's security policy so `resources.GetRemote` can fetch the feed:

```toml
# hugo.toml (consuming site)

[security.http]
  mediaTypes = ['^application/atom\+xml']
```

This entry is **additive** -- it does not restrict the `application/json` responses that other modules (such as `github-repo` and `hf-space`) rely on, so the three can coexist. The pattern is intentionally **unanchored**: the `; charset=utf-8` suffix on the response defeats a trailing `$`.

Hugo does not merge security configuration from modules, so this one line must live in the consuming site's own config. If it is missing the module does **not** break your build -- it emits a single warning naming this exact fix and renders every card as the degraded inline chip (see [Graceful Degradation](#graceful-degradation)).

## Requirements

- Hugo v0.160.0+ (extended edition)
- Go 1.22+
- The `security.http.mediaTypes` allow-list entry above (consuming site)

## Usage

```go-html-template
{{< arxiv-paper id="2512.24601" >}}
```

The `id` is the arXiv identifier: the modern scheme `2512.24601` (optionally versioned, `2512.24601v2`) or the pre-2007 scheme `hep-th/9901001`. You may pass a full URL via `url` instead (abstract, PDF, or HTML form).

### Variants

The `variant` parameter selects one of six display modes. Default is `card`.

#### inline -- Compact chip for running text

```go-html-template
{{< arxiv-paper id="2512.24601" variant="inline" >}}
```

A minimal `<a>` element showing the "arXiv" brand, the identifier, the title, and the primary subject. Suitable for embedding within paragraphs. Also the degraded fallback for every other variant when the API is unavailable.

#### card -- Editorial card (default)

```go-html-template
{{< arxiv-paper id="2512.24601" >}}
{{< arxiv-paper id="2512.24601" variant="card" >}}
```

A vertical card with an "arXiv / <subject>" eyebrow, title, truncated author list, abstract (or the TLDR when enriched), and a footer with the identifier, submitted year, venue, page/figure comment, and citation count (when enrichment supplied a nonzero count).

#### wide -- Subject-tile horizontal card

```go-html-template
{{< arxiv-paper id="2512.24601" variant="wide" >}}
```

A two-column card with a subject tile on the left (primary category code and broad group) and, on the right, the title, authors, abstract snippet, and a footer with the cross-list subject tags. Ideal for paper round-ups. arXiv papers carry no thumbnail image, so the tile is data-driven (color it per archive/group via the `data-arxiv-archive` hook).

#### stats -- Stats card with metrics strip

```go-html-template
{{< arxiv-paper id="2512.24601" variant="stats" >}}
```

A card with the header, abstract/TLDR, and a metrics strip. The strip leads with durable facts (submitted year, primary subject, author count, version) and appends the slow-drift counts -- citations, HF upvotes -- only when enrichment supplied a nonzero count.

#### hero -- Featured hero with banner

```go-html-template
{{< arxiv-paper id="2512.24601" variant="hero" >}}
```

The largest variant. A banner carrying the identifier and primary subject, followed by the full metadata (authors, TLDR, cross-list subject tags, submitted/revised dates, venue, citations, upvotes, a "code available" badge) and a "View on arXiv" call-to-action.

#### cite -- Copy-ready citation block

```go-html-template
{{< arxiv-paper id="2512.24601" variant="cite" >}}
```

A `<div>` (not a single click-through) rendering a formal reference -- authors, year, title, `arXiv:ID [subject]`, and the journal reference when present -- plus real links to the versioned abstract page, the PDF, the always-present arXiv DataCite DOI (`10.48550/arXiv.<id>`), and the published-version journal DOI when the author supplied one.

## Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string | yes\* | -- | arXiv identifier (`2512.24601`, `2512.24601v2`, or `hep-th/9901001`) |
| `url` | string | yes\* | -- | Full arXiv URL (abstract, PDF, or HTML form) |
| `variant` | string | no | `card` | Display variant: `inline`, `card`, `wide`, `stats`, `hero`, `cite` |
| `title` | string | no | API | Title override (defaults to the paper's title) |
| `abstract` | string | no | API | Abstract override (defaults to the summary) |
| `enrich` | string | no | site param | Enricher selection (see [Enrichment](#enrichment)) |
| `class` | string | no | -- | Additional CSS class(es) appended to the root element |

\* Provide either `id` or `url`. When both are given, `id` wins.

Validation:

- Omitting both `id` and `url` fails the build with an error message.
- Passing an invalid `variant` value fails the build with an error message.
- A locator from which no arXiv id can be parsed fails the build with an error message.

## Enrichment

The arXiv Atom API is the required spine and supplies every core field on its own -- title, authors, abstract, subjects, dates, links, comment, journal reference, and DOIs. Two optional enrichers add value on top, each fetched at build time and degrading independently back to arXiv-only data.

Select enrichers with the `enrich` parameter (comma-separated), or set a site-wide default via `params.arxiv_paper.enrich`; the shortcode parameter wins when both are present. The default is off (arXiv only).

| `enrich` value | Source | Adds |
| --- | --- | --- |
| `semantic-scholar` (or `s2`) | [Semantic Scholar](https://www.semanticscholar.org/product/api) | One-sentence TLDR, resolved publication venue, fields of study, citation count |
| `hf` | [Hugging Face Papers](https://huggingface.co/papers) | AI summary, keyword chips, linked code repository, HF upvotes, artifact counts |
| `all` | both | Everything above |

```go-html-template
{{< arxiv-paper id="2512.24601" variant="hero" enrich="all" >}}
```

```toml
# hugo.toml -- enable an enricher for every arxiv-paper on the site
[params.arxiv_paper]
enrich = "s2,hf"
```

### Authentication

Both enrichers work without a token, but a token is recommended for build-time batches.

- **Semantic Scholar** -- anonymous requests share a low rate limit and frequently return HTTP 429. Create a [free API key](https://www.semanticscholar.org/product/api#api-key-form) and set `HUGO_SEMANTIC_SCHOLAR_TOKEN`. When the enricher is enabled without a token the module emits one informational warning per build; papers still render from arXiv data.
- **Hugging Face Papers** -- public and needs no token; a `HUGO_HF_TOKEN` is used if present. Papers not indexed on HF Papers return HTTP 404, which is expected and degrades silently.

```bash
export HUGO_SEMANTIC_SCHOLAR_TOKEN="your_key_here"
hugo
```

The variables **must** be prefixed with `HUGO_`. Hugo's default security policy restricts `os.Getenv` to variables matching `^HUGO_` or `^CI$`. A variable named `SEMANTIC_SCHOLAR_TOKEN` (without the `HUGO_` prefix) will silently return an empty string.

The arXiv Atom API itself requires no token.

## Resilience and Retries

Each API call is wrapped in an outer retry loop with error classification, sitting in front of the graceful-degradation behavior described below. The constants are baked into `fetch.html` and are **not** exposed as shortcode parameters or site params; the intent is conservative resilience without configuration surface.

| Constant | Value | Purpose |
| --- | --- | --- |
| `attempts` | `5` (arXiv), `3` (enrichers) | Maximum outer attempts |
| `perAttemptTimeout` | `30s` (arXiv), `20s` (enrichers) | Per-request timeout passed to `resources.GetRemote` |
| `backoffSlackSec` | `10` | Reserved on top of the per-attempt timeout when deciding whether another attempt fits: Hugo retries the retryable statuses (408, 429, 500, 502, 503, 504) internally within each attempt, and its final backoff sleep (bounded under ten seconds) does not observe the request deadline, so such an attempt can run past its nominal timeout by up to that much |
| `overallBudgetSec` | `120` (arXiv), `60` (enrichers) | Wall-clock cap, in seconds. A hard ceiling: an attempt only starts while the remaining budget still fits a full per-attempt timeout plus the backoff slack, so even a boundary attempt against a persistently retryable-5xx host cannot overshoot the cap (gate arithmetic runs on a millisecond clock, so integer-second truncation cannot leak past it either) |

Each attempt uses a fresh cache key (`arxiv-paper:<id>:<endpoint>:attemptN`) so that a response cached as an error by Hugo's HTTP cache on a prior attempt does not poison subsequent attempts within the same build.

### Error class taxonomy

`classify-error.html` derives a structured `errorClass` from the failed response. Each class drives a different retry decision:

| `errorClass` | Trigger | Retry behavior |
| --- | --- | --- |
| `media-type-config` | Hugo cannot resolve the arXiv media type | Early break -- the consuming site is missing the `security.http.mediaTypes` entry; retrying cannot fix config. Warned once per build with the exact fix. |
| `auth` | HTTP 401 or 403 | Early break -- a token/permission issue cannot be fixed by retrying. |
| `not-found` | HTTP 404, or an empty / error Atom feed | Early break -- the paper is genuinely missing or not indexed. |
| `rate-limit` | HTTP 429 | Early break -- a rate-limit window cannot reset between immediate attempts. |
| `server` | HTTP 5xx | Retry up to `attempts` or the wall-clock budget. |
| `network` | No HTTP response (DNS failure, connection refused, host timeout) | Retry up to `attempts` or the wall-clock budget. |
| `parse` | 2xx response whose body is not a decodable document object (an array, blank, undecodable, null, or scalar body) | Early break -- a non-document body from these endpoints is deterministic, not transient. |

arXiv reports "not found" with an HTTP 200 body (an empty feed for a nonexistent id, or an error `entry` for a malformed id), so `parse-atom.html` inspects the feed shape rather than trusting the status code. On retry exhaustion the module emits a single structured `warnf` and falls through to graceful degradation. The build is never broken by an API failure.

### Host-down circuit breaker

When a fetch loop exhausts its attempts with NO attempt receiving any HTTP status code (every attempt ends `errorClass=network` with `statusCode=0` -- a DNS failure, an unreachable host, a black-holed connection), the module marks that API host unreachable for the rest of the build via a `hugo.Store` sentinel, one per host: `export.arxiv.org`, `api.semanticscholar.org`, and `huggingface.co` trip independently. Every later fetch loop against a tripped host -- any paper, any page -- degrades immediately instead of burning another wall-clock budget (the arXiv spine warns per call site; a skipped enricher folds into its existing once-per-build unavailability warn), so a full outage costs the build roughly one budget window per host instead of one per call site (concurrently rendered pages that started before the sentinel landed can each still pay an overlapping budget). A failure that surfaces WITH a status code -- a rate limit, an auth failure, a 404, or a non-retryable status such as 501 -- proves the host reachable, never trips the breaker, and keeps its own per-call-site retry budget. One nuance: Hugo retries the retryable statuses (408, 429, 500, 502, 503, 504) internally within each attempt's request window, so a host that answers ONLY with those for whole windows surfaces to the template as status-less no-response failures and trips the breaker exactly like a dark host -- the intended outcome for a host that never yields a usable response within the budget.

### Interplay with Hugo's render timeout

Hugo aborts any page whose render exceeds the site-level `timeout` setting (default `60s`), and every second this module spends fetching counts toward the clock of the page being rendered. Graceful degradation cannot rescue a page that is already out of render budget: a full arXiv outage costs the first fetching call site up to 120s on the spine (about 90s when every request window times out status-less, since the attempt reservation blocks a fourth window; the enrichers are then skipped, because they only run when the spine resolved a paper), while the true additive worst case -- a flaky-but-reachable spine that succeeds near its budget boundary combined with enricher hosts that exhaust their full 60s budgets (persistently answering with the statuses Hugo retries internally; a genuinely dark enricher host is cut off by the attempt reservation at roughly 40s) -- can reach roughly 240s on one call site. A site whose `timeout` is at or below those figures can fail its build with `timed out rendering the page` even though every widget degraded correctly. The circuit breakers bound the exposure to roughly one budget per host per build, but the page that pays those budgets still needs headroom. Give the consuming site comfortable margin above the worst case:

```toml
timeout = '300s'
```

## Graceful Degradation

When the arXiv fetch fails or resolves no paper, the module does not break the build. It logs the structured warning and degrades:

- **`inline` variant:** Renders the identifier parsed from the locator, linking to the arXiv abstract page; the title and metadata are omitted.
- **`card`, `wide`, `stats`, `hero`, `cite` variants:** Fall back to the inline chip layout. The root element carries `data-api-ok="false"` so the consuming site can style the degraded state.

Enrichers degrade **independently**: if Semantic Scholar or Hugging Face is unavailable, the card still renders fully from arXiv data, just without the TLDR / venue / citation / upvote fields. Enricher warnings are deduplicated to one per build.

## Data Files

The module ships two data files used to resolve objective arXiv codes to display values. Both are flat JSON maps, looked up via `index hugo.Data.<file>` and exposed as normalized fields.

### `data/arxiv_categories.json`

Maps the 155 leaf subject-category codes to their human-readable names (`cs.CL` -> "Computation and Language", `hep-th` -> "High Energy Physics - Theory"). A code not present in the file falls back to the raw code string.

### `data/arxiv_archive_groups.json`

Maps the 20 archive prefixes to their broad top-level group (`cs` -> "Computer Science", `astro-ph` -> "Physics"), so a card can color or group subject badges by domain via the `data-arxiv-archive` / `data-arxiv-group` hooks.

**Snapshot:** Both files were captured from the [arXiv category taxonomy](https://arxiv.org/category_taxonomy) on 2026-07-05. Refresh them if arXiv adds categories. Keys must match the exact codes the arXiv API returns.

**Data merging caveat:** Hugo merges data files from all modules. If the consuming site has its own `data/arxiv_categories.json` or `data/arxiv_archive_groups.json`, the site's file takes precedence, which may silently override the module's mappings.

## Volatile metrics and freshness

Citation counts, HF upvotes, and code-repository stars are slow-drift numbers -- like the star and like counts that `github-repo` and `hf-space` already surface. They are snapshotted at build time and shipped as normalized fields and `data-*` hooks, so a daily rebuild keeps them fresh.

Because a consumer may rebuild only occasionally, every element carrying such a count also carries a `data-arxiv-metrics-asof="<build RFC3339 timestamp>"` attribute. A daily-rebuilt site can ignore it; a site that rebuilds monthly can surface an honest "as of <date>" label so the snapshot never misleads. Rendering that label is the consuming site's choice -- the module only ships the data.

Unlike the `hf-space` module's Space runtime stage, arXiv papers expose no minute-to-minute ephemeral state, so nothing is force-excluded.

## Styling

The module outputs unstyled semantic HTML. All visual presentation is the consuming site's responsibility.

### CSS hooks

Every element uses BEM naming under the `arxiv-paper` block:

- **Block:** `arxiv-paper` (root `<a>` element, or `<div>` for the `cite` variant)
- **Variant modifiers:** `arxiv-paper--inline`, `arxiv-paper--card`, `arxiv-paper--wide`, `arxiv-paper--stats`, `arxiv-paper--hero`, `arxiv-paper--cite`
- **Elements:** `arxiv-paper__brand`, `arxiv-paper__id`, `arxiv-paper__version`, `arxiv-paper__eyebrow`, `arxiv-paper__title`, `arxiv-paper__authors`, `arxiv-paper__author-list`, `arxiv-paper__author-count`, `arxiv-paper__abstract`, `arxiv-paper__tldr`, `arxiv-paper__categories`, `arxiv-paper__category`, `arxiv-paper__tags`, `arxiv-paper__tag`, `arxiv-paper__tile`, `arxiv-paper__footer`, `arxiv-paper__meta-item`, `arxiv-paper__stat`, `arxiv-paper__stat-label`, `arxiv-paper__stat-value`, `arxiv-paper__banner`, `arxiv-paper__cta`, `arxiv-paper__citations`, `arxiv-paper__upvotes`, `arxiv-paper__code`, `arxiv-paper__cite-ref`, `arxiv-paper__cite-links`, `arxiv-paper__open`, and others.

### Data attributes

The module ships **no** subject colors -- those are design decisions. It exposes the objective values as data attributes so the consuming site can color-code and wire actions freely:

| Attribute | Value | Purpose |
| --- | --- | --- |
| `data-arxiv-id` | `2512.24601` / `hep-th/9901001` | Paper identification |
| `data-variant` | `inline`, `card`, `wide`, `stats`, `hero`, `cite` | Variant identification (reflects the requested variant even when degraded) |
| `data-arxiv-category` | Primary category code (e.g. `cs.CL`) | Subject color-coding hook (also on each category badge) |
| `data-arxiv-archive` | Archive prefix (e.g. `cs`, `hep-th`) | Broad-domain color-coding hook |
| `data-arxiv-group` | Group name (e.g. `Physics`) | Group color-coding hook |
| `data-arxiv-pdf` | Direct PDF URL | Lets a site wire its own PDF action (the card links to the abstract page) |
| `data-arxiv-doi` | `10.48550/arXiv.<id>` | DataCite DOI (`cite` variant) |
| `data-arxiv-code` | Code repository URL | Code-badge hook (`hero` variant, when enriched) |
| `data-arxiv-metrics-asof` | Build RFC3339 timestamp | Freshness hook on volatile counts |
| `data-api-ok` | `true`, `false` | Degraded-state hook |

For example, to color-code the subject badge in your own design system:

```css
.arxiv-paper[data-arxiv-group='Physics'] {
  --arxiv-accent: var(--cat-experience);
}
.arxiv-paper[data-arxiv-group='Computer Science'] {
  --arxiv-accent: var(--cat-skills);
}
```

### Icons

All icons (external link, download, document, authors, subject tag, calendar, quote, upvote, code, sparkle) are inline SVGs using `fill="currentColor"` (inherits text color), `aria-hidden="true"`, `focusable="false"`, and `width="1em" height="1em"` (scales with font size). No external icon font is required. The arXiv brand mark is emitted as the text "arXiv".

## Module Structure

```text
shortcodes/arxiv-paper/
  go.mod
  hugo.toml
  data/
    arxiv_categories.json         # 155 category code -> human-readable name
    arxiv_archive_groups.json     # 20 archive prefix -> broad group
  layouts/
    _shortcodes/
      arxiv-paper.html            # Main shortcode (parameter validation + dispatch)
    _partials/
      arxiv-paper/
        fetch.html                # Locator parse, arXiv fetch, enrichment merge, degradation
        fetch-once.html           # Single-attempt fetch (format-aware unmarshal)
        classify-error.html       # HTTP error -> (errorClass, waitHintSeconds, errorMessage)
        parse-atom.html           # Atom feed -> normalized core paper dict
        authors.html              # Author-list truncation ("A, B, C et al.")
        compact-number.html       # Number formatting (e.g., 1500 -> "1.5k")
        relative-time.html        # Timestamp formatting (e.g., "3 days ago")
        icon.html                 # Centralized inline SVG icon rendering
        inline.html               # V1 inline chip (also the degraded fallback)
        card.html                 # V2 editorial card (default)
        wide.html                 # V3 subject-tile horizontal card
        stats.html                # V4 stats card
        hero.html                 # V5 featured hero
        cite.html                 # V6 copy-ready citation block
  README.md
```
