# github-profile

Hugo shortcode module that renders a GitHub person-profile widget for presenting one's own GitHub activity and achievements: contribution totals, the contribution calendar, per-organization rollups, external-collaboration footprint, language depth, and optional identity and showcase sections. The module outputs style-agnostic semantic HTML with [BEM](https://getbem.com/) CSS class hooks and machine-readable `data-*` attributes, delegating all visual styling to the consuming site. It is built for self-presentation surfaces -- a portfolio, a team page, a speaker bio -- where the subject publishes their own public activity.

The widget aggregates composites GitHub itself never presents in one place: per-organization contribution rollups by type (commits, issues, pull requests, reviews), all-time totals summed across every contribution year, an external-vs-own collaboration split, review activity as a first-class number, and 90-day recency.

## Installation

Import the module in your site's Hugo configuration:

```toml
# hugo.toml

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/shortcodes/github-profile'
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/shortcodes/github-profile
```

**Important -- template lookup precedence:** If your site already has a file at `layouts/_shortcodes/github-profile.html`, Hugo will use the local file instead of the module's shortcode. You must delete the local file for the module to take effect.

## Requirements

- Hugo v0.160.0+ (any edition)
- Go 1.22+
- A `HUGO_GITHUB_TOKEN` environment variable (see Authentication -- the GitHub GraphQL API has no anonymous tier, so without a token the widget renders only the identity chip)

## Usage

```go-html-template
{{</* github-profile user="octocat" */>}}
```

### Variants

The `variant` parameter selects a curated section preset. Default is `card`.

#### compact -- One-line metric strip

```go-html-template
{{</* github-profile user="octocat" variant="compact" */>}}
```

Renders only the `headline` section: commits, pull requests, external footprint, and 90-day recency as a single metric strip.

#### card -- Activity card (default)

```go-html-template
{{</* github-profile user="octocat" */>}}
{{</* github-profile user="octocat" variant="card" */>}}
```

Renders `headline`, `calendar`, `org-rollup`, `languages`, and `reviews` -- pure activity evidence with no identity fields. The default deliberately complements a page that already presents the person (photo, name, bio, social links): it shows only what such a page lacks. Identity, memberships, pinned repositories, and social links stay one `sections` token away.

#### full -- Complete dossier

```go-html-template
{{</* github-profile user="octocat" variant="full" */>}}
```

Renders all ten sections, including identity, for standalone use where the widget is the page's only presentation of the person.

### Sections

The `sections` parameter overrides the preset with a comma-separated token list, rendered in the given order:

| Token | Content |
| --- | --- |
| `identity` | Avatar, name, login, hireable badge, pronouns, bio, status, company, location, website, tenure |
| `headline` | Metric strip: commits, pull requests, external repositories and organizations, 90-day recency |
| `calendar` | Contribution calendar (heatmap) with per-day counts and quartile levels |
| `org-rollup` | Per-organization contribution rollup: commits, issues, pull requests, reviews per owner |
| `languages` | Byte-weighted language shares across owned and contributed repositories |
| `reviews` | Pull request reviews given |
| `contributed` | Externally contributed repositories (not owned by the person), by stars |
| `orgs` | Public organization memberships |
| `pinned` | The person's pinned repositories |
| `socials` | Verified social accounts, LinkedIn first |

```go-html-template
{{</* github-profile user="octocat" sections="headline,calendar,contributed" */>}}
```

## Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `user` | string | yes | -- | GitHub login of the person to present |
| `variant` | string | no | `card` | Section preset: `compact`, `card`, `full` |
| `sections` | string | no | preset | Comma-separated section tokens overriding the preset, rendered in order |
| `history` | string | no | `year` | Contribution window: `year` (rolling ~1-year window, GitHub's own profile framing) or `all` (all-time totals via one extra GraphQL request) |
| `show-streak` | bool | no | `false` | Compute current/longest contribution streaks and expose them on the calendar |
| `show-rank` | bool | no | `false` | Compute the transparent activity score (see Computed Metrics) |
| `merged-prs` | bool | no | `false` | Fetch the lifetime merged-PR count via one extra REST Search request |
| `avatar` | string | no | `fetch` | Identity-section avatar handling: `fetch` (build-time copy, placeholder on failure), `hotlink`, `none` |
| `name` | string | no | API | Display-name override (also used by the degraded identity chip) |
| `attribution` | bool | no | `true` | Render the `@login on GitHub` source line |
| `class` | string | no | -- | Additional CSS class(es) appended to the root element |

Validation:

- Omitting `user`, or passing a value that is not a well-formed GitHub login (alphanumerics and inner hyphens, at most 39 characters), fails the build with an error message.
- Passing an invalid `variant`, `history`, or `avatar` value fails the build with an error message.
- Unknown `sections` tokens emit a warning and are ignored; if nothing valid remains, the variant preset applies.

## Authentication

The module calls the GitHub GraphQL API, which requires authentication for every request -- there is no anonymous tier. Without a token the module makes no API request at all and degrades to the identity chip.

### Setting up a token

1. [Create a personal access token](https://github.com/settings/tokens). A classic token with **zero scopes** suffices: scopes gate access to private data, not the rate-limit tier, and the widget reads only public data. If a fine-grained token does not return another person's public data, fall back to a classic zero-scope token.
2. Set the environment variable before running Hugo:

```bash
export HUGO_GITHUB_TOKEN="ghp_your_token_here"
hugo
```

The variable **must** be prefixed with `HUGO_`. Hugo's default security policy restricts `os.Getenv` to variables matching `^HUGO_` and `^CI$`. A variable named `GITHUB_TOKEN` (without the `HUGO_` prefix) will silently return an empty string.

When `HUGO_GITHUB_TOKEN` is unset, the module emits a single warn-only preflight message per build (deduplicated via `hugo.Store`) and every widget renders the identity chip. The build always continues.

## Rate limits

The GraphQL primary limit for a personal access token is 5,000 points per hour, and the module's snapshot query costs 1 point, so even a site rendering dozens of profiles consumes about 1 percent of the hourly budget per build.

| Configuration | Requests per rendered profile |
| --- | --- |
| defaults | 1 GraphQL POST (cost: 1 point) |
| `history="all"` | 2 GraphQL POSTs (the year list is only known from the first response) |
| `merged-prs="true"` | +1 REST Search GET (its own bucket: 30 requests/minute) |
| `avatar="fetch"` with `identity` active | +1 image GET to GitHub's avatar CDN (not the API budget) |

The Search API bucket is the tightest real constraint: a build rendering more than about 30 `merged-prs` profiles within a minute will see that metric degrade on the overflow. Hugo caches remote responses to disk (`caches.getresource`), so repeated builds do not re-fetch until the consuming site's cache expires.

## Resilience and Retries

Each API call is wrapped in the same outer retry loop with header-aware error classification as the sibling [`github-repo`](../github-repo/) module: 5 attempts per endpoint, 30s per-attempt timeout, a 120s wall-clock budget per endpoint, per-attempt cache keys so a cached error response cannot poison later attempts, early breaks on provably-useless error classes (`primary-rate-limit`, `auth`, `not-found`, and a `secondary-rate-limit` whose reset exceeds the remaining budget), and a host-down circuit breaker (`hugo.Store` sentinel) so a full API outage costs the build roughly one budget instead of one per call site. The constants are baked into `fetch.html` and are not exposed as parameters. See the `github-repo` README for the full class taxonomy and rationale; this module reuses the contract with `github-profile:`-namespaced store keys.

One correctness rule is GraphQL-specific: the GraphQL endpoint reports failures as HTTP 200 with a `{data, errors}` envelope, and an unknown login arrives as a null `data.user`, not a 404. The retry loop therefore handles only transport-level failures; after it succeeds, the envelope is inspected exactly once, and an envelope-level failure (unknown user, insufficient scopes, GraphQL rate limit) is classified and degraded without retrying -- it is an authoritative API answer that a retry within the same build cannot change. HTTP status alone is never trusted.

### Interplay with Hugo's render timeout

Hugo aborts any page whose render exceeds the site-level `timeout` setting (default `60s`), and every second this module spends fetching counts toward the clock of the page being rendered. During a full API outage the first fetching call site can spend up to 120s (240s with `history="all"` if the host dies between the two GraphQL requests) before it degrades. Give a consuming site that renders profile widgets comfortable margin:

```toml
timeout = '300s'
```

## Graceful Degradation

When a fetch cannot run or exhausts its retries, the module does not break the build. It logs one structured warning per failed endpoint and degrades:

- **No token, unknown user, rate limit, host down, or any snapshot failure:** the widget renders the zero-API identity chip (name or login, linked to the GitHub profile) with the `github-profile--degraded` modifier and a `data-state` attribute naming the reason.
- **`history="all"` follow-up failure:** totals fall back to the rolling-year window; `data-history` stays `year`.
- **`merged-prs` failure:** the merged-PR metric is hidden; the authored-PR count renders with its honest label.
- **Avatar fetch failure:** the placeholder person icon renders instead of the image.
- **Partial GraphQL data:** a resolved `data.user` with a non-empty `errors` array renders every section whose data resolved and warns once; a section whose data is missing is omitted, never broken.

## Computed Metrics

Everything beyond raw API fields is computed at build time from data already fetched:

- **Per-organization rollup** groups the four per-repository contribution lists by repository owner (the person's own account excluded) into per-owner commits, issues, pull requests, and reviews. Scoped to the contribution window and to the API's 100-repositories-per-type ceiling.
- **External footprint** counts repositories the person does not own (`repositoriesContributedTo` with `includeUserRepositories: false`) and the distinct organizations among their owners.
- **90-day recency** counts active days and total contributions over the trailing 90 calendar days.
- **All-time totals** (`history="all"`) sum one aliased `contributionsCollection` block per contribution year; each block spans one calendar year, respecting the API's 1-year span limit.
- **Language shares** aggregate per-repository language byte counts across owned non-fork and contributed repositories, normalized to percentages.
- **Streaks** (`show-streak="true"`) walk the contribution calendar: the current streak is the consecutive run ending today (or yesterday when today has no contribution yet); the longest streak is the historical maximum run.
- **Activity score** (`show-rank="true"`) is the [github-readme-stats](https://github.com/anuraghazra/github-readme-stats) formula, computed transparently: commits, pull requests, issues, and reviews through `1 - 2^(-x/median)`; stars and followers through `x/(x+median)`; weights 2/3/1/1/4/1; medians 250 (1,000 for all-time commits), 50, 25, 2, 50, 10; the weighted percentile maps to levels S through C at thresholds 1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100. It is off by default because composite scores are gameable vanity; when you enable it, the formula above is the whole story -- no black box.

## Data Honesty and Limits

- **Every total is a floor, not a ceiling.** Private contributions surface only as an aggregate count (`restrictedContributionsCount`), and only when the person opted into showing private activity; concealed organization memberships never appear; private-repository detail is invisible to any third-party token at any scope. A low number never proves low output.
- **The default PR number counts authored pull requests** in the contribution window, not merged ones; the label says so. A strictly merged lifetime count requires `merged-prs="true"`.
- **GitHub's native achievement badges (Pull Shark, Galaxy Brain, and the rest) are not exposed by any GitHub API.** The module does not scrape profile HTML and does not fake badges.
- **Counts are inflatable and deflatable.** Commit generators can fabricate activity, while squash merges, unlinked commit emails, and non-default-branch work make real activity undercount. The widget presents activity evidence, not a productivity score.
- **Logins are mutable.** A renamed account frees its old login for someone else. The widget records the immutable account id in `data-user-id`; update the `user` parameter promptly after a rename.
- **The output is a build-time snapshot** of public data the person already publishes on their GitHub profile; it refreshes when the site rebuilds.

## Localization

All UI strings resolve through i18n keys shipped in the module's `i18n/` directory (English and Russian included). Every lookup falls back to the English string, so a site language without translations still renders correctly. Override any key in the consuming site's own `i18n/<lang>.toml`. The plural-table keys select the `one`/`few`/`many`/`other` form from the integer count per the language's CLDR rules.

| Key | English value | Used for |
| --- | --- | --- |
| `github_profile_attribution` | `@{{ . }} on GitHub` | Source line (`{{ . }}` is the login) |
| `github_profile_hireable` | `Open to opportunities` | Identity hireable badge |
| `github_profile_metric_commits` / `_prs` / `_merged_prs` / `_reviews` | `commits` / `pull requests (authored)` / `merged pull requests` / `pull request reviews given` | Metric labels |
| `github_profile_metric_external_repos` / `_external_orgs` | `external repositories` / `organizations` | Metric labels |
| `github_profile_metric_recent_days` | `active days in the last 90` | Recency metric label |
| `github_profile_member_years` | `{{ .Count }} years on GitHub` (plural forms) | Identity tenure line |
| `github_profile_calendar_label` | `{{ .Count }} contributions` (plural forms) | Calendar `aria-label` |
| `github_profile_restricted_note` | `plus {{ .Count }} private contributions` (plural forms) | Private-floor note |
| `github_profile_streak_current` / `_longest` / `_days` | `current streak` / `longest streak` / `{{ .Count }} days` (plural forms) | Streak labels |
| `github_profile_languages_label` / `_org_rollup_label` / `_contributed_label` / `_orgs_label` / `_pinned_label` / `_socials_label` | `Languages by code volume` / `Contributions by organization` / `Contributes to` / `Organizations` / `Pinned repositories` / `Elsewhere` | Section `aria-label`s |
| `github_profile_rank_label` | `activity score` | Activity score label |

## Styling

The module outputs unstyled semantic HTML. All visual presentation is the consuming site's responsibility.

### CSS hooks

Every element uses BEM naming under the `github-profile` block:

- **Block:** `github-profile` (root `<article>` element)
- **Modifiers:** `github-profile--compact`, `github-profile--card`, `github-profile--full`, `github-profile--degraded`
- **Section wrappers:** `github-profile__section` plus `github-profile__section--<token>` per section
- **Elements:** `github-profile__metric`, `github-profile__metric-value`, `github-profile__metric-label`, `github-profile__floor-note`, `github-profile__rank`, `github-profile__calendar`, `github-profile__calendar-week`, `github-profile__calendar-day`, `github-profile__streak`, `github-profile__languages`, `github-profile__lang`, `github-profile__lang-label`, `github-profile__lang-pct`, `github-profile__org-rollup`, `github-profile__org-roll`, `github-profile__org-roll-name`, `github-profile__org-roll-stat`, `github-profile__contributed`, `github-profile__repo`, `github-profile__repo-name`, `github-profile__repo-stat`, `github-profile__repo-lang`, `github-profile__repo-description`, `github-profile__orgs`, `github-profile__org`, `github-profile__org-name`, `github-profile__pinned`, `github-profile__pinned-item`, `github-profile__socials`, `github-profile__social-item`, `github-profile__avatar` (plus `--placeholder`), `github-profile__name`, `github-profile__login`, `github-profile__badge`, `github-profile__bio`, `github-profile__status`, `github-profile__meta-item`, `github-profile__attribution`, `github-profile__degraded-chip`, `github-profile__icon`

### CSS custom properties

The calendar day cells and language items carry only custom-property indirections and measured values -- never color choices:

- `--github-profile-day-level` on each `github-profile__calendar-day` points at a site-defined `--github-profile-level-0` through `--github-profile-level-4` token, mapped from GitHub's quartile enum.
- `--github-profile-lang-share` on each `github-profile__lang` carries the measured percentage (e.g., `42.1%`) for bar-width styling.

Example site-side calendar palette:

```css
.github-profile {
  --github-profile-level-0: #ebedf0;
  --github-profile-level-1: #9be9a8;
  --github-profile-level-2: #40c463;
  --github-profile-level-3: #30a14e;
  --github-profile-level-4: #216e39;
}

.github-profile__calendar-day {
  background-color: var(--github-profile-day-level, var(--github-profile-level-0));
}
```

Sites preferring attribute selectors can style `[data-level="FOURTH_QUARTILE"]` directly and ignore the custom properties.

### Data attributes

| Attribute | Element | Value |
| --- | --- | --- |
| `data-user` | root | GitHub login |
| `data-user-id` | root | Immutable numeric account id (rename-safe identification) |
| `data-variant` | root | `compact`, `card`, `full` |
| `data-sections` | root | Comma-separated active section tokens |
| `data-api-ok` | root | `true` or `false` |
| `data-history` | root | Effective window: `year` or `all` |
| `data-state` | root (degraded only) | Degradation reason (`no-token`, `not-found`, `primary-rate-limit`, ...) |
| `data-metric`, `data-raw` | metrics | Metric token and unformatted integer |
| `data-total` | calendar, orgs list | Total contributions / total memberships |
| `data-current-streak`, `data-longest-streak` | calendar (opt-in) | Streak day counts |
| `data-date`, `data-count`, `data-level` | calendar days | ISO date, raw count, quartile enum (`NONE` ... `FOURTH_QUARTILE`) |
| `data-lang`, `data-pct` | language items | Language name and share |
| `data-org`, `data-owner-type`, `data-commits`, `data-issues`, `data-prs`, `data-reviews`, `data-total` | rollup items | Owner login, `Organization`/`User`, per-type and total counts |
| `data-repo`, `data-stars`, `data-lang` | contributed/pinned items | Repository identification and stats |
| `data-owner-type` | contributed items only | Owner type (`Organization`/`User`) |
| `data-avatar` | org items | Organization avatar URL (for site-side rendering) |
| `data-provider` | social items | Provider enum (`LINKEDIN`, `TWITTER`, ...) |
| `data-rank-level`, `data-rank-percentile` | rank (opt-in) | Score level and percentile |
| `data-meta` | identity meta items | `company`, `location`, `website`, `tenure`, `pronouns`, `status` |
| `data-badge` | identity badge | `hireable` |
| `data-streak` | streak spans | `current`, `longest` |

### Icons

All icons are inline SVGs (GitHub Octicons, MIT license) using `fill="currentColor"` (inherits text color), `aria-hidden="true"`, `focusable="false"`, and `width="1em" height="1em"` (scales with font size). No external icon fonts are required.

## Module Structure

```text
shortcodes/github-profile/
  go.mod
  hugo.toml
  i18n/
    en.toml                           # English UI strings (the fallback defaults)
    ru.toml                           # Russian UI strings
  layouts/
    _shortcodes/
      github-profile.html           # Main shortcode (parameter validation + dispatch)
    _partials/
      github-profile/
        build-query.html            # GraphQL query assembly (snapshot + per-year blocks)
        fetch.html                  # Endpoint orchestration, retry loops, envelope inspection
        fetch-once.html             # Single-attempt fetch (normalized result dict)
        classify-error.html         # HTTP error -> (errorClass, waitHintSeconds, errorMessage)
        derive.html                 # Computed metrics (rollups, recency, shares, streaks, score)
        render.html                 # Root element + section dispatch + degraded chip
        section-identity.html       # Identity strip (avatar, name, meta)
        section-headline.html       # Metric strip
        section-calendar.html       # Contribution calendar
        section-org-rollup.html     # Per-organization rollup
        section-languages.html      # Language shares
        section-reviews.html        # Reviews given
        section-contributed.html    # Externally contributed repositories
        section-orgs.html           # Public organization memberships
        section-pinned.html         # Pinned repositories
        section-socials.html        # Verified social accounts
        to-int.html                 # Guarded integer cast for remote-derived values
        compact-number.html         # Number formatting (1500 -> "1.5k")
        icon.html                   # Centralized SVG icon rendering
```
