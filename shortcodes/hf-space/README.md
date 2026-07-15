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
| `overallBudgetSec` | `120` | Wall-clock cap, in seconds |
| `waitHintCapSec` | `30` | Display cap for the rate-limit wait hint in warnings (the full numeric hint is still logged) |

Each attempt uses a fresh cache key (`hf-space:OWNER/NAME:space:attemptN`) so that a response cached as an error by Hugo's `httpcache.Transport` on a prior attempt does not poison subsequent attempts within the same build.

Hugo templates have no sleep primitive, so true backoff between outer attempts is structurally impossible. Hugo's own internal retry already provides a randomized exponential backoff for HTTP 408/429/500/502/503/504 within each attempt; outer attempts then drive a fresh request against the upstream API.

### Error class taxonomy

`classify-error.html` derives a structured `errorClass` from the failed response. Each class drives a different retry decision:

| `errorClass` | Trigger | Retry behavior |
| --- | --- | --- |
| `auth` | HTTP 401 or 403 | Early break -- a missing/private Space or token/permission issue cannot be fixed by retrying. The Hub returns **401** (not 404) to anonymous clients for both missing and private Spaces, so the message names all three causes. |
| `not-found` | HTTP 404 (typically only when authenticated) | Early break -- resource genuinely missing. |
| `rate-limit` | HTTP 429 | Early break -- a rate-limit window cannot reset between immediate attempts. The wait hint is taken from a numeric `Retry-After`, else the `t` reset delta in the IETF `RateLimit` header, else a 60-second default, and surfaced for a later CI-level rebuild. An HTTP-date `Retry-After` (the other form RFC 9110 permits) is treated as absent and falls through to the next hint source. |
| `server` | HTTP 5xx | Retry up to `attempts` or `overallBudgetSec`, whichever comes first. |
| `network` | No HTTP response (DNS failure, connection refused, host timeout) | Retry up to `attempts` or `overallBudgetSec`. |
| `parse` | 2xx response whose body is not a decodable JSON object or array (blank, undecodable, null, or scalar; `{}` and `[]` are valid payloads) | Retry up to `attempts` or `overallBudgetSec`. |
| `other` | Anything else | Retry up to `attempts` or `overallBudgetSec`. |

On retry exhaustion the module emits a single structured `warnf` per failed Space (with `errorClass`, `statusCode`, the Hub's error `message` when present, and a wait hint for rate limits) and falls through to graceful degradation. The build is never broken by an API failure.

## Graceful Degradation

When all retries exhaust, the module does not break the build. It logs the structured warning and degrades:

- **`inline` variant:** Renders from the owner/name parsed from the locator; the like count is omitted (it is unknown without the API).
- **`card`, `wide`, `stats`, `hero` variants:** Fall back to the inline chip layout. The root element carries `data-api-ok="false"` so the consuming site can style the degraded state.

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
