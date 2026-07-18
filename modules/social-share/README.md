# social-share

Universal, style-agnostic sharing bar for Hugo: one partial (or shortcode) renders a `<nav>` of plain share-intent links for up to 28 networks plus JavaScript-revealed Web Share, copy-link, and print buttons. The module emits semantic HTML with [BEM](https://getbem.com/) class hooks and `data-*` attributes and ships **zero CSS** -- no stylesheets, no colors, no dark-mode rules -- so the consuming site owns every visual decision. It is also privacy-first by construction: the baseline is static `<a href>` intent links, so the page makes **zero third-party contact** before a visitor deliberately clicks a share link (no SDK widgets, no trackers, no share counts -- the pre-click data transmission of embedded social widgets is exactly what the CJEU's Fashion ID ruling made a consent liability).

Sharing works without JavaScript; scripting only adds what genuinely needs it (the Web Share API, the clipboard, printing) and a tracker-free `CustomEvent` surface for the site's own analytics.

## Installation

Add the module to your site's Hugo configuration:

```toml
[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/social-share"
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/social-share
```

Confirm resolution with `hugo mod graph`.

**Important -- template lookup precedence:** a file with the same path in your site (for example `layouts/_partials/social-share/icon.html` or `assets/js/social-share.js`) overrides the module's version. That is the supported way to replace icons or behavior -- and a reason to check those paths if output looks unexpected.

For local development against a checkout of this repository, use a `hugo.work` workspace or `[module.replacements]` as described in the [repository README](../../README.md).

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+ (any edition)
- [Go](https://go.dev/) 1.22+

## Usage

The PRIMARY surface is the partial. Place one line in a layout, typically `single.html` below the content:

```go-html-template
{{ partial "social-share/share.html" . }}
```

The dot MUST be the current Page; passing anything else is the module's single build-failing error. For call-site overrides, pass an options dict whose `page` key is the current Page:

```go-html-template
{{ partial "social-share/share.html" (dict
  "page" .
  "networks" (slice "x" "telegram" "copy")
  "heading" "Share this post"
) }}
```

Inside content, use the shortcode (named parameters, plus one positional shorthand for `networks`):

```text
{{</* social-share */>}}
{{</* social-share "x,telegram,copy" */>}}
{{</* social-share networks="x,telegram,copy" heading="Share this" new_tab="false" */>}}
```

Per-page front matter uses the same keys under one `social_share` map:

```yaml
social_share:
  networks: [x, mastodon, copy]
  hashtags: [hugo, opensource]
  image: cover.png
```

Kill switches: `params.social_share.enable = false` disables the module site-wide; `social_share.disable: true` disables it for one page.

Only the entry contract above is public API. Internal partials can change between minor versions, though same-name site-level overrides remain supported by Hugo's lookup order.

## Networks

Canonical slugs and aliases, what each intent sends, and the caveats you accept by enabling it. "Title + URL" means both values travel in one text field. Endpoints were verified against official or authoritative sources as of 2026-07-10; entries marked _community-verified_ have no current official documentation.

| Slug | Aliases | Sends | Caveats |
| --- | --- | --- | --- |
| `x` | `twitter` | title, URL, `via`, `hashtags` | Composer caps posts at 280 characters (URLs count as 23 via t.co). |
| `facebook` | `fb` | URL only | Preview is built from your Open Graph tags; prefilled text is not supported. |
| `linkedin` | -- | URL only | Preview is OG-driven and cached (refresh via LinkedIn Post Inspector). |
| `reddit` | -- | URL, title | Sends `type=LINK` to force link-post mode. Login wall. |
| `bluesky` | -- | title + URL | 300 Unicode graphemes INCLUDING the URL; no automatic link card. |
| `threads` | -- | title, URL | Official Meta web intent on threads.com. |
| `mastodon` | -- | title + URL | Default: the official sharer at share.joinmastodon.org, which remembers the visitor's instance and takes the text in a URL fragment (it never reaches any server). Set `mastodon_instance` to post via one instance's `/share` endpoint instead (the text then reaches that instance as a query parameter). |
| `telegram` | -- | URL, title | Visitor picks the chat and can edit the text. |
| `whatsapp` | -- | title + URL | Official wa.me click-to-chat form without a phone number. |
| `viber` | -- | title + URL | `viber://` app scheme: works only where the Viber app is installed. No `target`/`rel`. |
| `line` | -- | URL, title | The `text` parameter is widely used but undocumented by LINE. |
| `sms` | -- | title + URL | `sms:?body=` -- the one form modern iOS and Android both accept. Mobile-only. No `target`/`rel`. |
| `email` | -- | subject = title, body = title + URL | RFC 6068 `%20` encoding; no `target`/`rel` on `mailto:`. |
| `pinterest` | -- | URL, image, description (falls back to title) | Save-style label. An image is effectively required for a good pin (min 100x200 px); the module warns once per page when none resolves. Description caps at 500 characters. |
| `tumblr` | -- | URL, title, caption = description, tags = `hashtags` | Login wall. |
| `hackernews` | `hacker-news`, `hn` | URL, title | Long-stable bookmarklet endpoint; login wall. _Community-verified._ |
| `flipboard` | -- | URL, title | Login wall. _Community-verified._ |
| `xing` | -- | URL only | Preview is OG-driven; XING no longer documents its share endpoint. _Community-verified._ |
| `nextdoor` | -- | body = title + URL, source = your site hostname | Official ShareKit; 3500-character limit. |
| `truthsocial` | `truth-social` | title, URL | Official publisher docs; 500-character limit. |
| `vk` | -- | URL, title, comment = description, image | -- |
| `odnoklassniki` | `ok` | URL, title, image | Image grabbing restricted for untrusted domains (min 128x128 px). |
| `weibo` | -- | URL, title, image | -- |
| `naver` | -- | URL, title | _Community-verified._ |
| `instapaper` | -- | URL, title, description | Save-style label; login wall. |
| `farcaster` | -- | text = title, embeds[] = URL | 1024-byte cast limit. |
| `microblog` | `micro-blog` | title + URL | _Community-verified._ |
| `lemmy` | -- | URL, title | No central instance: renders only when `lemmy_instance` is set. |

The module never truncates your title to fit a network's cap: every composer shows the over-limit state and lets the visitor edit, which beats silently amputated text.

### JavaScript-revealed buttons

Three pseudo networks render as `<button>`s inside `hidden` list items and are revealed only when the capability exists, so nobody ever sees a dead control:

| Slug | Aliases | Revealed when | Does |
| --- | --- | --- | --- |
| `webshare` | `web-share`, `native` | `navigator.share` exists (Chrome, Edge, Safari, Firefox Android; not Firefox desktop) | Opens the operating system share sheet with the page title, URL, and description. |
| `copy` | `copy-link`, `copy-url`, `clipboard` | `navigator.clipboard` on a secure context | Copies the page URL; announces success in a live region and sets a temporary copied state class. |
| `print` | -- | JavaScript runs | Calls `window.print()`. |

Web Share and copy-link deserve their default first-class placement: measured share-button click-through is around 0.2 percent while roughly 80 percent of real-world sharing is copy-pasted links ("dark social"), so the copy and native-share paths are where sharing actually happens.

### Networks that cannot be supported

Facebook Messenger requires a registered Meta `app_id`; Instagram, TikTok, Snapchat, KakaoTalk, Zalo, and WeChat have no plain-URL web share endpoint (SDK or app only); Pocket, Skype, Buffer, and Google+ are shut down; Digg's relaunch has no stable submit intent. On mobile, the `webshare` button reaches all of the installed ones through the system share sheet -- that is the supported route.

## Configuration

Every key lives in [`data/social-share/defaults.toml`](data/social-share/defaults.toml) and can be overridden at three higher tiers. Precedence, highest first: call-site dict args > page front matter (`social_share` map) > site `[params.social_share]` > module defaults. Presence wins at every tier, so an explicit `false` or empty value overrides the tier below it -- except for `image`, which resolves through the fall-through chain described below this table, where an empty value simply yields to the next candidate.

```toml
[params.social_share]
networks = ["webshare", "copy", "x", "facebook", "linkedin", "bluesky", "threads", "mastodon", "telegram", "whatsapp", "reddit", "email"]
new_tab = true
heading = ""
aria_label = ""
via = ""
hashtags = []
image = ""
mastodon_instance = ""
lemmy_instance = ""
```

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `networks` | list or comma-separated string | the 12 slugs above | Targets rendered, in list order. |
| `new_tab` | bool | `true` | `target="_blank"` on web share links, plus a hidden "(opens in a new window)" hint in each link's accessible name. Scheme links (`mailto:`, `sms:`, `viber:`) never get a target. |
| `heading` | string | `""` | Visible heading above the list (inline Markdown allowed). Empty renders no heading. |
| `aria_label` | string | `""` (localized "Share this page") | Accessible name of the `<nav>` landmark. |
| `via` | string | `""` | X attribution username; a leading `@` is stripped. |
| `hashtags` | list or comma-separated string | `[]` | Tags for x/tumblr; leading `#` stripped. Never auto-derived from page tags. |
| `image` | string | `""` | Site-wide fallback share image for pinterest/vk/odnoklassniki/weibo (asset path or URL). |
| `mastodon_instance` | string | `""` | Bare hostname (for example `mastodon.social`); switches Mastodon from the official fragment sharer to that instance's `/share`. |
| `lemmy_instance` | string | `""` | Bare hostname; required for the `lemmy` target. |

Share data (`url`, `title`, `description`) defaults to the page's `.Permalink`, `.Title`, and `.Description` and can be overridden per page (`social_share.url` and so on) or per call. The share image resolves in this order: explicit `image` value > first entry of the page's `images` front matter, used only when it is a plain path/URL string (a map-shaped entry such as `images: [{src: cover.png}]` falls through) > a page-bundle image resource matching `*feature*` / `*cover*` / `*thumbnail*` > site-tier `image`. Every raw value resolves the same way: page resource, then global `assets/` resource, then literal URL (the site-tier value skips the page-resource step).

### Custom networks (`networks_extra`)

Add a target the registry lacks -- or patch a built-in -- without forking the module:

```toml
[params.social_share.networks_extra.myservice]
label = "MyService"
endpoint = "https://myservice.example/share"
take = ["u=url", "t=title"]
```

`take` maps query-parameter names to value tokens: `url`, `title`, `titleurl` (title + space + URL), `description`, `description_or_title`, `image`, `via`, `hashtags`, `site` (your hostname). `fixed` sets literal parameters the same way. Both accept a map, but use the `"param=token"` string-list form shown above: Hugo lowercases map keys in site params, which would corrupt case-sensitive parameter names such as `canonicalUrl`. Optional fields: `label_key` / `label_default` (accessible-name i18n), `icon` (a built-in icon name; for an own glyph override `layouts/_partials/social-share/icon.html`), `mode = "fragment"` (join parameters with `#` instead of `?`).

Patching a built-in follows Hugo's `merge` semantics, which deep-merge maps only. When both the built-in field and yours are maps, the patch is per key: a map-form `take`/`fixed` adds or overrides individual entries and never deletes a key -- though overriding a `take` token to an empty or unknown value drops that parameter from the rendered href, because parameters whose token resolves to no value are omitted. The string-list form is not a map, so it replaces the built-in field wholesale: list exactly the parameters you want. The same wholesale replacement applies against the two built-ins that store `take` as a list themselves (`tumblr`, `odnoklassniki`) and to every scalar field (`label`, `endpoint`, `mode`). For a clean slate, define your own fresh slug instead of patching a built-in: a full redefinition inherits nothing.

Endpoint schemes are allowlisted: anything other than `https`, `mailto`, `sms`, or `viber` (including plain `http` and `javascript:`) is skipped with a one-time build warning. Instance hostnames (`mastodon_instance`, `lemmy_instance`) must be bare hostnames -- values with slashes, `@`, `?`, or `#` are rejected the same way, so front-matter-tier input cannot redirect shares to an attacker-chosen host.

A `networks_extra` slug always wins: an entry named like a built-in alias (for example `hn` or `twitter`) replaces that alias for your site -- the alias table is consulted only for slugs that have no direct registry entry.

## Parameters

Accepted by both the partial (dict keys) and the shortcode (named parameters); the shortcode additionally takes `networks` as positional parameter 0.

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | Page | partial dict only | -- | The current Page (the bare-Page call form passes it implicitly). |
| `networks` | list (partial) / comma-separated string | no | cascade | Targets, in order. |
| `heading`, `aria_label`, `via`, `hashtags`, `image`, `mastodon_instance`, `lemmy_instance`, `new_tab` | as above | no | cascade | Call-site overrides of the same-named config keys. |
| `url`, `title`, `description` | string | no | page values | Share-data overrides. |
| `class` | string | no | `""` | Extra class(es) appended to the root element. |
| `id` | string | no | `""` | `id` attribute on the root element. |

### Validation

- The module's ONE `errorf`: calling the partial without the current Page (a wiring mistake in a layout).
- Deduplicated one-time `warnf` (the build never breaks): unknown network slug; endpoint scheme outside the allowlist; malformed `mastodon_instance`/`lemmy_instance`; `lemmy` requested without an instance; Pinterest enabled with no resolvable image (per page); a non-map `social_share` value in site params or front matter (ignored -- use the `enable`/`disable` switches); missing module data file or script asset (broken installation).
- Silent: empty optional values (a page without a description simply sends fewer parameters); an empty resolved network list renders nothing at all.
- Titles and descriptions are collapsed to a single line (runs of whitespace become one space) and every variable value is URL-encoded exactly once -- `%20` for spaces everywhere, which `mailto:`/`sms:` require and every web endpoint accepts.

## CustomEvents reference

The module script dispatches bubbling events on the bar's root element so you can observe sharing in your own analytics without any tracker. `detail.url` is always the canonical page URL, never the constructed intent href.

| Event | When | `detail` |
| --- | --- | --- |
| `social-share:share` | A share-intent link is clicked (navigation proceeds normally) | `{network, url}` |
| `social-share:action` | A webshare/copy/print button action finishes | `{action, url, ok}` |

```js
document.addEventListener('social-share:share', (event) => {
  myAnalytics.track('share', event.detail.network);
});
```

A closed Web Share sheet is a user decision, not a failure: it dispatches nothing and announces nothing (the same applies to a second click while a share sheet is already open).

The script wires the bars present at initial page load. If your site inserts or restores bars later (PJAX/Turbo navigation, AJAX-loaded content), dispatch `document.dispatchEvent(new Event('social-share:rescan'))` after the DOM update -- with Turbo Drive, on every `turbo:load`. Rescanning is safe and idempotent: a bar whose listeners are live is never double-wired, while a bar restored from a page-cache snapshot (it still looks enhanced, but `cloneNode` dropped its listeners) is rewired and any stale copy feedback it carried is cleared.

## Accessibility

- The bar is a `<nav>` landmark with a translated accessible name ([WCAG technique H97](https://www.w3.org/WAI/WCAG21/Techniques/html/H97)); the inner `<ul>` gives assistive tech a link count. If one page renders several bars with DIFFERENT network sets, give each a distinct `aria_label`; identical bars should share one label.
- Every control's accessible name is REAL TEXT in `social-share__label` -- not an `aria-label` -- so names survive machine translation and reach voice-control users. For an icon-only bar, visually hide the labels in your CSS (do not `display: none` them):

```css
.social-share__label,
.social-share__hint {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

- With `new_tab` enabled, each link's accessible name ends with a translated "(opens in a new window)" hint (WCAG G201).
- Copy feedback is announced through a `role="status"` live region and mirrored as a state class, so the visual change and the screen-reader announcement come from the same text.
- Give pointer targets at least 24x24 CSS px (WCAG 2.2 SC 2.5.8; 44 px is the comfortable AAA floor) -- hit area is your padding, which the module deliberately does not constrain.
- The list is plain flow content: under `dir="rtl"` a flex or grid row reorders automatically. Brand logos are never mirrored; use CSS logical properties for spacing.

## Privacy

- The rendered baseline is static links: no request leaves the page until the visitor clicks one, so the buttons themselves create no GDPR/ePrivacy consent obligation -- unlike script-based social widgets, which transmit visitor data on page load (CJEU C-40/17, Fashion ID).
- `rel="noopener noreferrer nofollow"` on every web share link; `noreferrer` suppresses the Referer header on the click itself.
- The default Mastodon sharer carries the text in a URL fragment, which browsers never send to the server. The opt-in `mastodon_instance` mode necessarily sends the text to your chosen instance as a query parameter.
- The module never emits `dns-prefetch`/`preconnect`/`prefetch`/`prerender` hints or speculation rules for share endpoints. If your site runs a link-prefetching library (instant.page, quicklink) or speculation rules covering external links, EXCLUDE `.social-share__link` -- prefetching intent URLs would contact the networks (with cookies) before any click and void the zero-contact property.
- No share counts, deliberately: every public count API is dead (X since 2015, LinkedIn deprecated, Facebook requires an authenticated server-side app token), and count scripts were always the tracking vector.

## Styling

The module ships no CSS at all -- these hooks are yours.

| Hook | Element |
| --- | --- |
| `social-share` | Root `<nav>`. |
| `social-share__heading` | Optional heading `<p>`. |
| `social-share__list` / `social-share__item` | `<ul>` / `<li>`. Item modifier: `social-share__item--<slug>`. |
| `social-share__link` | Intent `<a>`. Modifier: `social-share__link--<slug>`. |
| `social-share__button` | Action `<button>`. Modifier: `social-share__button--<slug>`. |
| `social-share__icon` | `<span>` wrapping the inline SVG. |
| `social-share__label` / `social-share__hint` | Accessible-name text spans. |
| `social-share__status` | `role="status"` live region for copy feedback. |
| `social-share--enhanced` | Root state: the script has run. |
| `social-share--copied` / `social-share__button--copied` | Temporary state during copy feedback (about 3 seconds). |

One functional exception to "no styles": the hidden webshare/copy/print items carry an inline `display:none` alongside the `hidden` attribute, because an ordinary consumer rule like `.social-share__item {display: inline-block}` would override the weak `[hidden]` user-agent default and expose a dead control; the inline declaration cannot be overridden by author selectors, and the script removes it on reveal. It gates capability -- it makes no design decision.

Objective values ride on `data-*` attributes -- `data-share-network` on links, `data-share-action` on buttons, `data-share-url`/`data-share-title`/`data-share-text` on the root -- so per-brand theming needs no extra classes:

```css
.social-share__link {
  color: var(--brand-neutral);
}

.social-share__link--x {
  color: var(--brand-x, #000);
}
.social-share__link--whatsapp {
  color: var(--brand-whatsapp, #25d366);
}
```

### Icons

Every icon is an inline SVG with `width="1em" height="1em"`, `fill`/`stroke="currentColor"`, `aria-hidden="true"`, and `focusable="false"`: icons inherit your text color and font size and restyle entirely from your CSS. Brand-mark geometry follows the [Simple Icons](https://simpleicons.org/) set (CC0), with one exception: Truth Social has no Simple Icons entry and ships an original letterform placeholder in the same line-art idiom as the action glyphs (webshare, copy, print, email, sms), which are original line art matching this repository's other modules. Replace any or all glyphs by shipping your own `layouts/_partials/social-share/icon.html` -- it receives `(dict "name" <slug> "class" <classes>)` and an unknown name may render nothing.

## Validation

The module cannot build standalone; [`test/`](test/) contains a minimal consuming fixture site plus a Playwright suite that asserts exact intent hrefs (including a hostile-character encoding matrix), scheme handling, progressive-enhancement behavior, the copy flow, and the CustomEvent surface. See [`test/README.md`](test/README.md). CI additionally verifies `go.mod` parses and `hugo mod graph` resolves.

## Module Structure

```text
modules/social-share/
├── README.md                              This file
├── go.mod                                 Module path (leaf module, independently importable)
├── hugo.toml                              Minimum Hugo version pin
├── data/
│   └── social-share/
│       └── defaults.toml                  Consumer-facing defaults (lowest cascade tier)
├── i18n/
│   ├── en.toml                            English UI strings
│   └── ru.toml                            Russian UI strings
├── assets/
│   └── js/
│       └── social-share.js                Progressive enhancement (reveal, share, copy, print, events)
├── layouts/
│   ├── _shortcodes/
│   │   └── social-share.html              In-content entry; dispatches to the partial
│   └── _partials/
│       └── social-share/
│           ├── share.html                 PUBLIC ENTRY: guard, resolve, render, script emission
│           ├── config.html                Four-tier cascade and share-data resolver
│           ├── networks.html              Built-in target registry, aliases, networks_extra merge
│           ├── url.html                   Encoded href builder (querify, %20 normalization, joining)
│           ├── item.html                  One list item (link or action button)
│           ├── icon.html                  Inline SVG glyphs (brand marks + action line art)
│           └── lib/
│               ├── resolve-image.html     Shared share-image value resolver (resource lookup, then URL)
│               └── warn.html              Build-deduplicated warnf funnel
└── test/                                  Fixture site + Playwright validation suite (see test/README.md)
```
