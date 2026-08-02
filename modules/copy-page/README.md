# copy-page

Universal, style-agnostic "Copy page" split button for Hugo: one partial (or shortcode) renders a JavaScript-revealed primary half that copies the page's Markdown to the clipboard, plus a native `<details>` disclosure menu of rows -- view the Markdown, open `llms.txt`, or hand the page to an AI provider (ChatGPT, Claude, Perplexity, Grok, Google AI Studio). The module emits semantic HTML with [BEM](https://getbem.com/) class hooks and `data-*` attributes and ships **zero CSS** -- no stylesheets, no colors, no dark-mode rules -- so the consuming site owns every visual decision. It is also privacy-first by construction: the baseline is static `<a href>` link rows, so the page makes **zero third-party contact** before a visitor deliberately clicks a provider row (no provider SDKs, no trackers, no scripts from anyone but you).

The menu works without JavaScript; scripting only adds what genuinely needs it (the Clipboard API, menu conveniences) and a tracker-free `CustomEvent` surface for the site's own analytics. The widget fits any site that publishes a Markdown representation of its pages -- Hugo's built-in `markdown` output format, an [agent-readiness](../agent-readiness/README.md) twin, or any custom format.

## Installation

Add the module to your site's Hugo configuration:

```toml
[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/copy-page"
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/copy-page
```

Confirm resolution with `hugo mod graph`.

**Important -- template lookup precedence:** a file with the same path in your site (for example `layouts/_partials/copy-page/icon.html` or `assets/js/copy-page.js`) overrides the module's version. That is the supported way to replace icons or behavior -- and a reason to check those paths if output looks unexpected.

For local development against a checkout of this repository, use a `hugo.work` workspace or `[module.replacements]` as described in the [repository README](../../README.md).

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+ (any edition)
- [Go](https://go.dev/) 1.22+

## Usage

The PRIMARY surface is the partial. Place one line in a layout, typically `single.html` near the page title:

```go-html-template
{{ partial "copy-page/menu.html" . }}
```

The dot MUST be the current Page; passing anything else is the module's single build-failing error. For call-site overrides, pass an options dict whose `page` key is the current Page:

```go-html-template
{{ partial "copy-page/menu.html" (dict
  "page" .
  "rows" (slice "copy" "view" "claude")
  "url" $twinUrl
) }}
```

Inside content, use the shortcode (named parameters, plus one positional shorthand for `rows`):

```text
{{</* copy-page */>}}
{{</* copy-page "copy,view,claude" */>}}
{{</* copy-page rows="copy,view,claude" toggle_label="Use this page" new_tab="false" */>}}
```

Per-page front matter uses the same keys under one `copy_page` map:

```yaml
copy_page:
  rows: [copy, view, chatgpt, claude]
  toggle_label: Use this page
```

Kill switches: `params.copy_page.enable = false` disables the module site-wide; `copy_page.disable: true` disables it for one page. Both accept bool and string forms (`false`/`"false"`/`"0"`/`"no"`/`"off"`, and their affirmative counterparts).

When no explicit `url` is given, the module derives the Markdown URL from the page's own output formats (`.OutputFormats.Get <format>`). Derivation answers "is the format WIRED for this page's kind", not "did this page PUBLISH the file": on sites where a producer selectively suppresses output files while the format stays wired (for example agent-readiness per-page exclusions), pass `url` explicitly from the source of truth. With the sibling agent-readiness module, that pairing is one line -- the widget renders exactly on the pages that actually publish a twin:

```go-html-template
{{ with partial "agent-readiness/twin-url.html" . }}{{ partial "copy-page/menu.html" (dict "page" $ "url" .) }}{{ end }}
```

Only the entry contract above is public API. Internal partials can change between minor versions, though same-name site-level overrides remain supported by Hugo's lookup order.

## Rows

Built-in row slugs, what each renders, and the caveats you accept by enabling it. "Prompt target" is the URL the AI-provider prompt carries: `markdown` sends the page's Markdown URL, `html` sends the page's own permalink. Every provider endpoint already contains its query parameter and receives ONLY the percent-encoded prompt value.

Each row's default description follows its own prompt target, so a reader comparing two rows in the open menu sees which surface each one hands the assistant instead of two identical sentences over two different links: a `markdown` row reads "Ask questions about the Markdown version", an `html` row reads "Ask questions about the live page", and a row with no prompt target keeps the plain "Ask questions about this page". That derivation applies to `rows_extra` rows too. A row that declares its own `desc_key` overrides it, which is how `chatgpt` states its search-mode reason -- see [Which rows target the live page, and why](#which-rows-target-the-live-page-and-why).

| Slug | Kind | Destination | Prompt target | Caveats |
| --- | --- | --- | --- | --- |
| `copy` | action (button) | Fetches the Markdown URL and writes its text to the clipboard | -- | JavaScript-revealed: rendered dual-hidden, shown only when the Clipboard API exists on a secure context. Its presence in `rows` also enables the primary split-button half. |
| `view` | link (same-origin) | The Markdown URL itself | -- | -- |
| `llms` | link (same-origin) | `llms_url`, else the home page's `llmstxt` output format permalink | -- | Drops silently when neither resolves. The probe answers "wired", not "published" -- see [Configuration](#configuration). |
| `chatgpt` | link (external) | `https://chatgpt.com/?hints=search&q=` | `html` | The `q` parameter is de facto (undocumented by OpenAI); its auto-submit behavior shifted twice in 2025. Failure mode is benign: the prompt lands in the composer, or the home page opens -- never a 404. `hints=search` pairs with the `html` target so ChatGPT fetches the live page, and this row's own description says so at the widget. Probed 2026-08-01; prompt delivery observed in a signed-in browser on 2026-08-02. |
| `claude` | link (external) | `https://claude.ai/new?q=` | `markdown` | The Claude Help Center documents `q` for the desktop `claude://claude.ai/new?q=` deep link that mirrors this web path (URL encoding required, roughly 14,000-character cap); the bare web shape is the convention Mintlify ships at scale. A public report claims the web chat dropped `q` in October 2025; **prefill observed working in the signed-in web chat on 2026-08-02**, so the report does not hold. |
| `perplexity` | link (external) | `https://www.perplexity.ai/search?q=` | `html` | Redirects to `/search/new` with the query preserved, then Perplexity's bot filter returns 403 to CLI probes -- real browsers pass. Targets the live page because it cannot retrieve a Markdown twin and says so; see [retrieval](#which-rows-target-the-live-page-and-why). Probed 2026-08-01; prompt delivery observed in a signed-in browser on 2026-08-02. |
| `grok` | link (external) | `https://grok.com/?q=` | `markdown` | Returns 200. Probed 2026-08-01; prompt delivery observed in a signed-in browser on 2026-08-02. |
| `aistudio` | link (external) | `https://aistudio.google.com/prompts/new_chat?prompt=` | `html` | Redirects signed-out visitors to Google sign-in with the full deep link preserved in the `continue` parameter -- the prompt survives the auth flow. Targets the live page because it cannot retrieve a Markdown twin and says so. It opens whatever model the visitor has selected with whatever tools are enabled there, so an answer may be composed without any fetch at all; see [retrieval](#which-rows-target-the-live-page-and-why). Probed 2026-08-01; prompt delivery observed in a signed-in browser on 2026-08-02. |

The prompt sent to the provider rows defaults to the localized `copy_page_prompt` string -- `Read from <url> so I can ask questions about it. If you cannot retrieve it, say so instead of answering from memory.` -- and can be overridden with the `prompt` key, where the literal token `{url}` is replaced with the row's target URL. The value is URL-encoded exactly once, with `%20` for spaces (never `+`).

The first sentence is Mintlify's verbatim convention. The second is this module's own, added after three of the five assistants turned out to be unable to open a Markdown twin and one was seen answering in full detail about a page it had not fetched: an assistant that cannot open the URL should say so rather than reconstruct an answer, and the prompt is the only lever the module has over what happens once the link is clicked. Override the whole string with `prompt` if you would rather ship the bare convention.

## Configuration

Every key lives in [`data/copy-page/defaults.toml`](data/copy-page/defaults.toml) and can be overridden at three higher tiers. Precedence, highest first: call-site dict args > page front matter (`copy_page` map) > site `[params.copy_page]` > module defaults. Presence wins at every tier, so an explicit `false` or empty value overrides the tier below it.

```toml
[params.copy_page]
rows = ["copy", "view"]
format = "markdown"
new_tab = true
llms_url = ""
prompt = ""
toggle_label = ""
```

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `rows` | list or comma-separated string | `["copy", "view"]` | Rows rendered in the menu, in list order: built-in slugs from the table above plus `rows_extra` slugs. The shipped default lists only the rows every Markdown-publishing site can honor. |
| `format` | string | `"markdown"` | Output format name used to derive the page's Markdown URL when no explicit `url` argument is given. |
| `new_tab` | bool | `true` | `target="_blank"` on link rows, plus a hidden "(opens in a new window)" hint in each link's accessible name and an external-arrow glyph. |
| `llms_url` | string | `""` | llms.txt URL for the `llms` row. When empty, the module probes `site.Home.OutputFormats.Get "llmstxt"` and drops the row when that does not resolve. |
| `prompt` | string | `""` (localized default) | Prompt override for the AI-provider rows; the literal token `{url}` is replaced with the row's target URL. |
| `toggle_label` | string | `""` (localized "More ways to use this page") | Accessible name of the dropdown toggle. |

A non-map `params.copy_page` or `copy_page` front matter value (for example `copy_page: false`, a natural first guess) is discarded with a one-time warning -- use the `enable`/`disable` kill switches instead.

**Wired is not published.** Both derivation paths are probes of Hugo's output-format wiring: `format` derivation asks the page, the `llms` probe asks the home page. A producer that selectively suppresses files while the format stays wired (agent-readiness per-page twin exclusions; an llms.txt producer switched off while `llmstxt` stays in `[outputs]`) makes those probes over-report. For twins, pass `url` explicitly from the source of truth (the [pairing example](#usage) above); for the llms row, omit `llms` from `rows` or set `llms_url` to the real file.

### Custom rows (`rows_extra`)

Add an AI provider the registry lacks -- or patch a built-in -- without forking the module (site params tier only):

```toml
[params.copy_page.rows_extra.you]
label = "You.com"
endpoint = "https://you.com/search?q="
target = "markdown"
```

Entry keys: `endpoint` (an absolute URL that ALREADY contains the query parameter name and ends at its `=` -- the percent-encoded prompt value is appended verbatim, with no `?`/`&` joining), `label` (display name, used verbatim -- brand names are proper nouns and are never translated), `target` (`"markdown"` | `"html"` | `"none"`; `"none"` renders a plain link with no prompt appended), and optional `label_key` / `label_default` / `desc_key` / `desc_default` i18n overrides plus `icon` (a built-in [icon name](#icons); for an own glyph override `layouts/_partials/copy-page/icon.html`).

Endpoint schemes are allowlisted to `https` only: anything else (including plain `http` and `javascript:`) is skipped with a one-time build warning, so front-matter-shaped typos or hostile config cannot mint a non-web row. A `rows_extra` slug named like a built-in patches it per field (Hugo's `merge` is recursive for maps): overriding just `endpoint` keeps the built-in's label and icon. Remember to add the new slug to `rows` -- defining an entry does not render it.

## Parameters

Accepted by both the partial (dict keys) and the shortcode (named parameters); the shortcode additionally takes `rows` as positional parameter 0.

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | Page | partial dict only | -- | The current Page (the bare-Page call form passes it implicitly). |
| `rows` | list (partial) / comma-separated string | no | cascade | Rows, in order. |
| `format`, `new_tab`, `llms_url`, `prompt`, `toggle_label` | as above | no | cascade | Call-site overrides of the same-named config keys. |
| `url` | string | no | derived | Explicit Markdown URL; overrides `format` derivation. |
| `class` | string | no | `""` | Extra class(es) appended to the root element. |
| `id` | string | no | `""` | `id` attribute on the root element. |

### Validation

- The module's ONE `errorf`: calling the partial without the current Page (a wiring mistake in a layout).
- Deduplicated one-time `warnf` (the build never breaks): unknown row slug; a `rows_extra` endpoint outside the `https` allowlist; a non-map `copy_page` value in site params or front matter (ignored -- use the `enable`/`disable` switches); missing module data file or script asset (broken installation).
- Silent: no Markdown URL resolves (neither an explicit `url` nor the configured format) -- the widget renders nothing, the legitimate state of a page without a Markdown representation; the `llms` row drops when its URL does not resolve; an empty resolved row list renders nothing at all.

## Deep-link caveats

The provider rows ride on prefill conventions, not contracted APIs. What you accept by enabling them:

- **ChatGPT's `q` is undocumented.** OpenAI publishes no spec for it; the parameter is the convention Mintlify ships across its platform, and its auto-submit behavior shifted twice in 2025 (it is now gated on the `Sec-Fetch-Site` request context). The failure mode is benign -- the prompt lands in the composer for the visitor to send, or the plain home page opens. Never a 404.
- **Claude's `q` is documented for the desktop mirror, and observed working on the web.** The Claude Help Center documents `claude://claude.ai/new?q=...` for the desktop app -- the same path this row uses on the web -- including the URL-encoding requirement and a roughly 14,000-character cap (far above the default one-sentence prompt). The bare web shape has no dedicated official doc page; it is Mintlify's at-scale convention. A public report (`anthropics/claude-code` issue 19023, quoting issue 8827) claims the plain web chat dropped `q` in October 2025. It does not hold: the prompt was observed landing in the composer of the signed-in web chat on 2026-08-02. Note what settles this and what does not -- an HTTP probe returns 200 either way, because a web application ignores a query parameter it does not recognize and renders normally, so only opening the link in a signed-in browser can tell prefill from silence.
- **Login walls.** Signed-out visitors typically land on a sign-in step. Google AI Studio preserves the full deep link in its sign-in redirect's `continue` parameter, so the prompt survives the auth flow; other providers restore the composer state with varying fidelity after login.
- **Mobile app interception.** Provider mobile apps may claim their domains as universal/app links; an intercepting app decides for itself what to do with the query string, and may drop the prompt. The module cannot influence this.

**What kind of evidence backs each row**, because "verified" can cover two very different things. All five rows were probed live as of 2026-08-01, which establishes the URL shape and that the endpoint answers -- and a probe can establish nothing more, because an application ignores a query parameter it does not recognize and still returns 200, so the probe result is identical whether the parameter works or was removed. All five were then OPENED IN A SIGNED-IN BROWSER on 2026-08-02, and the prompt arrived in every one. That second test is the one that means the row does its job; the first only means the link is not broken.

What the browser test does NOT settle is what each assistant then does with the URL inside the prompt. It confirms delivery, not retrieval -- see [Which rows target the live page, and why](#which-rows-target-the-live-page-and-why) for the one place that difference decides a design choice.

If a provider changes its URL shape, patch the row from site config via [`rows_extra`](#custom-rows-rows_extra) -- no module update needed.

### Which rows target the live page, and why

Three provider rows carry the page's own permalink -- `chatgpt`, `perplexity` and `aistudio` -- while `claude` and `grok` carry the Markdown twin. The split is not a rule about media types or search indexes; it is a table of observations, because the five assistants do not behave alike.

**Every target was set by a retrieval test, run 2026-08-02.** Each assistant was handed a twin URL, asked only whether it could fetch that exact address, and pressed for proof rather than a summary:

| Row | Result | What it showed |
| --- | --- | --- |
| `claude` | reads the twin | Reported the final URL with no redirect, the MIME type `text/markdown; charset=utf-8`, and the real front-matter keys. |
| `grok` | reads the twin | Reproduced the file verbatim, front matter included, down to figures no summary could reconstruct. |
| `chatgpt` | cannot, and says so | Reported that the URL serves `text/markdown` and that its retrieval tool rejected that as an unsupported format. |
| `perplexity` | cannot, and says so | Stated it could not retrieve the URL, then fetched the site's HTML page successfully in the same session -- which is what isolates the `.md` as the problem rather than the host. |
| `aistudio` | cannot, and says so | On Gemini 3.6 Flash with URL context enabled, reported the `.md` address as returning an error or being inaccessible, fell back to the site's HTML page, and said that is what it had done. |

Two conclusions follow, and the second is the one worth carrying elsewhere.

**The media type is not a general blocker.** Claude and Grok read `text/markdown` without complaint, so there is no case for changing how a site publishes its twins. A single counterexample looked like a pattern until the other four were tested.

**All three failures were honest, and that is not guaranteed.** Each of the three said it could not open the twin, which is the behavior a reader can act on. But one of these endpoints opens whatever model the visitor has selected there, with whatever tools are enabled: pointed at a model with no retrieval, the same row produced a fluent, confident answer composed without fetching anything, with no sign that a fetch had been skipped. Perplexity showed the softer version of the same thing -- it reported the twin failure honestly, then answered from other material whose details did not match the live page. That is why the default prompt now asks an assistant to state a failed fetch rather than answer regardless: the prompt is the module's only lever over what happens after the link is clicked, and it cannot control which model is on the other end.

For all three, the `html` target is a fix rather than a guess: the canonical page always exists, any fetcher can read `text/html`, and each of the three was observed reaching it successfully in the same session in which the twin failed. `chatgpt`'s endpoint additionally carries `hints=search`, which opens search mode; that reinforces its pairing but is not the reason for it.

These are observations of five products on one day, not properties of the module. If an assistant's fetcher changes, flip the row in your own config and patch its description in the same block, because the shipped one names the surface the row would no longer send:

```toml
[params.copy_page.rows_extra.chatgpt]
target = 'markdown'
desc_key = 'copy_page_open_desc_markdown'
desc_default = 'Ask questions about the Markdown version'
```

`rows_extra` merges per field, so the endpoint, label and icon stay intact. Clearing `desc_key` alone is not enough -- `desc_default` survives as the fallback -- which is why both are restated. Open an issue if you confirm it, so the module default can follow.

**The same question is open for the other four rows, and the module has not answered it.** They all hand over a `text/markdown` URL, and only ChatGPT has been tested for retrieval. If an assistant rejects the media type the way ChatGPT does, that row delivers a prompt pointing at something the assistant cannot open -- a silent, benign failure that looks like a working link. Testing one takes a minute: hand it a twin URL, ask only whether it could fetch it, and watch for a media-type complaint. A useful discriminator is to ask the same assistant for the site's `/llms.txt`, which is served as `text/plain`: if that one succeeds where the twin fails, the media type is the blocker rather than the address.

What kept making this a question was not the target but its invisibility: every provider row used to carry the same description, so the differing links had no explanation anywhere near them. Each row now states its own surface, and the `chatgpt` row additionally names the search mode, so the answer lives where the difference is.

## Clipboard behavior

The copy controls are revealed when `window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText` holds -- the `writeText` floor. The gate deliberately does NOT require `ClipboardItem`: that would needlessly hide the button from Firefox 63-126, which copies fine through `writeText`. The write path is chosen at click time instead.

Every path starts synchronously inside the click handler, because Safari expires transient user activation across `await` boundaries ([WebKit bug 222262](https://bugs.webkit.org/show_bug.cgi?id=222262)) -- a `writeText` issued after an awaited fetch throws `NotAllowedError` there. Layered write paths:

1. **Cache hit:** the Markdown text is already in the module's in-page cache (from a previous copy or the hover/focus warm-up), so `writeText` fires immediately. The hit check is a synchronous string read -- never an already-resolved promise, which still crosses a microtask boundary, back inside Safari's unreliable zone.
2. **Cache miss with `ClipboardItem`:** the clipboard is handed a `ClipboardItem` whose `text/plain` is a promise resolving to a `Blob` -- Chrome and Edge 98-132 reject string promise payloads, so the Blob form is mandatory. Two guards cover the browsers between the support floors: a synchronous constructor throw falls through to path 3 (a sync throw consumes no user activation), and a rejected `write()` whose embedded fetch nevertheless populated the cache retries once with plain `writeText` -- rescuing Chrome and Edge 76-97, which reject promise payloads yet auto-grant clipboard write access to the focused tab.
3. **Cache miss without usable `ClipboardItem`** (Firefox 63-126, Chrome 66-75, or a fall-through from path 2): await the already-started fetch, then `writeText`.

Any failure -- including a non-ok HTTP response for the Markdown file -- announces the error label through the live region, dispatches `copy-page:action` with `ok: false`, and writes NOTHING to the clipboard. (Copying an empty string and reporting success on a failed fetch is the reference implementation's bug, not a behavior worth replicating.) On success the widget announces the copied label, sets the temporary copied state classes, and resets after about 3 seconds. There is no `document.execCommand` fallback: it is deprecated, and every browser with a usable clipboard is covered by the paths above. As an optimization, the first hover or focus on the widget pre-fetches the Markdown into the cache so the click usually lands on path 1 -- touch devices get no hover, and the miss paths remain the structural guarantee.

## Script emission

The entry partial emits the module script as a minified, fingerprinted `<script defer>` with Subresource Integrity and `crossorigin="anonymous"` -- once per PLACEMENT, deliberately NOT deduplicated behind a `Page.Store` sentinel. A `Page.Store` sentinel is shared by every paginator output of one Page object, so the tag would reach only the first-rendered output (`/blog/` but never `/blog/page/2/`). Emitting per placement is safe: browsers fetch duplicate same-`src` deferred scripts once, and re-execution is a no-op behind the script's window-level run guard plus its per-root wired guard.

## CustomEvents reference

The module script dispatches bubbling events on the widget's root element so you can observe activity in your own analytics without any tracker. `detail.url` is always the widget's Markdown URL, never a row's destination href.

| Event | When | `detail` |
| --- | --- | --- |
| `copy-page:action` | A copy attempt finishes (either copy control) | `{action: 'copy', url, ok}` |
| `copy-page:open` | A link row is activated (navigation proceeds normally) | `{row, href, url}` |

```js
document.addEventListener('copy-page:open', (event) => {
  myAnalytics.track('copy-page', event.detail.row);
});
```

The script wires the widgets present at initial page load. If your site inserts or restores widgets later (PJAX/Turbo navigation, AJAX-loaded content), dispatch `document.dispatchEvent(new Event('copy-page:rescan'))` after the DOM update -- with Turbo Drive, on every `turbo:load`. Rescanning is safe and idempotent: a widget whose listeners are live is never double-wired, while a widget restored from a page-cache snapshot (it still looks enhanced, but `cloneNode` dropped its listeners) is rewired and any stale copy feedback it carried is cleared.

## Accessibility

- The menu is a native `<details>`/`<summary>` disclosure over a plain list of links and one button -- platform semantics that every browser and assistive technology already understands. It is deliberately NOT an ARIA `role="menu"`: that role obligates full APG menu keyboarding (arrow-key roving, typeahead) for no gain on what is fundamentally a list of links, and the WAI-APG itself steers link lists away from it.
- The no-JS baseline is fully functional: the disclosure toggles natively and every link row works. Scripting only reveals the clipboard controls and adds conveniences -- Escape closes the menu and returns focus to the toggle, interaction outside closes it, activating a row closes it.
- The toggle's accessible name is REAL TEXT in `copy-page__toggle-label` -- not an `aria-label` -- so it survives machine translation and reaches voice-control users; `toggle_label` (config) and `copy_page_toggle` (i18n) feed it. Every row likewise carries a real-text title and description.
- With `new_tab` enabled, each link's accessible name ends with a translated "(opens in a new window)" hint (WCAG G201) in `copy-page__newtab`.
- Copy feedback is announced through a `role="status"` live region (`copy-page__status`) and mirrored as a state class, so the visual change and the screen-reader announcement come from the same source. Control labels never change text on success -- the announcement does the talking, which keeps i18n entirely server-side.
- Give pointer targets at least 24x24 CSS px (WCAG 2.2 SC 2.5.8; 44 px is the comfortable AAA floor) -- hit area is your padding, which the module deliberately does not constrain.

## Privacy

- The rendered baseline is static links: no request leaves the page until the visitor clicks, so the widget itself creates no GDPR/ePrivacy consent obligation. The provider rows are plain outbound GETs to the provider's own composer -- no provider SDK, script, pixel, or share counter is ever loaded.
- The prompt (which carries your page's URL) travels to a provider only at the moment of a deliberate click on that provider's row.
- `rel="noopener noreferrer nofollow"` on every external row; `noreferrer` suppresses the Referer header on the click itself. Same-origin rows (`view`, `llms`) carry no `rel` -- they are your own content, and modern browsers imply `noopener` on `target="_blank"`.
- The copy button fetches only your own site's Markdown file, same-origin.
- The module never emits `dns-prefetch`/`preconnect`/`prefetch`/`prerender` hints or speculation rules for provider endpoints. If your site runs a link-prefetching library (instant.page, quicklink) or speculation rules covering external links, EXCLUDE `.copy-page__row` -- prefetching provider URLs would contact them (with cookies) before any click and void the zero-contact property.

## Styling

The module ships no CSS at all -- these hooks are yours.

| Hook | Element |
| --- | --- |
| `copy-page` | Root `<div>`. |
| `copy-page__copy` | Primary split-button half (`<button>`, JS-revealed). |
| `copy-page__label` | Primary button's text span. |
| `copy-page__menu` / `copy-page__toggle` | The `<details>` disclosure / its `<summary>`. |
| `copy-page__toggle-label` | Toggle's real-text accessible name (clip-hide it for an icon-only toggle). |
| `copy-page__list` / `copy-page__item` | `<ul>` / `<li>`. Item modifier: `copy-page__item--<slug>`. |
| `copy-page__row` | Row `<a>` or `<button>`. Modifier: `copy-page__row--<slug>`. |
| `copy-page__text` / `copy-page__title` / `copy-page__desc` | Row text block: title plus description. |
| `copy-page__icon` | `<span>` wrapping an inline SVG. Modifier: `copy-page__icon--chevron` on the toggle's chevron. |
| `copy-page__external` / `copy-page__newtab` | External-arrow glyph / "(opens in a new window)" hint on new-tab links. |
| `copy-page__status` | `role="status"` live region for copy feedback. |
| `copy-page--enhanced` | Root state: the script has run. |
| `copy-page--copied` / `copy-page__copy--copied` / `copy-page__row--copied` | Temporary state during copy feedback (about 3 seconds). |

Clip-hide the visually redundant text spans -- never `display: none` them, which would remove them from the accessibility tree (and silence the live region entirely):

```css
.copy-page__toggle-label,
.copy-page__newtab,
.copy-page__status {
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

One functional exception to "no styles": the JS-only copy controls carry an inline `display:none` alongside the `hidden` attribute, because an ordinary consumer rule like `.copy-page__copy {display: inline-flex}` would override the weak `[hidden]` user-agent default and expose a dead control; the inline declaration cannot be overridden by author selectors, and the script removes both on reveal. It gates capability -- it makes no design decision.

Objective values ride on `data-*` attributes -- `data-copy-page-url` plus the two announcement labels on the root, `data-copy-page-action="copy"` on the copy controls, `data-copy-page-row` on link rows -- so per-row theming needs no extra classes:

```css
.copy-page__row {
  color: var(--brand-neutral);
}

.copy-page__row--chatgpt {
  color: var(--brand-openai, #000);
}
```

### Icons

Every icon is an inline SVG with `width="1em" height="1em"`, `fill`/`stroke="currentColor"`, `aria-hidden="true"`, and `focusable="false"`: icons inherit your text color and font size and restyle entirely from your CSS. Glyph names: `copy`, `view`, `llms`, `chevron`, `external` (original line art in the Lucide/Tabler idiom, matching this repository's other modules) and the brand marks `openai`, `anthropic`, `perplexity` (geometry from the [Simple Icons](https://simpleicons.org/) set, CC0). Grok and Google AI Studio have no Simple Icons entry as of 2026-08-01, so `grok` and `aistudio` ship original letterform placeholders in the same line-art idiom. Replace any or all glyphs by shipping your own `layouts/_partials/copy-page/icon.html` -- it receives `(dict "name" <name> "class" <classes>)` and an unknown name renders nothing.

## Validation

The module cannot build standalone; [`test/`](test/) contains a minimal consuming fixture site plus a Playwright suite that asserts exact row hrefs (including a hostile-character encoding matrix), URL derivation and the render-nothing self-gate, kill switches, `rows_extra` handling with the `https` allowlist, the progressive-enhancement reveal, the clipboard flow (success, and the no-write guarantee on a 404 twin), menu behavior, per-placement script emission on a paginated output, and the CustomEvent surface. Run it with Node.js 22+ from `test/`:

```bash
cd modules/copy-page/test
npm install
npx playwright install chromium
./run-tests.sh        # run-tests.cmd on Windows; PORT overrides the default 1616
```

The runner performs the repository's pre-launch hugo process check, serves the fixture with `hugo server --logLevel info`, fails on any logged deprecation, and cleans the server up afterward. CI additionally verifies that `go.mod` parses and `hugo mod graph` resolves.

## Module Structure

```text
modules/copy-page/
├── README.md                              This file
├── go.mod                                 Module path (leaf module, independently importable)
├── hugo.toml                              Minimum Hugo version pin
├── data/
│   └── copy-page/
│       └── defaults.toml                  Consumer-facing defaults (lowest cascade tier)
├── i18n/
│   ├── en.toml                            English UI strings
│   └── ru.toml                            Russian UI strings
├── assets/
│   └── js/
│       └── copy-page.js                   Progressive enhancement (reveal, copy flow, menu, events)
├── layouts/
│   ├── _shortcodes/
│   │   └── copy-page.html                 In-content entry; dispatches to the partial
│   └── _partials/
│       └── copy-page/
│           ├── menu.html                  PUBLIC ENTRY: guard, kill switches, markup, script emission
│           ├── config.html                Four-tier cascade and Markdown-URL resolver
│           ├── rows.html                  Built-in row registry, rows_extra merge, item resolver
│           ├── url.html                   Encoded provider href builder (value-only append, %20 spaces)
│           ├── icon.html                  Inline SVG glyphs (brand marks + line art)
│           └── lib/
│               └── warn.html              Build-deduplicated warnf funnel
└── test/                                  Fixture site + Playwright validation suite
```
