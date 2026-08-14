# github-profile

Hugo shortcode module that renders a GitHub person-profile widget for presenting one's own GitHub activity and achievements: contribution totals, the contribution calendar, per-organization rollups, external-collaboration footprint, language depth, and optional identity and showcase sections. The module outputs style-agnostic semantic HTML with [BEM](https://getbem.com/) CSS class hooks and machine-readable `data-*` attributes, delegating all visual styling to the consuming site, plus a compact pure-Markdown rendering for markdown output formats (see [Markdown output variant](#markdown-output-variant)). It is built for self-presentation surfaces -- a portfolio, a team page, a speaker bio -- where the subject publishes their own public activity.

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
| `calendar` | Contribution calendar (heatmap) with per-day counts and quartile levels, a visible locale-formatted summary (total, unit, window), and a less-to-more legend |
| `org-rollup` | Per-organization contribution rollup: commits, issues, pull requests, reviews per owner |
| `languages` | Byte-weighted language shares over the repository set `language-scope` selects (default: the person's own non-fork repositories) |
| `reviews` | Pull request reviews given |
| `contributed` | Externally contributed repositories (not owned by the person), by stars |
| `orgs` | Public organization memberships |
| `pinned` | The person's pinned repositories |
| `socials` | Verified social accounts, LinkedIn first |

```go-html-template
{{</* github-profile user="octocat" sections="headline,calendar,contributed" */>}}
```

### Language scope

The `languages` section reports byte-weighted language shares, and `language-scope` decides which repositories it counts. The heading changes with the scope, so the claim and the data always describe the same set.

| Value | Repositories counted | Heading |
| --- | --- | --- |
| `owned` (default) | The person's own non-fork repositories, whole | `Languages by code volume` |
| `worked-in` | Those, plus external repositories the person has committed to or opened a pull request in, each scaled by the person's authorship share of its default branch | `Languages in repositories worked in` |

```go-html-template
{{</* github-profile user="octocat" language-scope="worked-in" */>}}
```

**Why the default is the narrow one.** GitHub reports language byte counts per REPOSITORY, never per contributor. Over repositories a person owns, those counts approximate what they wrote. Over repositories they merely touched, they do not, and the gap is not marginal: `repositoriesContributedTo` enrolls a repository on _any_ contribution, so filing a single issue on a 22 MB Go project would contribute 22 MB of Go to the chart. On a real profile that mechanism supplied 90.5% of the charted bytes and published `Go 20.7%` for someone who had never written a line of Go. The distortion grows with how useful a person is in other people's projects, and nothing in the output hints at it.

**How `worked-in` weights what it counts.** Narrowing the set is not enough on its own, because membership says nothing about size: the module asks for the external set through a second GraphQL connection restricted to `COMMIT` and `PULL_REQUEST`, so an issue-only or review-only repository contributes nothing under either scope, and then it scales every repository in that set by an authorship ratio `f = min(mine / all, 1)` -- the person's own commit count on the repository's default branch over that branch's total -- so a repository's bytes enter the row as `bytes × f` rather than whole. Owned repositories keep weight 1, which is the same whole-repository basis the default scope documents. GraphQL exposes no per-LANGUAGE authorship (and the REST contributor-statistics endpoint returns per-contributor line counts with no language split), so the per-REPOSITORY commit ratio is the closest attribution the API sells; the extra authorship query costs 1 rate-limit point (see Rate limits).

Three consequences of measuring the default branch are worth knowing. An **unmerged pull request** enrolls a repository in the set but weighs zero until it lands, which is correct: the byte counts being scaled describe only code on that branch. The ratio's numerator matches only commits whose **author email is linked** to the GitHub account, so squash-merge reattribution or an unlinked email undercounts it -- when the authorship query fails outright, the module falls back to the snapshot's contribution-window commit count for that repository (the same unit over a rolling year) rather than ever summing unweighted. And a repository with **no usable ratio at all** -- an empty default branch, or no numerator from either source -- is excluded from the row entirely, the same way restricted repositories are skipped, because a repository that cannot be weighted may not be counted whole.

Machine consumers read the scope from `data-language-scope` and the attribution model from `data-language-attribution` (`repository` or `authorship-weighted`) on the list, so the numbers are never presented without the question they answer.

## Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `user` | string | yes | -- | GitHub login of the person to present |
| `variant` | string | no | `card` | Section preset: `compact`, `card`, `full` |
| `sections` | string | no | preset | Comma-separated section tokens overriding the preset, rendered in order |
| `history` | string | no | `year` | Contribution window: `year` (rolling ~1-year window, GitHub's own profile framing) or `all` (all-time totals via one extra GraphQL request) |
| `language-scope` | string | no | `owned` | Which repositories the `languages` row measures: `owned` (the person's own non-fork repositories, whole) or `worked-in` (those plus repositories they have written code in, each scaled by the person's authorship share). The section's heading changes with it -- see Language scope |
| `show-streak` | bool | no | `false` | Compute current/longest contribution streaks and expose them on the calendar |
| `show-rank` | bool | no | `false` | Compute the transparent activity score (see Computed Metrics) |
| `merged-prs` | bool | no | `false` | Fetch the lifetime merged-PR count via one extra REST Search request |
| `avatar` | string | no | `fetch` | Identity-section avatar handling: `fetch` (build-time copy, placeholder on failure), `hotlink`, `none` |
| `name` | string | no | API | Display-name override (also used by the degraded identity chip) |
| `attribution` | bool | no | `true` | Render the `@login on GitHub` source line |
| `class` | string | no | -- | Additional CSS class(es) appended to the root element |

Validation:

- Omitting `user`, or passing a value that is not a well-formed GitHub login (alphanumerics and inner hyphens, at most 39 characters), fails the build with an error message.
- Passing an invalid `variant`, `history`, `avatar`, or `language-scope` value fails the build with an error message.
- Unknown `sections` tokens emit a warning and are ignored; if nothing valid remains, the variant preset applies.

## Authentication

The module calls the GitHub GraphQL API, which requires authentication for every request -- there is no anonymous tier. Without a token the module makes no API request at all and degrades to the identity chip.

### Setting up a token

1. [Create a personal access token](https://github.com/settings/tokens). A classic token with **zero scopes** suffices: scopes gate access to private data, not the rate-limit tier, and the widget reads only public data. Prefer it over a fine-grained token: an organization can restrict which fine-grained tokens may reach its resources, and a restricted token gets that organization's repository data withheld from the response rather than returned as public -- the widget then renders without the per-organization rollup (see Resilience and Retries). A classic zero-scope token is not subject to those per-organization restrictions.
2. Set the environment variable before running Hugo:

```bash
export HUGO_GITHUB_TOKEN="ghp_your_token_here"
hugo
```

The variable **must** be prefixed with `HUGO_`. Hugo's default security policy restricts `os.Getenv` to variables matching `^HUGO_` and `^CI$`. A variable named `GITHUB_TOKEN` (without the `HUGO_` prefix) will silently return an empty string.

When `HUGO_GITHUB_TOKEN` is unset, the module emits a single warn-only preflight message per build (deduplicated via `hugo.Store`) and every widget renders the identity chip. The build always continues.

## Rate limits

The GraphQL primary limit for a personal access token is 5,000 points per hour, and the module's snapshot query costs 3 points (measured), so even a site rendering dozens of profiles consumes a few percent of the hourly budget per build.

| Configuration | Requests per rendered profile |
| --- | --- |
| defaults | 1 GraphQL POST (cost: 3 points) |
| `history="all"` | 2 GraphQL POSTs, 4 points total (the year list is only known from the first response, and the year-blocks query costs 1) |
| `language-scope="worked-in"` | +1 GraphQL POST for the authorship counts (cost: 1 point; the repository list is only known from the snapshot) |
| `merged-prs="true"` | +1 REST Search GET (its own bucket: 30 requests/minute) |
| `avatar="fetch"` with `identity` active | +1 image GET to GitHub's avatar CDN (not the API budget) |

The Search API bucket is the tightest real constraint: a build rendering more than about 30 `merged-prs` profiles within a minute will see that metric degrade on the overflow. Hugo caches remote responses to disk (`caches.getresource`), so repeated builds do not re-fetch until the consuming site's cache expires.

## Resilience and Retries

Each API call is wrapped in the same outer retry loop with header-aware error classification as the sibling [`github-repo`](../github-repo/) module: 5 attempts per endpoint, 30s per-attempt timeout, a 120s wall-clock budget per endpoint, per-attempt cache keys so a cached error response cannot poison later attempts, early breaks on provably-useless error classes (`primary-rate-limit`, `auth`, `not-found`, and a `secondary-rate-limit` whose reset exceeds the remaining budget), and a host-down circuit breaker (`hugo.Store` sentinel) so a full API outage costs the build roughly one budget instead of one per call site. The constants are baked into `fetch.html` and are not exposed as parameters. See the `github-repo` README for the full class taxonomy and rationale; this module reuses the contract with `github-profile:`-namespaced store keys.

One correctness rule is GraphQL-specific: the GraphQL endpoint reports failures as HTTP 200 with a `{data, errors}` envelope, and an unknown login arrives as a null user block, not a 404. The retry loop therefore handles only transport-level failures; after it succeeds, the envelope is inspected exactly once, and an envelope-level failure (unknown user, insufficient scopes, GraphQL rate limit) is classified and degraded without retrying -- it is an authoritative API answer that a retry within the same build cannot change. HTTP status alone is never trusted.

The snapshot also isolates the blast radius of organization token policies structurally: it queries the user through two aliased `user()` blocks in the same POST, with the four per-repository contribution lists in their own block. Those lists are the only place where a repository object hangs off a fully non-null schema path (`ContributionsCollection!` to `[XContributionsByRepository!]!` to `repository: Repository!`), so a repository the token may not read cannot be nulled in isolation there -- the null propagates up to the whole user. Everywhere else, repositories and organizations arrive as items of nullable node lists, where a restricted entry nulls only itself. Isolating the lists behind their own alias therefore stops the propagation at that alias, and the widget still renders everything except the per-organization rollup. The split is data-equivalent to a single-block query at the same 3-point cost.

### Interplay with Hugo's render timeout

Hugo aborts any page whose render exceeds the site-level `timeout` setting (default `60s`), and every second this module spends fetching counts toward the clock of the page being rendered. During a full API outage the first fetching call site can spend up to 120s (240s with `history="all"` if the host dies between the two GraphQL requests) before it degrades. Give a consuming site that renders profile widgets comfortable margin:

```toml
timeout = '300s'
```

## Graceful Degradation

When a fetch cannot run or exhausts its retries, the module does not break the build. It logs one structured warning per failed endpoint and degrades:

- **No token, unknown user, rate limit, host down, or any snapshot failure:** the widget renders the zero-API identity chip (name or login, linked to the GitHub profile) with the `github-profile--degraded` modifier and a `data-state` attribute naming the reason.
- **`history="all"` follow-up failure:** totals fall back to the rolling-year window; `data-history` stays `year`.
- **Authorship query failure (`language-scope="worked-in"`):** the language row weights each contributed repository by the snapshot's contribution-window commit count instead of the all-time authorship count, and a repository with no usable ratio from either source is excluded; the row is never summed unweighted. `data-language-attribution` stays `authorship-weighted`, because only the numerator's source degraded.
- **`merged-prs` failure:** the merged-PR metric is hidden; the authored-PR count renders with its honest label.
- **Avatar fetch failure:** the placeholder person icon renders instead of the image.
- **Organization-restricted token:** when an organization policy withholds the per-repository contribution lists (their aliased query block arrives null), the widget renders every other section and warns once; only the per-organization rollup is omitted.
- **Partial GraphQL data:** a resolved user block with a non-empty `errors` array renders every section whose data resolved and warns once; a section whose data is missing -- including individual repository, organization, or pinned-item nodes the token cannot see, which the API returns as null entries -- is omitted or skipped, never broken.

## Computed Metrics

Everything beyond raw API fields is computed at build time from data already fetched:

- **Per-organization rollup** groups the four per-repository contribution lists by repository owner (the person's own account excluded) into per-owner commits, issues, pull requests, and reviews. Scoped to the contribution window and to the API's 100-repositories-per-type ceiling.
- **External footprint** counts repositories the person does not own (`repositoriesContributedTo` with `includeUserRepositories: false`) and the distinct organizations among their owners.
- **90-day recency** counts active days and total contributions over the trailing 90 calendar days.
- **All-time totals** (`history="all"`) sum one aliased `contributionsCollection` block per contribution year; each block spans one calendar year, respecting the API's 1-year span limit.
- **Language shares** aggregate per-repository language byte counts over the set `language-scope` selects -- the person's own non-fork repositories by default, plus authorship-weighted contributed repositories under `worked-in` -- normalized to percentages. See [Language scope](#language-scope) for what each set does and does not claim. Every share renders with **exactly one decimal place**, whatever the value: a whole-number share prints `44.0%`, never `44%`, so the row is one format for anything reading it as a set. The top eight languages by byte volume are listed; a language whose share rounds below `0.05%` renders `0.0%` and KEEPS its entry rather than being dropped, because the row is a measurement and its presence is itself the signal that the language is there at all -- a site that would rather hide those can select them exactly, on `[data-pct="0.0"]`, which is only possible because the format is uniform.
- **Streaks** (`show-streak="true"`) walk the contribution calendar: the current streak is the consecutive run ending today (or yesterday when today has no contribution yet); the longest streak is the historical maximum run.
- **Activity score** (`show-rank="true"`) is the [github-readme-stats](https://github.com/anuraghazra/github-readme-stats) formula, computed transparently: commits, pull requests, issues, and reviews through `1 - 2^(-x/median)`; stars and followers through `x/(x+median)`; weights 2/3/1/1/4/1; medians 250 (1,000 for all-time commits), 50, 25, 2, 50, 10; the weighted percentile maps to levels S through C at thresholds 1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100. It is off by default because composite scores are gameable vanity; when you enable it, the formula above is the whole story -- no black box. The percentile reaches `data-rank-percentile` rendered to **one decimal place** whatever the value, for the same reason the language shares are: a bare float prints its shortest form, and a percentile landing on a whole number would publish `8` where every other profile publishes `7.4`.

## Data Honesty and Limits

- **Every total is a floor, not a ceiling.** Private contributions surface only as an aggregate count (`restrictedContributionsCount`), and only when the person opted into showing private activity; concealed organization memberships never appear; private-repository detail is invisible to any third-party token at any scope. A low number never proves low output.
- **The default PR number counts authored pull requests** in the contribution window, not merged ones; the label says so. A strictly merged lifetime count requires `merged-prs="true"`.
- **Language bytes belong to repositories, not to people.** GitHub publishes no per-contributor language breakdown at all, so every share here is a repository's byte count standing in for a person's. The default scope keeps that substitution defensible by counting only repositories the person owns; `language-scope="worked-in"` widens the set, relabels the section, and scales each contributed repository by the person's share of its default-branch commits -- a per-repository ratio, not per-language authorship, and one that undercounts when commit emails are unlinked or squash merges reattribute work. Neither scope is a true measure of authorship, and the `contributed` section and external-footprint counts deliberately answer a different question -- they count every repository worked in, an issue-only one included, which is why those numbers and the language row can disagree.
- **GitHub's native achievement badges (Pull Shark, Galaxy Brain, and the rest) are not exposed by any GitHub API.** The module does not scrape profile HTML and does not fake badges.
- **Counts are inflatable and deflatable.** Commit generators can fabricate activity, while squash merges, unlinked commit emails, and non-default-branch work make real activity undercount. The widget presents activity evidence, not a productivity score.
- **Logins are mutable.** A renamed account frees its old login for someone else. The widget records the immutable account id in `data-user-id`; update the `user` parameter promptly after a rename.
- **The output is a build-time snapshot** of public data the person already publishes on their GitHub profile; it refreshes when the site rebuilds.

## Localization

All UI strings resolve through i18n keys shipped in the module's `i18n/` directory (English and Russian included). Every lookup falls back to the English string, so a site language without translations still renders correctly. Override any key in the consuming site's own `i18n/<lang>.toml`.

Sentence-shaped plural-table keys receive a map with two entries: `count` selects the `one`/`few`/`many`/`other` form per the language's CLDR rules, and `formatted` carries the same number already grouped for the locale. **Interpolate `{{ .formatted }}`, never `{{ .count }}`**, in both the shipped tables and any site override. The bare unit-word tables are the exception: `github_profile_calendar_unit` and the four `github_profile_org_stat_*` keys receive the raw count alone (it only selects the plural form), contain no interpolation, and render next to a number the template formats separately. Hugo's translation templates have no function map -- a table cannot call `lang.FormatNumber` itself (the lookup fails and silently falls back to the module default) -- so the module preformats the number and passes it in.

| Key | English value | Used for |
| --- | --- | --- |
| `github_profile_attribution_suffix` | `on GitHub` | Source line suffix after the `@login` element |
| `github_profile_hireable` | `Open to opportunities` | Identity hireable badge |
| `github_profile_metric_commits` / `_prs` / `_merged_prs` / `_reviews` | `commits` / `pull requests (authored)` / `merged pull requests` / `pull request reviews given` | Metric labels |
| `github_profile_metric_external_repos` / `_external_orgs` | `external repositories` / `organizations` | Metric labels |
| `github_profile_metric_recent_days` | `active days in the last 90` | Recency metric label |
| `github_profile_sep` | `", "` (comma plus space) | Text-layer separator between headline metric groups and between org-rollup stats |
| `github_profile_note_sep` | `" — "` (spaced em dash) | Text-layer separator before the private-floor note |
| `github_profile_org_stat_commits` / `_prs` / `_issues` / `_reviews` | `commits` / `pull requests` / `issues` / `reviews` (plural forms) | Unit words on the org-rollup stats (the number renders separately, compact-formatted) |
| `github_profile_member_years` | `{{ .formatted }} years on GitHub` (plural forms) | Identity tenure line |
| `github_profile_calendar_label` | `{{ .formatted }} contributions` (plural forms) | Calendar `aria-label` |
| `github_profile_calendar_unit` | `contributions` (plural forms) | Unit word in the visible calendar summary (the number renders separately, locale-formatted) |
| `github_profile_calendar_period` | `last 12 months` | Window element in the visible calendar summary |
| `github_profile_calendar_less` / `_more` | `Less` / `More` | Calendar legend labels |
| `github_profile_restricted_note` | `plus {{ .formatted }} private contributions` (plural forms) | Private-floor note |
| `github_profile_streak_current` / `_longest` / `_days` | `current streak` / `longest streak` / `{{ .formatted }} days` (plural forms) | Streak labels |
| `github_profile_languages_label` / `_org_rollup_label` / `_contributed_label` / `_orgs_label` / `_pinned_label` / `_socials_label` | `Languages by code volume` / `Contributions by organization` / `Contributes to` / `Organizations` / `Pinned repositories` / `Elsewhere` | Section `aria-label`s |
| `github_profile_languages_worked_in_label` | `Languages in repositories worked in` | Replaces `_languages_label` under `language-scope="worked-in"`; an override must keep saying that the unit is the repository rather than the person's code |
| `github_profile_rank_label` | `activity score` | Activity score label |

## Styling

The module outputs unstyled semantic HTML. All visual presentation is the consuming site's responsibility.

### CSS hooks

Every element uses BEM naming under the `github-profile` block:

- **Block:** `github-profile` (root `<article>` element)
- **Modifiers:** `github-profile--compact`, `github-profile--card`, `github-profile--full`, `github-profile--degraded`
- **Section wrappers:** `github-profile__section` plus `github-profile__section--<token>` per section, and `github-profile__section-title` for the list sections' visible heading
- **Elements:** `github-profile__metric`, `github-profile__metric-value`, `github-profile__metric-label`, `github-profile__floor-note`, `github-profile__rank`, `github-profile__calendar`, `github-profile__calendar-summary`, `github-profile__calendar-total`, `github-profile__calendar-total-value`, `github-profile__calendar-total-unit`, `github-profile__calendar-period`, `github-profile__calendar-week`, `github-profile__calendar-day` (plus `--legend`), `github-profile__calendar-legend`, `github-profile__calendar-legend-label`, `github-profile__streak`, `github-profile__languages`, `github-profile__lang`, `github-profile__lang-label`, `github-profile__lang-pct`, `github-profile__org-rollup`, `github-profile__org-roll`, `github-profile__org-roll-name`, `github-profile__org-roll-stat`, `github-profile__org-roll-stat-unit`, `github-profile__sep` (plus `--note`), `github-profile__contributed`, `github-profile__repo`, `github-profile__repo-name`, `github-profile__repo-stat`, `github-profile__repo-lang`, `github-profile__repo-description`, `github-profile__orgs`, `github-profile__org`, `github-profile__org-name`, `github-profile__pinned`, `github-profile__pinned-item`, `github-profile__socials`, `github-profile__social-item`, `github-profile__avatar` (plus `--placeholder`), `github-profile__identity-body`, `github-profile__name`, `github-profile__login`, `github-profile__badge`, `github-profile__bio`, `github-profile__status`, `github-profile__meta-item`, `github-profile__attribution`, `github-profile__attribution-icon`, `github-profile__attribution-login`, `github-profile__attribution-suffix`, `github-profile__degraded-chip`, `github-profile__icon`

The calendar summary renders the total, the pluralized unit word, and the window as separate child elements with no separator baked in, so the site composes them (for example, a `·` via a `::before` on `github-profile__calendar-period`) or hides any of them. Its value and unit carry their own classes rather than the headline strip's `github-profile__metric-value` and `github-profile__metric-label`, because headline numbers are abbreviated (`1.5k`) while the calendar total is written in full with locale grouping (`6,759`) -- one site rule should not have to style both formats. Hiding the summary is safe for assistive technology: the grid keeps a self-sufficient accessible name carrying the same formatted total. The legend cells reuse `github-profile__calendar-day` with the same custom-property indirection as the grid, so the site's palette applies to them automatically; the `--legend` modifier and `aria-hidden` container distinguish them from data cells. That inheritance covers color only, not size: both the grid cells and the legend swatches are `<span>` elements with no module-supplied box, and a grid cell gets its dimensions from whatever layout the site gives the week column, which the legend row does not share. Give the legend swatches their own box (for example `display: inline-block` plus the cell size) when styling them.

The headline strip and the org-rollup stats separate their groups in the text layer, not only visually: a `github-profile__sep` element carrying a real comma plus space renders between metric groups and between org-rollup stats, a `github-profile__sep--note` element carrying a real spaced em dash renders before the private-floor note, and every org-rollup stat carries its unit word as real text in `github-profile__org-roll-stat-unit`. Without them, an HTML-to-text extractor reads the strip as one glued run (`...active days in the last 90plus 7,880 private contributions...`) and the org stats as bare numbers (`langchain-ai 1 1 10`), and the unit words fix a WCAG 1.3.1 gap because the stat icons are `aria-hidden`. A site that draws its own dividers (flex gap plus `::before` rules) clip-hides the separator elements -- hide them with the visually-hidden clip pattern, never `display: none`, so the text layer keeps its boundaries; the unit words can be clip-hidden the same way when the visual design wants icon-only stats.

Each list section (`org-rollup`, `languages`, `contributed`, `orgs`, `pinned`, `socials`) opens with a `github-profile__section-title` paragraph carrying the section's localized label and a `data-section` token, so a site styles real text instead of fabricating a heading from the list's `aria-label` with `attr()`. It is a neutral `<p>`, not a heading element, because the module cannot know the host page's outline level. It is `aria-hidden` because it restates verbatim the accessible name the adjacent list already carries; that is the module's rule for pure restatements (this title, the calendar legend), while text adding information its neighbor does not convey stays announced (the calendar summary). Hide it with CSS if the site supplies its own heading. In the identity section, `github-profile__identity-body` wraps every non-avatar field, so an avatar-beside-text layout is a single flex rule. In the attribution line, the icon, the `@login`, and the localized suffix are separate elements inside one anchor, so a site can split them across the line (for example, `display: flex; justify-content: space-between` on the anchor) or hide the suffix for a bare handle.

### CSS custom properties

The calendar day cells and language items carry only custom-property indirections and measured values -- never color choices:

- `--github-profile-day-level` on each `github-profile__calendar-day` points at a site-defined `--github-profile-level-0` through `--github-profile-level-4` token, mapped from GitHub's quartile enum.
- `--github-profile-lang-share` on each `github-profile__lang` carries the measured percentage (e.g., `42.1%`) for bar-width styling. It is the same one-decimal string the item prints and the same one `data-pct` carries, formatted once where the share is derived, so the three can never disagree. It is deliberately locale-independent -- `lang.FormatPercent` would render a comma decimal separator in most locales, which is invalid in a CSS value and unparseable in a data attribute.

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
| `data-raw` | calendar summary total | Unformatted integer total (the visible text is locale-formatted) |
| `data-current-streak`, `data-longest-streak` | calendar (opt-in) | Streak day counts |
| `data-date`, `data-count`, `data-level` | calendar days | ISO date, raw count, quartile enum (`NONE` ... `FOURTH_QUARTILE`) |
| `data-level` | calendar legend cells | Quartile enum, one cell per level |
| `data-legend` | calendar legend labels | `less`, `more` |
| `data-section` | list-section titles | Section token (`org-rollup`, `languages`, `contributed`, `orgs`, `pinned`, `socials`) |
| `data-language-scope` | language list | Which repositories the shares measure: `owned` or `worked-in` (see [Language scope](#language-scope)) |
| `data-language-attribution` | language list | How repository bytes are attributed to the person: `repository` (whole byte counts) or `authorship-weighted` (contributed repositories scaled by the person's share of default-branch commits) |
| `data-lang`, `data-pct` | language items | Language name and share; `data-pct` is the printed percentage without the sign, always one decimal place (`44.0`, `0.7`, `0.0`) |
| `data-org`, `data-owner-type`, `data-commits`, `data-issues`, `data-prs`, `data-reviews`, `data-total` | rollup items | Owner login, `Organization`/`User`, per-type and total counts |
| `data-repo`, `data-stars`, `data-lang` | contributed/pinned items | Repository identification and stats |
| `data-owner-type` | contributed items only | Owner type (`Organization`/`User`) |
| `data-avatar` | org items | Organization avatar URL (for site-side rendering) |
| `data-provider` | social items | Provider enum (`LINKEDIN`, `TWITTER`, ...) |
| `data-rank-level`, `data-rank-percentile` | rank (opt-in) | Score level and percentile; the percentile always carries one decimal place (`8.0`, `7.4`), so it is one format across every profile a consumer reads |
| `data-meta` | identity meta items | `company`, `location`, `website`, `tenure`, `pronouns`, `status` |
| `data-badge` | identity badge | `hireable` |
| `data-streak` | streak spans | `current`, `longest` |

### Icons

All icons are inline SVGs (GitHub Octicons, MIT license) using `fill="currentColor"` (inherits text color), `aria-hidden="true"`, `focusable="false"`, and `width="1em" height="1em"` (scales with font size). No external icon fonts are required.

## Markdown output variant

The module ships `layouts/_shortcodes/github-profile.markdown.md` alongside the HTML shortcode. Hugo's output-format-aware shortcode template lookup selects it automatically whenever a page renders in a markdown output format -- for example when a markdown-format page template calls `.RenderShortcodes` -- so Markdown surfaces receive a compact one-line citation instead of the widget HTML.

The rendering is pure Markdown with no HTML tags, BEM classes, or SVG: a profile link in the form `[github.com/octocat](https://github.com/octocat)`, followed -- only when the GraphQL fetch succeeded -- by the headline metric sentence built from the same derive data, i18n labels, and separators as the HTML metric strip, for example `[github.com/octocat](https://github.com/octocat): 2.4k commits, 699 merged pull requests, 15 external repositories, 11 organizations, 79 active days in the last 90 — plus 7,880 private contributions`. When the fetch failed or was rate-limited, the line degrades to the bare profile link, which derives from the `user` parameter alone.

The variant calls the same cached fetch and derive partials with the same arguments as the HTML entry template, so it adds no network requests and the fetch layer's warning deduplication covers both output formats. The `variant`, `sections`, `avatar`, `attribution`, and `class` parameters shape only the HTML widget and are accepted but ignored here; parameter validation lives in the HTML entry template, which renders the same page in the HTML output format and stops the build with `errorf` on a missing or malformed `user`.

## Validation

The module cannot build standalone -- Hugo builds require a consuming site -- so [`test/`](test/) ships a fixture site plus Node build-output assertions. The fixture is fully offline: it shadows `github-profile/fetch.html` with a canned payload, so `derive.html`, `render.html` and every section partial run for real with no network access and no `HUGO_GITHUB_TOKEN`.

It is the only suite in this repository that builds with `--minify`, and that is the point of it. The strip's separators carry their punctuation and spacing as real text inside dedicated elements so an HTML-to-text extractor reads the metrics as sentences rather than as one glued run -- and a whitespace defect in that text layer is **invisible in an unminified build**, because Hugo's minifier is what relocates and deletes the spacing. The suite therefore builds the same fixture twice, plainly and with `--minify`, and asserts the published bytes of both. Run it with Node.js 22+:

```bash
bash shortcodes/github-profile/test/run-tests.sh   # or run-tests.cmd on Windows
```

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
      github-profile.markdown.md    # Markdown output variant: profile link + metric sentence
    _partials/
      github-profile/
        build-query.html            # GraphQL query assembly (snapshot + per-year + authorship blocks)
        fetch.html                  # Endpoint orchestration, retry loops, envelope inspection
        fetch-once.html             # Single-attempt fetch (normalized result dict)
        classify-error.html         # HTTP error -> (errorClass, waitHintSeconds, errorMessage)
        derive.html                 # Computed metrics (rollups, recency, shares, streaks, score)
        render.html                 # Root element + section dispatch + degraded chip
        section-title.html          # Visible localized heading for the list sections
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
  test/                             # Validation suite: two builds of one offline fixture. See test/README.md.
```
