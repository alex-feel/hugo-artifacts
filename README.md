# Hugo Artifacts

<p align="center">
  <img src=".github/images/banner.png" alt="Hugo Artifacts - reusable, style-agnostic Hugo modules (shortcodes, asset and utility modules) that ship semantic BEM markup and zero CSS and drop into any number of unrelated sites" width="100%">
</p>

[![CI](https://github.com/alex-feel/hugo-artifacts/actions/workflows/ci.yml/badge.svg)](https://github.com/alex-feel/hugo-artifacts/actions/workflows/ci.yml) [![Hugo](https://img.shields.io/badge/Hugo-0.160.0%2B_extended-ff4088?logo=hugo&logoColor=white)](https://gohugo.io/) [![Go](https://img.shields.io/badge/Go-1.22%2B-00ADD8?logo=go&logoColor=white)](https://go.dev/) [![GitHub License](https://img.shields.io/github/license/alex-feel/hugo-artifacts)](https://github.com/alex-feel/hugo-artifacts/blob/main/LICENSE) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/alex-feel/hugo-artifacts)

Public multi-module Hugo monorepo for reusable artifacts -- themes, shortcode libraries, asset libraries, utility modules, and other components shared across any number of unrelated Hugo sites.

The guiding principle is universality: every artifact is built to drop into any site and be styled to fit it, never to impose a look. Components ship DATA and semantic markup -- not design decisions -- so each consuming site owns its own presentation. See [Design Principles](#design-principles) for what that means and why.

Each artifact lives in its own subdirectory with an independent `go.mod`, making it independently importable and versionable.

## Design Principles

These artifacts are meant to be reused across many unrelated sites, so they avoid baking in any single site's look. The contract differs slightly by artifact kind, but the spirit is shared: ship what is stable and reusable (structure, data, behavior, accessibility) and leave what legitimately varies per site (visual presentation) to the consumer.

- **Style-agnostic by default.** The shortcode and component libraries (everything under [`shortcodes/`](shortcodes/)) emit semantic [BEM](https://getbem.com/) markup and ship **zero CSS** -- no `.scss`, no `.css`, no inline `<style>`, no hardcoded colors, and no dark-mode rules. The consuming site owns all visual styling (typically a site-side `assets/scss/_<name>.scss`).
- **Cross the styling boundary with data, not styles.** Components expose objective values as `data-*` attributes (for example `data-callout-type`, `data-video-id`) and, where a value must reach CSS, as a CSS custom-property _name_ the site defines (for example `style="--callout-tone: var(--callout-tone-danger)"` -- a pointer to a token, never a literal color). Class hooks follow BEM: the block is the component name, modifiers are `<name>--<modifier>`, and elements are `<name>__<part>`.
- **Icons are the one shipped visual, and they stay restyleable.** They render as inline SVGs using `currentColor` and `1em` sizing, so they inherit the consumer's text color and font size and can be restyled entirely from the site.
- **Universal, not opinionated.** Because no design decisions are shipped, one component drops into any number of sites and each styles it however it needs -- no specificity wars, no styles to override, and the site's own theme and dark-mode tokens flow straight through.

The payoff: you can build a design of any complexity on top of these artifacts without fighting styles they impose, because they impose none. For the authoring rules behind this contract, see the [shortcode module conventions](CLAUDE.md#shortcode-module-conventions) and [`CONTRIBUTING.md`](CONTRIBUTING.md#style-agnostic-output-shortcode-and-component-modules).

## Modules

Importable Hugo modules live under [`modules/`](modules/). Each module ships its own `README.md` with installation, configuration, and consumption instructions.

### `modules/seo`

Universal SEO module: one `{{ partial "seo/head.html" . }}` call emits the complete head surface (title, meta description, canonical, robots, hreflang, Open Graph, Twitter Cards, site verification, feed discovery) plus Google-eligible JSON-LD structured data (WebSite, Organization, WebPage, BreadcrumbList, Article/BlogPosting/NewsArticle, Product, ProfilePage, SoftwareApplication, VideoObject) cross-linked by `@id`. Reuses Hugo-native front-matter fields, adds a clean `seo.*` contract on top, validates strictly, and degrades gracefully. See [`modules/seo/README.md`](modules/seo/README.md).

### `modules/social-share`

Universal sharing bar: one `{{ partial "social-share/share.html" . }}` call (or the `social-share` shortcode) renders style-agnostic BEM markup with plain share-intent links for up to 28 networks -- X, Facebook, LinkedIn, Reddit, Bluesky, Threads, Mastodon, Telegram, WhatsApp, VK, and more -- plus JavaScript-revealed Web Share, copy-link, and print buttons. Zero CSS, zero third-party contact before a deliberate click, real-text accessible names, full i18n, a four-tier configuration cascade, and consumer-extensible network registry. See [`modules/social-share/README.md`](modules/social-share/README.md).

### `modules/pwa`

Consumer-facing Progressive Web App module: web app manifest, RealFaviconGenerator icon set, Workbox-powered service worker, install prompt, and push subscription wiring. See [`modules/pwa/README.md`](modules/pwa/README.md).

### `modules/workbox`

Vendor-mount companion that exposes [`github.com/GoogleChrome/workbox`](https://github.com/GoogleChrome/workbox) v7.4.1 source files as Hugo assets for `js.Build`. Imported transitively by `modules/pwa`; consumers do not import it directly but add it as a direct `go.mod` `require` to resolve the chain (no upstream replacement or vendoring needed) -- see [`modules/workbox/README.md`](modules/workbox/README.md).

### `modules/idb`

Vendor-mount companion that exposes [`github.com/jakearchibald/idb`](https://github.com/jakearchibald/idb) v8.0.3 source files as Hugo assets. Imported transitively by `modules/workbox` (and therefore by `modules/pwa`); consumers do not import it directly but add it as a direct `go.mod` `require` to resolve the chain (no upstream replacement or vendoring needed) -- see [`modules/idb/README.md`](modules/idb/README.md).

## Shortcodes

Reusable Hugo shortcode modules live under [`shortcodes/`](shortcodes/). Every one is style-agnostic -- semantic BEM markup, `data-*` attributes, and zero CSS (see [Design Principles](#design-principles)) -- so you style it to fit your site. Each ships its own `README.md` with installation, usage, parameters, and styling guidance.

### `shortcodes/github-repo`

Renders a GitHub repository link in one of five display variants (`inline`, `card`, `stats`, `lang`, `hero`) with API-driven metadata, header-aware retries, and graceful degradation. See [`shortcodes/github-repo/README.md`](shortcodes/github-repo/README.md).

### `shortcodes/hf-space`

Renders a Hugging Face Space link in one of five display variants (`inline`, `card`, `wide`, `stats`, `hero`) with Hub API-driven metadata (emoji, SDK, hardware, likes, live status, gradient colors), header-aware retries, and graceful degradation. The sibling of `shortcodes/github-repo`. See [`shortcodes/hf-space/README.md`](shortcodes/hf-space/README.md).

### `shortcodes/arxiv-paper`

Renders an [arXiv.org](https://arxiv.org/) paper reference in one of six display variants (`inline`, `card`, `wide`, `stats`, `hero`, `cite`) from the arXiv Atom API, with optional Semantic Scholar (one-sentence TLDR, resolved venue, citation count) and Hugging Face Papers (AI summary, keyword chips, code-repo badge, upvotes) enrichment, header-aware retries, and graceful degradation. Resolves subject codes to human-readable names from a shipped taxonomy map, and stamps volatile counts with a `data-arxiv-metrics-asof` freshness hook. Consuming sites must allow-list `application/atom+xml` in `security.http.mediaTypes` (one line, documented in the module README). See [`shortcodes/arxiv-paper/README.md`](shortcodes/arxiv-paper/README.md).

### `shortcodes/youtube-embed`

Privacy-first YouTube facade: renders only a same-origin, build-time-fetched poster plus a real play button, and injects the `youtube-nocookie.com` player only on click, so the page makes zero third-party contact before the visitor opts in. Supports `id`/`url` parsing (all common shapes plus `?t=` offsets), playlists, an explicit local poster override, arbitrary player-parameter passthrough, responsive same-origin `<picture>` posters, and a no-JavaScript fallback link. See [`shortcodes/youtube-embed/README.md`](shortcodes/youtube-embed/README.md).

### `shortcodes/callout`

Universal, unstyled paired admonition shortcode (`{{< callout "type" >}}...{{< /callout >}}`) with fifteen first-class types, true-synonym aliases, arbitrary custom-type passthrough, native `<details>` collapsibility, opt-in ARIA, and overridable icons. Also ships a blockquote render hook so GitHub-style `> [!NOTE]` alerts render as the same markup. Supersedes the legacy `notice` module. See [`shortcodes/callout/README.md`](shortcodes/callout/README.md).

## Examples

The [`examples/`](examples/) directory contains standalone reference implementations that pair with `modules/pwa`. They are not importable Hugo modules -- they are runnable push-notification backends meant to be deployed to a separate platform. See [`examples/README.md`](examples/README.md) for the catalog and [`examples/QUICKSTART.md`](examples/QUICKSTART.md) for a 5-minute end-to-end walkthrough.

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+ (extended edition)
- [Go](https://go.dev/) 1.22+

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, coding conventions, the Markdown one-line-per-paragraph rule, tagging and release conventions, and pull request guidelines.

## Getting Help

Have a question, found a bug, or want to request a feature? Open an issue using one of the [issue templates](https://github.com/alex-feel/hugo-artifacts/issues/new/choose) -- they prompt you for the details needed to help quickly.

## Security

Report security vulnerabilities privately via [GitHub Security Advisories](https://github.com/alex-feel/hugo-artifacts/security/advisories/new) rather than opening a public issue. See [`SECURITY.md`](SECURITY.md) for the full policy.

## License

Released under the [MIT License](LICENSE).
