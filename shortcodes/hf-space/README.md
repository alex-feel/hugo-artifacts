# hf-space

Hugo shortcode module that renders a [Hugging Face Space](https://huggingface.co/spaces) link in one of five display variants. The module outputs style-agnostic semantic HTML with [BEM](https://getbem.com/) CSS class hooks, delegating all visual styling to the consuming site. It is the sibling of [`shortcodes/github-repo`](../github-repo/README.md) and follows the same conventions (build-time API fetch, header-aware retries, graceful degradation, data-driven lookups).

## Installation

Import the module in your site's Hugo configuration:

```toml
# hugo.toml

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/shortcodes/hf-space'
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/shortcodes/hf-space
```

**Important -- template lookup precedence:** If your site already has a file at `layouts/_shortcodes/hf-space.html`, Hugo will use the local file instead of the module's shortcode. You must delete the local file for the module to take effect.

## Requirements

- Hugo v0.160.0+ (extended edition)
- Go 1.22+

## Usage

```go-html-template
{{</* hf-space id="gradio/hello_world" */>}}
```

The `id` is the Space identifier in `owner/name` form. You may pass a full URL via `url` instead.

### Variants

The `variant` parameter selects one of five display modes. Default is `card`.

#### inline -- Compact chip for running text

```go-html-template
{{</* hf-space id="owner/name" variant="inline" */>}}
```

A minimal `<a>` element showing the Space's emoji tile, owner/name, and the like count. Suitable for embedding within paragraphs.

#### card -- Editorial card (default)

```go-html-template
{{</* hf-space id="owner/name" */>}}
{{</* hf-space id="owner/name" variant="card" */>}}
```

A vertical card with the emoji tile, a "Hugging Face / SPACE" eyebrow, owner/name title, description, and a footer with the SDK badge and the like count.

#### wide -- Thumbnail-led horizontal card

```go-html-template
{{</* hf-space id="owner/name" variant="wide" */>}}
```

A two-column card with a large emoji tile on the left and, on the right, the eyebrow, owner/name, description, and a footer with SDK, hardware tier, and likes. Ideal for Space round-ups.

#### stats -- Stats card with metrics strip

```go-html-template
{{</* hf-space id="owner/name" variant="stats" */>}}
```

A card with the emoji tile, an owner eyebrow, description, and a 3-column metrics strip: SDK, Hardware, and Likes.

#### hero -- Featured hero with gradient banner

```go-html-template
{{</* hf-space id="owner/name" variant="hero" */>}}
```

The largest variant. A gradient banner carrying the big emoji and faux app-window chrome, followed by the full metadata (tags, SDK, hardware, likes, last-updated) and an "Open in Spaces" call-to-action.

## Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string | yes\* | -- | Space identifier as `owner/name` (e.g., `gradio/hello_world`) |
| `url` | string | yes\* | -- | Full Space URL (e.g., `https://huggingface.co/spaces/owner/name`) |
| `variant` | string | no | `card` | Display variant: `inline`, `card`, `wide`, `stats`, `hero` |
| `title` | string | no | API/name | Display title override (used for the link's `aria-label`; defaults to the Space's card title, then its name) |
| `description` | string | no | API | Description override (defaults to the Space's `short_description`) |
| `emoji` | string | no | API | Tile emoji override (defaults to the Space's card emoji) |
| `class` | string | no | -- | Additional CSS class(es) appended to the root element |

\* Provide either `id` or `url`. When both are given, `id` wins.

Validation:

- Omitting both `id` and `url` fails the build with an error message.
- Passing an invalid `variant` value fails the build with an error message.
- A locator from which no `owner/name` can be parsed fails the build with an error message.

## Authentication

The module calls the [Hugging Face Hub API](https://huggingface.co/docs/hub/api) to fetch Space metadata. Authentication is optional for public Spaces.

### Setting up a token

1. [Create an access token](https://huggingface.co/settings/tokens) (a read-scoped token is sufficient).
2. Set the environment variable before running Hugo:

```bash
export HUGO_HF_TOKEN="hf_your_token_here"
hugo
```

The variable **must** be prefixed with `HUGO_`. Hugo's default security policy restricts `os.Getenv` to variables matching `^HUGO_` or `^CI$`. A variable named `HF_TOKEN` (without the `HUGO_` prefix) will silently return an empty string.

A token is needed only to read **private or gated** Spaces and to raise the anonymous rate limit. When `HUGO_HF_TOKEN` is unset, the module emits a single informational warn-only message per build (deduplicated via `hugo.Store`, so repeated shortcode invocations do not multiply the warning). The build always continues for public Spaces.

### Rate limits

The Hub applies an IETF-style rate limit per IP for anonymous API requests (observed quota: 500 requests per 300-second fixed window). A token raises the limit. Each shortcode invocation makes **one** API call per unique Space, regardless of variant. Hugo caches remote resources to disk (`caches.getresource`), so repeated builds do not re-fetch until the cache expires, and embedding the same Space in multiple shortcodes on a page fetches it at most once per build.

## Resilience and Retries

Each API call is wrapped in an outer retry loop with header-aware error classification, sitting in front of the graceful-degradation behavior described below. The constants are baked into `fetch.html` and are **not** exposed as shortcode parameters or site params; the intent is conservative resilience without configuration surface.

| Constant | Value | Purpose |
| --- | --- | --- |
| `attempts` | `5` | Maximum outer attempts |
| `perAttemptTimeout` | `30s` | Per-request timeout passed to `resources.GetRemote` |
| `backoffSlackSec` | `10` | Reserved on top of the per-attempt timeout when deciding whether another attempt fits: Hugo retries the retryable statuses (408, 429, 500, 502, 503, 504) internally within each attempt, and its final backoff sleep (bounded under ten seconds) does not observe the request deadline, so such an attempt can run past its nominal timeout by up to that much |
| `overallBudgetSec` | `120` | Wall-clock cap, in seconds. A hard ceiling: an attempt only starts while the remaining budget still fits a full per-attempt timeout plus the backoff slack, so even a boundary attempt against a persistently retryable-5xx host cannot overshoot the cap (gate arithmetic runs on a millisecond clock, so integer-second truncation cannot leak past it either) |

Each attempt uses a fresh cache key (`hf-space:OWNER/NAME:space:attemptN`) so that a response cached as an error by Hugo's `httpcache.Transport` on a prior attempt does not poison subsequent attempts within the same build.

Hugo templates have no sleep primitive, so true backoff between outer attempts is structurally impossible. Hugo's own internal retry already provides a randomized exponential backoff for HTTP 408/429/500/502/503/504 within each attempt; outer attempts then drive a fresh request against the upstream API.

### Error class taxonomy

`classify-error.html` derives a structured `errorClass` from the failed response. Each class drives a different retry decision:

| `errorClass` | Trigger | Retry behavior |
| --- | --- | --- |
| `auth` | HTTP 401 or 403 | Early break -- a missing/private Space or token/permission issue cannot be fixed by retrying. The Hub returns **401** (not 404) to anonymous clients for both missing and private Spaces, so the message names all three causes. |
| `not-found` | HTTP 404 (typically only when authenticated) | Early break -- resource genuinely missing. |
| `rate-limit` | HTTP 429 | Early break -- a rate-limit window cannot reset between immediate attempts. The wait hint is taken from a numeric `Retry-After`, else the `t` reset delta in the IETF `RateLimit` header, else a 60-second default -- clamped to one day -- and surfaced for a later CI-level rebuild. An HTTP-date `Retry-After` (the other form RFC 9110 permits) is treated as absent and falls through to the next hint source. |
| `server` | HTTP 5xx | Retry up to `attempts` or `overallBudgetSec`, whichever comes first. |
| `network` | No HTTP response (DNS failure, connection refused, host timeout) | Retry up to `attempts` or `overallBudgetSec`. |
| `parse` | 2xx response whose body is not a decodable JSON object (an array, blank, undecodable, null, or scalar body; `{}` is a valid payload). Unlike the github-repo sibling, no status code is special-cased: the Hub has no 202 still-computing answer. | Retry up to `attempts` or `overallBudgetSec`. |
| `other` | Anything else | Retry up to `attempts` or `overallBudgetSec`. |

On retry exhaustion the module emits a single structured `warnf` per failed Space (with `errorClass`, `statusCode`, the Hub's error `message` when present, and a wait hint for rate limits) and falls through to graceful degradation. The build is never broken by an API failure.

### Host-down circuit breaker

When the fetch loop exhausts its attempts with NO attempt receiving any HTTP status code (every attempt ends `errorClass=network` with `statusCode=0` -- a DNS failure, an unreachable host, a black-holed connection), the module marks `huggingface.co` unreachable for the rest of the build via a `hugo.Store` sentinel. Every later call site -- any Space, any page -- checks the sentinel first and degrades immediately with a warn instead of burning another wall-clock budget, so a full Hub outage costs the build roughly one `overallBudgetSec` window instead of one per call site (concurrently rendered pages that started before the sentinel landed can each still pay an overlapping budget). A failure that surfaces WITH a status code -- a rate limit, an auth failure, a 404, or a non-retryable status such as 501 -- proves the host reachable, never trips the breaker, and keeps its own per-call-site retry budget. One nuance: Hugo retries the retryable statuses (408, 429, 500, 502, 503, 504) internally within each attempt's request window, so a host that answers ONLY with those for whole windows surfaces to the template as status-less no-response failures and trips the breaker exactly like a dark host -- the intended outcome for a host that never yields a usable response within the budget.

### Interplay with Hugo's render timeout

Hugo aborts any page whose render exceeds the site-level `timeout` setting (default `60s`), and every second this module spends fetching counts toward the clock of the page being rendered. Graceful degradation cannot rescue a page that is already out of render budget: during a full Hub outage the first fetching call site can spend up to 120s before it degrades (about 90s when every request window times out status-less, since the attempt reservation blocks a fourth window), so a site whose `timeout` is at or below that figure can fail its build with `timed out rendering the page` even though every widget degraded correctly. The circuit breaker bounds the exposure to roughly one budget per build, but the page that pays that budget still needs headroom. Give the consuming site comfortable margin above the worst case:

```toml
timeout = '180s'
```

## Graceful Degradation

When all retries exhaust, the module does not break the build. It logs the structured warning and degrades:

- **`inline` variant:** Renders from the owner/name parsed from the locator; the like count is omitted (it is unknown without the API).
- **`card`, `wide`, `stats`, `hero` variants:** Fall back to the inline chip layout. The root element carries `data-api-ok="false"` so the consuming site can style the degraded state.
- **Formatter safety:** an unparseable, non-finite, or implausibly large like count passes through the compact-number formatter verbatim, and an unparseable `lastModified` renders an empty relative time; neither breaks the build.

## Data Files

The module ships two data files used to map objective Hub values to display values. Both are flat JSON maps, looked up via `index hugo.Data.<file>` and exposed as normalized fields.

### `data/hf_space_colors.json`

Maps the eight Space color names the Hub allows for `colorFrom`/`colorTo` (`red`, `yellow`, `green`, `blue`, `indigo`, `purple`, `pink`, `gray`) to their hex values (the palette the Hub renders in a Space's social thumbnail). These resolve to `colorFromHex`/`colorToHex` and are emitted as the `--hf-space-color-from`/`--hf-space-color-to` CSS custom properties so the consuming site can paint the gradient tile directly. A color name not present in the file yields an empty hex (the consuming CSS can supply a fallback).

### `data/hf_space_hardware.json`

Maps the Hub's hardware flavor identifiers (as returned in `runtime.hardware.current`/`runtime.hardware.requested`, e.g. `cpu-basic`, `zero-a10g`, `a10g-large`) to concise display names (`CPU basic`, `ZeroGPU`, `A10G large`). An unrecognized or future flavor id falls back to the raw id string.

**Updating:** Refresh these files when the Hub adds colors or hardware tiers. Keys must match the exact strings the Hub API returns.

**Data merging caveat:** Hugo merges data files from all modules. If the consuming site has its own `data/hf_space_colors.json` or `data/hf_space_hardware.json`, the site's file takes precedence, which may silently override the module's mappings.

## Runtime status is intentionally omitted

The module does **not** surface a Space's runtime stage (Running / Sleeping / Building / Error). That state lives for minutes, while a static site is rebuilt days or weeks apart, so any stage captured at build time would be stale almost immediately -- and a "Running" indicator that is actually hours old would actively mislead. The card therefore shows only facts that age gracefully: emoji, title, description, SDK, hardware, likes, tags, and the last-modified date. The Hub `runtime` object is still fetched, but only for the hardware flavor.

## SDK Labels

The Hub's `sdk` value (`gradio`, `streamlit`, `docker`, `static`) is mapped to a display label (`Gradio`, `Streamlit`, `Docker`, `Static`) and exposed as `sdkLabel`, with the raw lowercase value on `data-sdk`. An unknown SDK is title-cased. The SDK version (`sdkVersion`) comes from the Space card's `sdk_version` and is present for Gradio Spaces; Docker and Static Spaces carry none.

## Localization

All UI strings resolve through i18n keys shipped in the module's `i18n/` directory (English and Russian included). Every lookup falls back to the English string, so a site language without translations still renders correctly. Override any key in the consuming site's own `i18n/<lang>.toml` to translate or reword. The `*_ago` and `hf_space_likes_word` keys are plural-form tables: Hugo selects the `one`/`few`/`many`/`other` form from the integer count per the language's CLDR rules.

| Key | English value | Used for |
| --- | --- | --- |
| `hf_space_type_space` | `SPACE` | Card/wide eyebrow and hero type label |
| `hf_space_aria_label` | `{{ .Title }}, a Hugging Face Space by {{ .Owner }}` | Root link accessible label (all variants) |
| `hf_space_stat_sdk` / `_hardware` / `_likes` | `SDK` / `Hardware` / `Likes` | Stats-card labels |
| `hf_space_likes_word` | `like` / `likes` (plural forms) | Hero like-count word (raw counts below 1000 select their own plural form; a compact-formatted display such as `1.2k` selects the form of 1000, whose category fits a rounded quantity) |
| `hf_space_open_in_spaces` | `Open in Spaces` | Hero call-to-action |
| `hf_space_just_now` / `hf_space_yesterday` | `just now` / `yesterday` | Relative time |
| `hf_space_hours_ago` / `_days_ago` / `_months_ago` / `_years_ago` | `1 hour ago` / `{{ .Count }} hours ago` (plural forms) | Relative time |

## Styling

The module outputs unstyled semantic HTML. All visual presentation is the consuming site's responsibility.

### CSS hooks

Every element uses BEM naming under the `hf-space` block:

- **Block:** `hf-space` (root `<a>` element)
- **Variant modifiers:** `hf-space--inline`, `hf-space--card`, `hf-space--wide`, `hf-space--stats`, `hf-space--hero`
- **Elements:** `hf-space__tile`, `hf-space__emoji`, `hf-space__brand`, `hf-space__title`, `hf-space__owner`, `hf-space__description`, `hf-space__footer`, `hf-space__sdk`, `hf-space__sdk-dot`, `hf-space__likes`, `hf-space__meta-item`, `hf-space__stat`, `hf-space__stat-label`, `hf-space__stat-value`, `hf-space__tags`, `hf-space__tag`, `hf-space__banner`, `hf-space__chrome`, `hf-space__big-emoji`, `hf-space__cta`, `hf-space__open`, and others

### CSS custom properties

The gradient tile colors are set via the `--hf-space-color-from` and `--hf-space-color-to` custom properties on the root element (inline `style` attribute), resolved from the Space's `colorFrom`/`colorTo`:

```css
.hf-space__tile,
.hf-space__banner {
  background: linear-gradient(
    135deg,
    var(--hf-space-color-from, #6b7280),
    var(--hf-space-color-to, #374151)
  );
}
```

### Data attributes

The module ships **no** SDK colors -- those are design decisions. It exposes the objective values as data attributes so the consuming site can color-code freely:

| Attribute | Value | Purpose |
| --- | --- | --- |
| `data-space` | `owner/name` | Space identification |
| `data-variant` | `inline`, `card`, `wide`, `stats`, `hero` | Variant identification (reflects the requested variant even when degraded) |
| `data-sdk` | `gradio`, `streamlit`, `docker`, `static`, ... | SDK color-coding hook |
| `data-hardware` | Hardware flavor id (e.g. `zero-a10g`, `cpu-basic`) | Hardware color-coding hook |
| `data-color-from` | Hub color name (e.g. `indigo`) | Gradient remap hook (map to your own palette) |
| `data-color-to` | Hub color name | Gradient remap hook |
| `data-api-ok` | `true`, `false` | Degraded-state hook |

For example, to color-code the SDK badge in your own design system:

```css
.hf-space__sdk[data-sdk='gradio'] {
  --sdk-color: var(--cat-contact);
}
.hf-space__sdk[data-sdk='streamlit'] {
  --sdk-color: var(--status-error);
}
```

To remap the gradient to your own category hues instead of the Hub palette:

```css
.hf-space[data-color-from='indigo'] {
  --hf-space-color-from: var(--cat-experience);
}
```

### Icons

All icons (heart, chip, external-link, clock) are inline SVGs using `fill="currentColor"` (inherits text color), `aria-hidden="true"`, and `width="1em" height="1em"` (scales with font size). No external icon font is required. The Hugging Face brand mark is emitted as the 🤗 emoji inside `.hf-space__brand`, and the Space's own emoji inside `.hf-space__emoji`.

## Module Structure

```text
shortcodes/hf-space/
  go.mod
  hugo.toml
  data/
    hf_space_colors.json          # HF color name -> hex (8 colors)
    hf_space_hardware.json        # hardware flavor id -> display name
  i18n/
    en.toml                       # English UI strings (the fallback defaults)
    ru.toml                       # Russian UI strings
  layouts/
    _shortcodes/
      hf-space.html               # Main shortcode (parameter validation + dispatch)
    _partials/
      hf-space/
        fetch.html                # API fetch, retry loop, data normalization
        fetch-once.html           # Single-attempt fetch (normalized result dict)
        classify-error.html       # HTTP error -> (errorClass, waitHintSeconds, errorMessage)
        compact-number.html       # Number formatting (1500 -> "1.5k"; a rounding carry promotes tiers: 999950 -> "1M")
        relative-time.html        # Timestamp formatting (e.g., "3 days ago")
        icon.html                 # Centralized inline SVG icon rendering
        inline.html               # V1 inline chip (also the degraded fallback)
        card.html                 # V2 editorial card (default)
        wide.html                 # V3 thumbnail-led horizontal card
        stats.html                # V4 stats card
        hero.html                 # V5 featured hero
  README.md
```
