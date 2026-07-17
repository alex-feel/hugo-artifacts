# github-repo

Hugo shortcode module that renders a GitHub repository link in one of five display variants. The module outputs style-agnostic semantic HTML with [BEM](https://getbem.com/) CSS class hooks, delegating all visual styling to the consuming site.

## Installation

Import the module in your site's Hugo configuration:

```toml
# hugo.toml

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/shortcodes/github-repo'
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/shortcodes/github-repo
```

**Important -- template lookup precedence:** If your site already has a file at `layouts/_shortcodes/github-repo.html`, Hugo will use the local file instead of the module's shortcode. You must delete the local file for the module to take effect.

## Requirements

- Hugo v0.160.0+ (extended edition)
- Go 1.22+

## Usage

```go-html-template
{{</* github-repo url="https://github.com/gohugoio/hugo" */>}}
```

### Variants

The `variant` parameter selects one of five display modes. Default is `card`.

#### inline -- Compact chip for running text

```go-html-template
{{</* github-repo url="https://github.com/gohugoio/hugo" variant="inline" */>}}
```

A minimal `<a>` element showing the GitHub icon, the owner/name pair (the `name` override is honored), and an external-link icon. Suitable for embedding within paragraphs. Renders entirely from the URL and makes **no API request**, so it never spends rate-limit budget and never degrades.

#### card -- Editorial card (default)

```go-html-template
{{</* github-repo url="https://github.com/gohugoio/hugo" */>}}
{{</* github-repo url="https://github.com/gohugoio/hugo" variant="card" */>}}
```

Displays a card with a title, description, and a metadata footer showing language (with colored dot), stars, forks, license, and last-updated time.

#### stats -- Stats card with avatar

```go-html-template
{{</* github-repo url="https://github.com/gohugoio/hugo" variant="stats" */>}}
```

Shows an owner-initial avatar, eyebrow label, title, description, and a 4-column stat row (Language, Stars, Forks, License).

#### lang -- Language-bar card

```go-html-template
{{</* github-repo url="https://github.com/gohugoio/hugo" variant="lang" */>}}
```

Renders a card with a star/fork pill, topic tags, a language composition bar (proportional widths from the GitHub Languages API), and a color-coded legend.

#### hero -- Hero card with sparkline

```go-html-template
{{</* github-repo url="https://github.com/gohugoio/hugo" variant="hero" */>}}
```

The largest variant. Includes a breadcrumb header, a 52-week commit sparkline (from the GitHub Participation API), topic tags, full metadata strip, and a "View on GitHub" call-to-action.

## Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | string | yes | -- | Full GitHub repository URL (e.g., `https://github.com/owner/repo`) |
| `variant` | string | no | `card` | Display variant: `inline`, `card`, `stats`, `lang`, `hero` |
| `name` | string | no | API/repo | Display name override (defaults to the repository name) |
| `description` | string | no | API | Description override (defaults to the API description) |
| `class` | string | no | -- | Additional CSS class(es) appended to the root element |

Validation:

- Omitting `url` fails the build with an error message.
- Passing an invalid `variant` value fails the build with an error message.

## Authentication

The module calls the GitHub REST API to fetch repository metadata. Authentication is optional but recommended.

### Setting up a token

1. [Create a personal access token](https://github.com/settings/tokens) (classic or fine-grained). No special scopes are needed for public repositories; for private repositories, grant the `repo` scope.
2. Set the environment variable before running Hugo:

```bash
export HUGO_GITHUB_TOKEN="ghp_your_token_here"
hugo
```

The variable **must** be prefixed with `HUGO_`. Hugo's default security policy restricts `os.Getenv` to variables matching `^HUGO_` and `^CI$`. A variable named `GITHUB_TOKEN` (without the `HUGO_` prefix) will silently return an empty string.

When `HUGO_GITHUB_TOKEN` is unset and an API-using variant renders (any variant except `inline`, which makes no API request), the module emits a single warn-only preflight message per build (deduplicated via `hugo.Store`, so repeated shortcode invocations do not multiply the warning). The build always continues.

### Rate limits

| Mode            | Limit               |
| --------------- | ------------------- |
| Unauthenticated | 60 requests/hour    |
| With token      | 5,000 requests/hour |

Each shortcode invocation makes 0-2 API calls per unique repository depending on the variant:

| Variant  | API calls                                   |
| -------- | ------------------------------------------- |
| `inline` | 0 (renders entirely from the URL)           |
| `card`   | 1 (base repo data)                          |
| `stats`  | 1 (base repo data)                          |
| `lang`   | 2 (base repo data + `/languages`)           |
| `hero`   | 2 (base repo data + `/stats/participation`) |

Hugo caches remote resources to disk (`caches.getresource`), so repeated builds do not re-fetch until the cache expires.

## Resilience and Retries

Each API call is wrapped in an outer retry loop with header-aware error classification. The retry layer sits in front of the graceful-degradation behavior described in the next section: when retries exhaust, the widget degrades exactly as it did before this layer existed.

### Retry parameters

The constants are baked into `fetch.html` and are **not** exposed as shortcode parameters or site params. The intent is conservative resilience without configuration surface.

| Constant | Value | Purpose |
| --- | --- | --- |
| `attempts` | `5` | Maximum outer attempts per fetched endpoint |
| `perAttemptTimeout` | `30s` | Per-request timeout passed to `resources.GetRemote` |
| `backoffSlackSec` | `10` | Reserved on top of the per-attempt timeout when deciding whether another attempt fits: Hugo retries the retryable statuses (408, 429, 500, 502, 503, 504) internally within each attempt, and its final backoff sleep (bounded under ten seconds) does not observe the request deadline, so such an attempt can run past its nominal timeout by up to that much |
| `overallBudgetSec` | `120` | Wall-clock cap per fetched endpoint, in seconds. A hard ceiling: an attempt only starts while the remaining budget still fits a full per-attempt timeout plus the backoff slack, so even a boundary attempt against a persistently retryable-5xx host cannot overshoot the cap (gate arithmetic runs on a millisecond clock, so integer-second truncation cannot leak past it either) |

Each attempt uses a fresh cache key (`github-repo:OWNER/REPO:ENDPOINT:attemptN`) so that a response cached as an error by Hugo's `httpcache.Transport` on a prior attempt does not poison subsequent attempts within the same build.

Hugo templates have no sleep primitive, so true backoff between outer attempts is structurally impossible. Hugo's own internal retry already provides a randomized exponential backoff for HTTP 408/429/500/502/503/504 within each attempt (sleep steps double up to just under ten seconds -- the 5s figure in Hugo's source is the doubling threshold, not the sleep cap, which is why `backoffSlackSec` reserves ten); outer attempts then drive a fresh request against the upstream API.

### Error class taxonomy

`classify-error.html` derives a structured `errorClass` from the failed response. Each class drives a different retry decision:

| `errorClass` | Trigger | Retry behavior |
| --- | --- | --- |
| `primary-rate-limit` | HTTP 403 with `X-RateLimit-Remaining: 0` | Early break -- subsequent attempts cannot succeed within the same build. Wait hint computed from `X-RateLimit-Reset`, clamped to one day. |
| `secondary-rate-limit` | HTTP 429 | Retry while the wait hint fits in the remaining wall-clock budget. Wait hint preference: numeric `Retry-After`, then `X-RateLimit-Reset` delta, then `60s`; the result is clamped to one day. An HTTP-date `Retry-After` (the other form RFC 9110 permits) is treated as absent and falls through to the next hint source. |
| `auth` | HTTP 401, or HTTP 403 without rate-limit headers | Early break -- token / permissions issue cannot be fixed by retrying. |
| `not-found` | HTTP 404 (Hugo's `nil` branch from `resources.GetRemote`) | Early break -- resource is genuinely missing. |
| `server` | HTTP 5xx | Retry up to `attempts` or `overallBudgetSec`, whichever comes first. |
| `network` | No HTTP response (DNS failure, connection refused, host timeout) | Retry up to `attempts` or `overallBudgetSec`, whichever comes first. |
| `parse` | 2xx response that is not a data-bearing JSON object -- an array, blank, undecodable, null, or scalar body, or any HTTP 202 (the "statistics are being computed" answer from `/stats/participation` carries no data yet); `{}` is a valid payload | Retry up to `attempts` or `overallBudgetSec` -- the statistics computation often completes between attempts. |
| `other` | Anything else | Retry up to `attempts` or `overallBudgetSec`, whichever comes first. |

The first attempt always runs regardless of the initial classification (the early-break check is gated on attempt > 1). On retry exhaustion -- whether by `attempts` count, `overallBudgetSec` cap, or early break -- the widget falls through to the graceful degradation path described below.

### Header-aware diagnostics

When retries exhaust, the module emits a single structured `warnf` per failed endpoint:

```text
[github-repo] Failed to fetch OWNER/REPO after N attempt(s) (errorClass=primary-rate-limit, statusCode=403, message="HTTP 403 (primary rate limit reached): API rate limit exceeded ..."). Hint: wait 1842 seconds and rebuild. See PATH:LINE:COL
```

The `Hint:` field surfaces the numeric `waitHintSeconds` so an operator can act on it directly; the classifier clamps remote-derived hints to one day, so the figure is always actionable and never absurd.

If the upstream response includes a JSON body with a `message` field (typical for GitHub error responses), the message is appended to the diagnostic. Malformed bodies are silently ignored so they cannot break the build.

### Host-down circuit breaker

When a fetch loop exhausts its attempts with NO attempt receiving any HTTP status code (every attempt ends `errorClass=network` with `statusCode=0` -- a DNS failure, an unreachable host, a black-holed connection), the module marks `api.github.com` unreachable for the rest of the build via a `hugo.Store` sentinel. Every later fetch loop -- any endpoint, any call site, any page -- checks the sentinel first and degrades immediately with a warn instead of burning another wall-clock budget, so a full API outage costs the build roughly one `overallBudgetSec` window instead of one per call site (concurrently rendered pages that started before the sentinel landed can each still pay an overlapping budget). A failure that surfaces WITH a status code -- a rate limit, an auth failure, a 404, or a non-retryable status such as 501 -- proves the host reachable, never trips the breaker, and keeps its own per-call-site retry budget. One nuance: Hugo retries the retryable statuses (408, 429, 500, 502, 503, 504) internally within each attempt's request window, so a host that answers ONLY with those for whole windows surfaces to the template as status-less no-response failures and trips the breaker exactly like a dark host -- the intended outcome for a host that never yields a usable response within the budget.

### Worst-case build time

Under the constants above, the per-call worst case is bounded as follows:

| Variant  | Endpoints fetched                  | Worst-case wall clock |
| -------- | ---------------------------------- | --------------------: |
| `inline` | none                               |                **0s** |
| `card`   | base repo                          |              **120s** |
| `stats`  | base repo                          |              **120s** |
| `lang`   | base repo + `/languages`           |              **240s** |
| `hero`   | base repo + `/stats/participation` |              **240s** |

These caps apply only when every endpoint exhausts retries against `server`, `secondary-rate-limit` (with a short reset window), `network`, `parse`, or `other` failures. The most common observed failure -- `primary-rate-limit` from an exhausted unauthenticated 60 req/h budget -- triggers an early break on attempt 2, so the realistic per-call cost is approximately one HTTP round-trip plus one classification.

The table is the per-call-site ceiling, and during a full outage only the FIRST fetching call site pays it: exhausting against a host that never responds trips the circuit breaker above, so every later call site in the build degrades in effectively zero time. In the outage scenario the 240s rows additionally require the host to die between a call site's two endpoints -- a host that is down from the start fails the base-repo endpoint within its 120s budget (about 90s when every request window times out status-less, since the attempt reservation blocks a fourth window) and skips the second endpoint entirely (`apiOk` is already false) -- while an exhaustion against slow responding failures (5xx, parse) can also reach 240s with the host up throughout, without ever involving the breaker.

When the API is healthy, the retry layer adds **zero** measurable overhead: the first attempt succeeds and the loop short-circuits.

Hugo's per-build resource cache also deduplicates same-URL calls within a build, so embedding the same repository in multiple shortcodes on a page pays the retry cost at most once per endpoint.

### Interplay with Hugo's render timeout

Hugo aborts any page whose render exceeds the site-level `timeout` setting (default `60s`), and every second this module spends fetching counts toward the clock of the page being rendered. Graceful degradation cannot rescue a page that is already out of render budget: during a full API outage the first fetching call site can spend up to 120s (240s when the host dies between a `lang`/`hero` call site's two endpoints) before it degrades, so a site whose `timeout` is at or below that figure can fail its build with `timed out rendering the page` even though every widget degraded correctly. The circuit breaker bounds the exposure to roughly one budget per build, but the page that pays that budget still needs headroom. Give the consuming site comfortable margin above the worst case:

```toml
timeout = '300s'
```

### CI-level retry (cross-build resilience)

A primary rate-limit window can span up to 60 minutes. Hugo templates cannot wait that long, so once a build hits the wall, the only remaining cure is to **rerun the build later**. Configure this at the CI level:

- **Cloudflare Pages:** Use the dashboard's "Retry deployment" action, or trigger a redeploy via the API after a wait.
- **GitHub Actions:** `gh run rerun --failed`, or an `if: failure()` step that schedules a delayed retry.
- **Any CI:** Schedule a delayed retry of the deploy job, spaced by the wait hint surfaced in the build log (or a conservative 30-60 minute interval if the hint is unavailable).

Setting `HUGO_GITHUB_TOKEN` reduces the likelihood of hitting the primary rate limit by raising the budget from 60 req/h to 5,000 req/h; it does not eliminate the need for CI-level retries on adversarial network conditions.

## Graceful Degradation

When all retries for an endpoint exhaust, the module does not break the build. It logs the structured warning described above and degrades:

- **`inline` variant:** Unaffected -- it performs no API call and renders entirely from the URL.
- **`card`, `stats`, `lang`, `hero` variants:** Fall back to the inline chip layout.
- **`lang` variant, languages endpoint failure:** The language bar and legend are omitted; the rest of the card renders normally.
- **`hero` variant, participation endpoint failure or HTTP 202:** The sparkline is omitted; the rest of the card renders normally.
- **Formatter safety:** an unparseable, non-finite, or implausibly large star/fork count passes through the compact-number formatter verbatim, and an unparseable `pushed_at` timestamp renders an empty relative time; neither breaks the build.

## Language Colors

The module ships with `data/github_repo_lang_colors.json`, a mapping of 58 programming language names to their hex color values sourced from [GitHub Linguist](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml). These colors appear as the language dot in card, stats, and hero variants, and as bar/legend colors in the lang variant. The filename is module-prefixed so it cannot collide by accident with another module's or the site's own data files.

Languages not present in this file receive no color value. The consuming site's CSS can provide a fallback (e.g., via a default value for `--github-repo-lang-color`).

**Updating:** To refresh colors or add new languages, update `data/github_repo_lang_colors.json` with values from the [Linguist languages.yml](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml) `color` field. Keys must match the exact language names returned by the GitHub API (case-sensitive).

**Overriding:** Hugo merges data files from all modules, and the consuming site's files take precedence. A site can therefore replace the shipped color mappings deliberately by defining its own `data/github_repo_lang_colors.json`.

## Localization

All UI strings resolve through i18n keys shipped in the module's `i18n/` directory (English and Russian included). Every lookup falls back to the English string, so a site language without translations still renders correctly. Override any key in the consuming site's own `i18n/<lang>.toml` to translate or reword. The `*_ago` keys are plural-form tables: Hugo selects the `one`/`few`/`many`/`other` form from the integer count per the language's CLDR rules.

| Key | English value | Used for |
| --- | --- | --- |
| `github_repo_eyebrow_card` | `GITHUB · REPOSITORY` | Card eyebrow |
| `github_repo_eyebrow_stats` | `GITHUB / {{ . }}` | Stats eyebrow (`{{ . }}` is the uppercased owner) |
| `github_repo_type_repository` | `REPOSITORY` | Lang-card eyebrow and hero breadcrumb |
| `github_repo_updated` | `updated {{ . }}` | Card and hero updated line (`{{ . }}` is the relative time) |
| `github_repo_view_on_github` | `View on GitHub` | Hero call-to-action |
| `github_repo_sparkline_title` | `Last 52 weeks of commits` | Hero sparkline tooltip |
| `github_repo_stat_language` / `_stars` / `_forks` / `_license` | `Language` / `Stars` / `Forks` / `License` | Stats-card labels |
| `github_repo_stars_word` / `github_repo_forks_word` | `star`/`stars` / `fork`/`forks` (plural forms) | Hero and lang-card count words (raw counts below 1000 select their own plural form; a compact-formatted display such as `1.2k` selects the form of 1000) |
| `github_repo_just_now` / `github_repo_yesterday` | `just now` / `yesterday` | Relative time |
| `github_repo_hours_ago` / `_days_ago` / `_months_ago` / `_years_ago` | `1 hour ago` / `{{ .Count }} hours ago` (plural forms) | Relative time |

## Styling

The module outputs unstyled semantic HTML. All visual presentation is the consuming site's responsibility.

### The inline chip in flex and grid parents

The root element is an unstyled `<a>`. As a flex or grid item it is stretched by the container's default alignment (`align-items: stretch` in a flex column; stretch on both axes in a grid cell), so the chip silently grows to fill the available space instead of hugging its content. If you place the chip inside such a container, size it to its content:

```css
.github-repo--inline {
  width: fit-content;
  align-self: start;
  justify-self: start;
}
```

Everything else -- colors, spacing, hover and focus states -- is yours to design.

### CSS hooks

Every element uses BEM naming under the `github-repo` block:

- **Block:** `github-repo` (root `<a>` element)
- **Variant modifiers:** `github-repo--inline`, `github-repo--card`, `github-repo--stats`, `github-repo--lang`, `github-repo--hero`
- **Elements:** `github-repo__title`, `github-repo__description`, `github-repo__footer`, `github-repo__meta-item`, `github-repo__lang-dot`, `github-repo__sparkline`, `github-repo__topics`, `github-repo__topic`, `github-repo__cta`, and others

### CSS custom property

The language dot color is set via the `--github-repo-lang-color` CSS custom property on `.github-repo__lang-dot` elements (inline `style` attribute). Your CSS can reference it:

```css
.github-repo__lang-dot {
  background-color: var(--github-repo-lang-color, var(--fallback-color, #858585));
}
```

### Data attributes

| Attribute      | Value                                     | Purpose                   |
| -------------- | ----------------------------------------- | ------------------------- |
| `data-repo`    | `owner/repo`                              | Repository identification |
| `data-variant` | `inline`, `card`, `stats`, `lang`, `hero` | Variant identification    |

### Icons

All icons are inline SVGs using `fill="currentColor"` (inherits text color), `aria-hidden="true"`, and `width="1em" height="1em"` (scales with font size). No external icon fonts are required.

## Module Structure

```text
shortcodes/github-repo/
  go.mod
  hugo.toml
  data/
    github_repo_lang_colors.json
  i18n/
    en.toml                           # English UI strings (the fallback defaults)
    ru.toml                           # Russian UI strings
  layouts/
    _shortcodes/
      github-repo.html              # Main shortcode (parameter validation + dispatch)
    _partials/
      github-repo/
        fetch.html                  # API fetching, retry loop, data normalization
        fetch-once.html             # Single-attempt fetch (normalized result dict)
        classify-error.html         # HTTP error -> (errorClass, waitHintSeconds, errorMessage)
        compact-number.html         # Number formatting (1500 -> "1.5k"; a rounding carry promotes tiers: 999950 -> "1M")
        relative-time.html          # Timestamp formatting (e.g., "3 days ago")
        icon.html                   # Centralized SVG icon rendering
        inline.html                 # V1 inline chip
        card.html                   # V2 editorial card (default)
        stats.html                  # V3 stats card
        lang.html                   # V4 language-bar card
        hero.html                   # V5 hero card
```
