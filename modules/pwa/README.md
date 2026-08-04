# modules/pwa

Consumer-facing Hugo PWA module. Drop a `[params.pwa]` block into your Hugo configuration, include one partial in `baseof.html`, and your site ships a production-grade Progressive Web App: web app manifest, RealFaviconGenerator icon set (modern 2024 minimal head OR legacy verbose head), Workbox-powered service worker with runtime caching and offline fallback, install prompt gated on push intent, push subscription wiring, and a nine-event `window.dispatchEvent` surface for analytics and consumer UI.

This module is the partner of [`modules/workbox`](../workbox/README.md), which vendor-mounts `github.com/GoogleChrome/workbox` v7.4.1 source files for the service worker build pipeline. Consumers do not import `modules/workbox` directly -- it is a transitive dependency of `modules/pwa`.

## Status

v1.0 -- production-ready surface. Hugo 0.160.0+ (any edition), Go 1.22+. No deprecated APIs.

## Quick start

In your Hugo configuration:

```toml
[module]
[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/pwa"

[outputs]
home = ["html", "rss", "webappmanifest"]

[params.pwa.manifest]
name = "My App"
short_name = "MyApp"
theme_color = "#3367d6"
background_color = "#ffffff"
```

### Combining this module with other modules that wire output formats

This module needs `webappmanifest` in your `home` output list, and your site configuration holds exactly ONE `[outputs]` table whose lists are the union of every module's needs. A second `[outputs]` table in the same file fails the configuration load outright (`unmarshal failed: toml: table outputs already exists`); pasting one module README's `[outputs]` block over another's leaves a single table that loads cleanly, exits 0, warns about nothing -- and silently stops publishing every document the replaced list asked for. That silent shape is the dangerous one, and it cuts both ways here: copy this module's block over another's and you lose that module's documents; copy another's over this one's and the manifest stops being generated, which takes installability with it. So do not copy any module's block wholesale into a site that already has one: MERGE the names into the list already there.

A site importing this module together with [`seo`](../seo/README.md), [`agent-readiness`](../agent-readiness/README.md) and [`search`](../search/README.md) wires all of them at once:

```toml
[outputs]
  home = ['html', 'rss', 'markdown', 'llmstxt', 'llmsindex', 'agentfacts', 'agentskills', 'searchindex', 'opensearch', 'webappmanifest']
  section = ['html', 'rss', 'markdown']
  page = ['html', 'markdown']
```

Only `[outputs]` needs this care: `[outputFormats]` and `[mediaTypes]` DO merge additively from module configuration, which is why the format names above are usable although the site defines none of them -- and `webappmanifest` needs no definition at all, because it is one of Hugo's built-in formats. The combination is covered by the cross-module suite in [`modules/test-composition/`](../test-composition/README.md).

In your `layouts/baseof.html` `<head>`:

```go-html-template
{{ partial "pwa/head.html" . }}
```

That is the minimum config. The defaults shipped in `data/pwa/defaults.toml` turn on the manifest, modern RFG favicon set, service worker, and install prompt; push notifications stay off until you set `params.pwa.push.enabled = true` and provide a VAPID public key.

## Installation

The repository is a public multi-module monorepo. The `pwa` chain is `modules/pwa` plus the sibling wrapper modules `modules/workbox` and `modules/idb`, which vendor-mount the `+incompatible` upstreams `github.com/GoogleChrome/workbox` v7.4.1 and `github.com/jakearchibald/idb` v8.0.3 for `js.Build`. Every edge of that chain is a real, fetchable version -- the wrappers reference each other at commit pseudo-versions of this repository, and `+incompatible` is exactly Go's convention for a tagged repository that has no root `go.mod` -- so you import ONE module and the rest resolves transitively. Pick the option that matches your workflow.

### A. Production / CI -- one `hugo mod get` (recommended; no vendoring)

Import only `modules/pwa` (by GitHub path) in your site config, then:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/pwa
hugo mod tidy
```

Your site `go.mod` then contains one direct require (commit pseudo-version illustrative), and `modules/workbox`, `modules/idb`, and both upstreams appear as indirect requirements you never maintain by hand:

```text
require github.com/alex-feel/hugo-artifacts/modules/pwa v0.0.0-20260802210223-6fb48a799944
```

This needs NO direct requires for the siblings, NO `replace`, NO `_vendor/`, NO workspace, and NO release tags, and resolves identically on a developer machine and a clean CI runner. `hugo mod get -u ./... && hugo mod tidy` moves the chain to the latest commit.

If you are upgrading from an earlier release of this module, delete the `modules/workbox` and `modules/idb` direct requires your site was carrying and run `hugo mod tidy`; they were a workaround for placeholder versions this chain no longer ships. An `invalid version: unknown revision 000000000000` error means your site is still resolving an older `modules/pwa` that predates this change -- move that pin forward.

### B. Local development -- `hugo.work` (live-edit the modules)

To edit the modules alongside your site, add a `hugo.work` in your site root and set `module.workspace` (or `HUGO_MODULE_WORKSPACE=hugo.work`) in your development config:

```text
go 1.22

use .
use ../hugo-artifacts/modules/pwa
```

List only the modules you intend to EDIT; anything left out still resolves from its recorded commit pseudo-version, so add `use ../hugo-artifacts/modules/workbox` (and `modules/idb`) only when you are changing the mount tables too. Add `hugo.work` to your site's `.gitignore`; the `use` paths are machine-specific. A `[module.replacements]` block pointing at the same local paths achieves the same effect; keep replacements out of production config.

### C. Hermetic CI -- `hugo mod vendor` (optional)

If you want a fully network-free CI build, run `hugo mod vendor` (after option A resolves the chain) and commit the `_vendor/` tree; subsequent builds read from `_vendor/` with no network or Go tooling. This is optional -- option A already works on CI without it.

See [`modules/workbox/README.md`](../workbox/README.md) and [`modules/idb/README.md`](../idb/README.md) for the vendor-mount mechanics, and the [Consuming modules that wrap non-Go upstreams](../../CLAUDE.md#consuming-modules-that-wrap-non-go-upstreams) section of root `CLAUDE.md` for the full convention.

## Configuration surface

Every key below lives in `data/pwa/defaults.toml`. Override any default by declaring the matching key under `[params.pwa]` (or its child tables) in your consumer site's Hugo config. Consumer overrides merge over the shipped defaults; you only need to declare the keys you want to change.

### Paths and subpath deployments (`baseURL` with a path)

Every path key in this module is SITE-ROOT-RELATIVE: a leading slash means "the root of this site", not "the root of the domain". Each one is normalized against your `baseURL` before it is emitted, so a site published at `https://example.org/docs/` registers the service worker at `/docs/sw.js` (where the build actually publishes it), launches the installed app at `/docs/`, and loads every icon from `/docs/`. Hugo's `relURL` and `absURL` do NOT do this on their own -- they resolve a value that already starts with `/` against the protocol and host only, DISCARDING the baseURL's path -- which is why the defaults are written with a leading slash and normalized centrally (`layouts/_partials/pwa/lib/absolute-url.html`) rather than emitted verbatim. That partial reads the path off `site.BaseURL` and prepends it itself rather than delegating to `relURL`, because `relURL` stops prepending the path at all once `canonifyURLs` is on -- which would silently disarm this normalization at every call site at once. Nothing changes for a site whose `baseURL` has no path: `/sw.js` stays `/sw.js`.

URLs that name a page or output format the build actually renders -- the precached homepage, offline page, and recent pages, the precached manifest, and the offline URL the service worker falls back to -- come from the rendered resource instead, through `layouts/_partials/pwa/lib/resource-url.html`. It takes the path component of `.Permalink` rather than using `.RelPermalink`, because `.RelPermalink` ALSO drops the baseURL's path under `canonifyURLs`: Hugo puts that path back when it canonifies rendered HTML, and `sw.js` is not HTML. A precache entry left at `/about/` on a `/docs/` deployment 404s, and Workbox's precache install is atomic, so that one entry takes down the entire service worker.

Normalized keys: `sw_path`, `sw_scope`, `manifest.href`, `manifest.scope`, `manifest.start_url`, `manifest.id`, every `manifest.icons.list[].src`, every `favicon.*_path` (after `favicon.prefix` is applied), `sw.offline.fallback_url`, `sw.offline.fallback_image`, `sw.precache.extra_urls[]`, `sw.bypass.urls[]`, `push.subscribe_url`, `push.unsubscribe_url`, `push.notification_icon`, `push.notification_badge`, and `push.default_click_url`.

Escape hatch: a value that carries its own scheme (`https://...`, `http://...`) or is protocol-relative (`//host/path`) passes through untouched. That is how you point at something that is NOT under your site path -- an icon on a CDN, or a push backend at the domain root or on another origin.

NOT normalized, by design: `sw.caches.api.url_pattern` and `sw.bypass.patterns` are regular expressions rather than paths, so a subpath site writes them to match its own path (`url_pattern = "^/docs/(api|index\\.json|sitemap\\.xml)"`). `sw.precache.exclude_globs` are matched as substrings against rendered page URLs, so `/admin/*` keeps working on any deployment.

`manifest.id` is normalized too, and that needs its own sentence because the W3C spec makes `id` the app's stable identity: change it and the browser treats the manifest as a DIFFERENT app. It is normalized anyway, because an id of `/` resolves against the ORIGIN, so two PWAs installed from two subpaths of one host claim the SAME identity and collide -- carrying the site path is what makes the identity actually identify your app. There is also no working subpath install to orphan: before this normalization every manifest icon 404ed on a subpath site, which disqualifies it for installation. If you must keep a specific historical identity, pin it by writing a full URL (`id = "https://example.org/docs/"`), which passes through untouched.

If you are already on a subpath and were compensating by hand -- writing `sw_path = "/docs/sw.js"`, `start_url = "/docs/"`, `favicon_ico_path = "/docs/favicon.ico"` -- REMOVE the compensation. Those values are normalized now, so a hand-prefixed path becomes `/docs/docs/...`. Write the site-root-relative form (`/sw.js`, `/`, `/favicon.ico`) and let the module apply the baseURL path.

### Top-level (`params.pwa.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `version` | string | `"v1"` | Cache version stamp (part of every runtime cache name). Bump to force cache rotation on redeploy. Set to `"auto"` to stamp each build with a millisecond timestamp (rotates caches on every deploy). |
| `debug` | bool | `false` | Enables verbose `console.log` traces in the page-side bundles. Off in production. |
| `update_check_seconds` | int | `3600` | Polling interval for `wb.update()` to mitigate Workbox issue #3285. `0` disables polling. |
| `sw_path` | string | `"/sw.js"` | Service-worker script URL. Must be a same-origin path to win the `scope` argument default. Site-root-relative: normalized against `baseURL`, so it always points at the worker this build publishes. |
| `sw_scope` | string | `"/"` | Service-worker registration scope. Site-root-relative: normalized against `baseURL` (a worker published under a subpath cannot claim a wider scope anyway). |

### Manifest (`params.pwa.manifest.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | Set false to suppress the `<link rel="manifest">` tag entirely. |
| `mode` | string | `"templated"` | `"templated"` (this module emits `/manifest.webmanifest`) or `"rfg-static"` (consumer's static `site.webmanifest` from RealFaviconGenerator). |
| `href` | string | `"/manifest.webmanifest"` | Path of the manifest file, used in `rfg-static` mode. Override only if you change the output route. Site-root-relative: normalized against `baseURL`. |
| `name` | string | `""` | Falls back to `site.Title` if empty. PWA install prompt uses this. |
| `short_name` | string | `""` | Home-screen label. Falls back to `name` if empty. |
| `description` | string | `""` | Falls back to `site.Params.description`. Omitted from the manifest entirely when both are empty, rather than emitted as `null`: the specification types this member as a string, so a processor discards a null and a schema validator rejects it -- a lint failure the consumer did not cause. |
| `display` | string | `"standalone"` | Top-level `display` mode for legacy clients. |
| `display_override` | array | `["window-controls-overlay", "standalone", "minimal-ui"]` | Modern fallback chain. First-supported wins. |
| `theme_color` | string | `"#ffffff"` | UI accent color. Use `params.pwa.favicon.theme_color.{light,dark}` for paired values. |
| `background_color` | string | `"#ffffff"` | Splash screen background. |
| `scope` | string | `"/"` | URL prefix scope for the PWA install. Site-root-relative: normalized against `baseURL`, and NOT language-prefixed (a multilingual site that wants a per-language app sets this explicitly). |
| `start_url` | string | `"/"` | Launch URL. Set to `"/?source=pwa"` for analytics discrimination. Site-root-relative: normalized against `baseURL`. |
| `id` | string | `"/"` | Stable PWA identity per W3C. **Set once, never change** (changing breaks reinstalls). Site-root-relative: normalized against `baseURL` -- see [Paths and subpath deployments](#paths-and-subpath-deployments-baseurl-with-a-path) for why, and for how to pin a historical value. |
| `lang` | string | `""` | BCP47 language tag. Falls back to `site.Language.Lang`. |
| `dir` | string | `""` | Text direction (`ltr`, `rtl`, `auto`). |
| `categories` | array | `[]` | Optional W3C category tags (see [W3C Manifest spec](https://w3c.github.io/manifest/)). Must be a LIST: the member is typed as a sequence, so a single value written for it (`categories = "news"` rather than `["news"]`) is ignored with one build warning rather than published as a JSON string a validator rejects. |

### Manifest member order

The manifest is emitted identity first and `icons` last: `name`, `short_name`, `id`, `description`, `lang`, `dir`, `start_url`, `scope`, `display`, `display_override`, `theme_color`, `background_color`, `categories`, `icons`. JSON member order carries no semantics, so nothing that parses a manifest can observe this -- it is for readers that do not parse the whole file. Serialized as one Go map the members came out alphabetically, which led with `background_color` and pushed every member that says WHAT THE APP IS behind the `icons` array; that array is consumer-supplied and unbounded, so with a generated favicon set of ten or more entries the app name sat seventy lines into a document whose first screen is icon paths.

Optional members are omitted when they carry no value rather than emitted null or empty, so the document contains only members that say something.

### Manifest icons (`params.pwa.manifest.icons.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `list` | array | `[]` | Explicit `[{src, sizes, type, purpose}]` entries, used verbatim. When empty (the default), icons are derived from the `params.pwa.favicon.icon_*_path` values (prefixed by `params.pwa.favicon.prefix`); legacy filenames omit the maskable icon. |

### Favicon (`params.pwa.favicon.*`)

Every `*_path` below is composed as `prefix` + path and then normalized against `baseURL` (see [Paths and subpath deployments](#paths-and-subpath-deployments-baseurl-with-a-path)); the same normalization applies to the manifest icons derived from these keys.

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | Set false to skip favicon emission entirely (manifest still emitted unless separately disabled). |
| `mode` | string | `"modern"` | `"modern"` (RFG 2024 minimal head) or `"legacy"` (verbose pre-2024 head: mstile, browserconfig). |
| `use_legacy_filenames` | bool | `false` | If true, expects `/android-chrome-{192,512}x*.png` instead of `/web-app-manifest-{192,512}x*.png`. |
| `prefix` | string | `""` | Optional path prefix (rare; for consumers that nest icons under `/static/icons/`). |
| `include_svg` | bool | `true` | Emit `<link rel="icon" type="image/svg+xml">` in modern mode. |
| `favicon_ico_path` | string | `"/favicon.ico"` | Multi-resolution ICO for legacy browsers. |
| `favicon_svg_path` | string | `"/favicon.svg"` | Modern scalable favicon. |
| `apple_touch_icon_path` | string | `"/apple-touch-icon.png"` | 180x180 Apple home screen icon. |
| `icon_192_path` | string | `"/web-app-manifest-192x192.png"` | Android home screen icon. |
| `icon_512_path` | string | `"/web-app-manifest-512x512.png"` | Android splash icon. |
| `icon_maskable_path` | string | `"/web-app-manifest-512x512-maskable.png"` | Android adaptive icon. |
| `mask_icon_path` | string | `"/safari-pinned-tab.svg"` | Legacy Safari pinned-tab icon (legacy mode only). |
| `mask_icon_color` | string | `"#000000"` | Legacy Safari pinned-tab color. |
| `msapplication_config_path` | string | `"/browserconfig.xml"` | Legacy Microsoft tile config (legacy mode only). |
| `msapplication_tilecolor` | string | `"#ffffff"` | Legacy Microsoft tile background (legacy mode only). |

### Favicon theme color pair (`params.pwa.favicon.theme_color.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `default` | string | `""` | Optional override for the single `<meta name="theme-color">` value. When empty (the default), the manifest `theme_color` is used. Ignored when `light` and `dark` are both set. |
| `light` | string | `""` | If set with `dark`, emits paired `<meta name="theme-color" media="(prefers-color-scheme: light)">`. |
| `dark` | string | `""` | If set with `light`, emits paired `<meta name="theme-color" media="(prefers-color-scheme: dark)">`. |

### Service worker (`params.pwa.sw.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | Set false to skip SW registration entirely. |
| `clients_claim` | bool | `true` | Enables `self.clients.claim()` so a fresh SW takes control on first install without a reload. |
| `skip_waiting` | bool | `false` | If true, the SW calls `self.skipWaiting()` on install so a new version activates immediately (default off so the update banner shows). |
| `update_ux` | string | `"banner"` | `"banner"` emits a `pwa:waiting` event for consumer UI; `"silent"` reloads the page once a new SW takes control. |

### Precache (`params.pwa.sw.precache.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | Master switch for the build-time precache list. |
| `include_homepage` | bool | `true` | Include `/` in the precache manifest. |
| `include_offline_page` | bool | `true` | Include the offline fallback page (`params.pwa.sw.offline.fallback_url`). |
| `include_manifest` | bool | `true` | Include `/manifest.webmanifest`. |
| `include_recent_pages` | int | `10` | Top-N most-recently-modified pages by `Lastmod`. `0` disables. |
| `extra_urls` | array | `[]` | Additional URLs (e.g., `["/about/", "/contact/"]`). Site-root-relative: each is normalized against `baseURL`, because Workbox's precache install is atomic and a single 404 takes down the whole service worker. |
| `exclude_globs` | array | `["/admin/*", "/preview/*"]` | Glob patterns to remove from the auto-discovered precache list. Matched as substrings against rendered page URLs, so these work unchanged on a subpath deployment. |

The assembled list is deduplicated by URL, first occurrence winning: Workbox rejects a precache list that names one URL twice with two different revisions, so naming a recent page in `extra_urls` would otherwise fail the install. The page's `Lastmod` revision is the one kept.

### Runtime caches (`params.pwa.sw.caches.*`)

Six cache buckets, each with its own `strategy`. Edit per bucket, not all at once. Valid `strategy` values: `"network-first"`, `"network-only"`, `"cache-first"`, `"cache-only"`, `"stale-while-revalidate"` (an unknown value degrades to `network-first`).

| Bucket | Default strategy | Default `max_entries` / `max_age_seconds` | Notes |
| --- | --- | --- | --- |
| `html` | `"network-first"` | 50 / 86400 (1 day) | `network_timeout_seconds = 3` for slow networks. |
| `style` | `"stale-while-revalidate"` | 30 / 2592000 (30 days) | Same-origin by default; add cross-origin CSS CDNs via `origins`. |
| `script` | `"stale-while-revalidate"` | 30 / 2592000 (30 days) | Same-origin by default; add cross-origin JS CDNs via `origins`. |
| `font` | `"cache-first"` | 20 / 31536000 (1 year) | `include_google_fonts = true` adds the Google Fonts + CDNJS origins on top of `origins`. |
| `image` | `"cache-first"` | 60 / 2592000 (30 days) | Same-origin by default; add cross-origin image CDNs via `origins`. |
| `api` | `"network-only"` | n/a | Pattern-matched on `url_pattern` (default `^/(api\|index\.json\|sitemap\.xml)`); clearing it disables the route. |

Every cache bucket honors an `origins` array for explicit cross-origin allowlists (e.g., your CDN origin), matched against the request URL's origin; the `font` bucket additionally honors `include_google_fonts: true` to add `fonts.gstatic.com` and the CDNJS origin on top of `origins`.

### SW bypass (`params.pwa.sw.bypass.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `urls` | array | `[]` | Exact URLs that bypass the SW entirely (always go to network). Site-root-relative: each is normalized against `baseURL`, then compared against the request's pathname or full href. |
| `patterns` | array | `[]` | Regex patterns; useful for `/admin/`, `/account/`, `/api/private/*`. NOT normalized (a regex is not a path) -- on a subpath deployment, write the pattern to match your path. |

### SW offline (`params.pwa.sw.offline.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | Master switch for offline fallback. When false (or when `sw.enabled` is false) the offline page is not generated, not precached, and the catch handler is not wired. |
| `fallback_url` | string | `"/offline/"` | URL of the offline page; also the rendered page's path. Site-root-relative: the content adapter creates the page there, and the URL handed to the service worker carries the `baseURL` path. |
| `fallback_image` | string | `""` | Optional fallback image for failed image requests (empty = no fallback image). When set it is precached and served by the catch handler for failed image requests. Site-root-relative: normalized against `baseURL`, so the precached URL and the catch handler's lookup agree. |

### Offline page

The offline fallback page is generated by a content adapter (`content/_content.gotmpl`) ONLY when both `params.pwa.sw.enabled` and `params.pwa.sw.offline.enabled` are true. A static content file cannot be gated on configuration (Hugo renders content unconditionally), so disabling the service worker or the offline fallback removes the page entirely -- it is never shipped as a dead public page, never precached (which would 404 the SW install), and never appears in `sitemap.xml`. The page is built with `build.list = "never"` and `sitemap.disable = true`, and carries `params.robots = "noindex, nofollow"` for consumer themes that emit a robots meta from `.Params.robots`.

It renders through your `baseof.html` shell (so it matches site styling) using the module layout `layouts/offline/single.html`, whose visible text comes from the `pwa_offline_title` / `pwa_offline_message` / `pwa_offline_retry` i18n keys. Override the look by shadowing `layouts/offline/single.html` in your own site. The page lives at `params.pwa.sw.offline.fallback_url`; the rendered page, the precache entry, and the SW catch handler all resolve to the page's actual `RelPermalink`, so subpath (baseURL with a path) deploys stay consistent. If you shadow the content adapter and no such page exists, the catch handler falls back to the configured value normalized against `baseURL` rather than to a raw root-absolute path.

If your site uses its own root `content/_content.gotmpl` content adapter, it shadows the module's (Hugo allows one adapter per directory); in that case add the offline page yourself or call the module's logic from your adapter.

### SW storage (`params.pwa.sw.storage.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `purge_on_quota_error` | bool | `true` | On `QuotaExceededError`, drop the largest cache so the SW can recover instead of failing all requests. |
| `request_persistent` | bool | `false` | Call `navigator.storage.persist()` after install. Browsers may prompt the user. |

### Install (`params.pwa.install.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | bool | `true` | Master switch for the install-prompt page-side script. |
| `mode` | string | `"deferred-button"` | Currently the only supported mode: capture `beforeinstallprompt`, defer to a consumer-supplied button. |
| `button_selector` | string | `"[data-pwa-install]"` | CSS selector for the install button. The button must start `[hidden]`. |
| `hide_when_installed` | bool | `true` | Hide the button when `appinstalled` fires. |
| `analytics_event` | string | `""` | When set, the install script dispatches a `window` `CustomEvent` with this name on `appinstalled`, so analytics integrations can log the install (in addition to the standard `pwa:installed` event). |
| `gate_on_push_intent` | bool | `true` | If true, install button stays hidden until the user clicks subscribe (push intent expressed). |
| `permission_strategy` | string | `"explicit-button"` | Reserved for future modes. The current implementation is always button-driven. |
| `remember_dismissed_days` | int | `30` | Days to suppress the install button after the user dismisses it. `0` disables suppression. |

### Push (`params.pwa.push.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enabled` | bool | `false` | Master switch. Off by default; flip to `true` and supply VAPID + URLs to enable. |
| `vapid_public_key` | string | `""` | Base64url-encoded P-256 public key. **Required** when `enabled = true`. Hugo build hard-fails if empty. |
| `subscribe_url` | string | `""` | POST URL for `{endpoint, keys: {p256dh, auth}}`. **Required** when `enabled = true`. A path is site-root-relative and normalized against `baseURL`; write a full URL for a backend that is not under your site path. |
| `unsubscribe_url` | string | `""` | POST URL for `{endpoint}` deletion. Optional; if empty the unsubscribe button only revokes locally. Same path handling as `subscribe_url`. |
| `subscribe_button_selector` | string | `"[data-pwa-subscribe]"` | CSS selector for the subscribe button. |
| `notification_icon` | string | `"/web-app-manifest-192x192.png"` | Default notification icon. Site-root-relative: normalized against `baseURL`. |
| `notification_badge` | string | `""` | Default notification badge (small monochrome icon for the Android status bar). Empty by default (no badge); set to a 72x72 monochrome PNG you add to `static/`. Site-root-relative: normalized against `baseURL`. |
| `default_click_url` | string | `"/"` | Page to focus when the user clicks a notification with no payload `url`. Site-root-relative: normalized against `baseURL`. |
| `focus_existing_tab_on_click` | bool | `true` | If a tab on the same origin is open, focus it instead of opening a new one. |

The unsubscribe button selector is hard-coded to `[data-pwa-unsubscribe]` in v1.0; a configurable `unsubscribe_button_selector` may be added in a future release.

## RFG modes

This module supports both modes of [RealFaviconGenerator](https://realfavicongenerator.net/) output, the canonical favicon-generator service for the web. Pick whichever matches the icon package you generate.

### Modern mode (default; RFG 2024 redesign)

Set `params.pwa.favicon.mode = "modern"` (default). Emits the minimal RFG 2024 head:

```html
<link rel="icon" href="/favicon.ico" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
```

Required static assets (drop into your site's `static/`):

- `static/favicon.ico` (multi-resolution: 16x16 + 32x32 + 48x48)
- `static/favicon.svg` (scalable vector)
- `static/apple-touch-icon.png` (180x180 PNG)
- `static/web-app-manifest-192x192.png` (referenced from manifest)
- `static/web-app-manifest-512x512.png` (referenced from manifest)
- `static/web-app-manifest-512x512-maskable.png` (Android adaptive)

### Legacy mode (pre-2024 RFG verbose head)

Set `params.pwa.favicon.mode = "legacy"`. Emits the historical verbose set:

```html
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#000000" />
<meta name="msapplication-TileColor" content="#ffffff" />
<meta name="msapplication-config" content="/browserconfig.xml" />
<link rel="manifest" href="/manifest.webmanifest" />
```

If you opted into the legacy filenames, also set `params.pwa.favicon.use_legacy_filenames = true`. This switches the manifest icon paths from `web-app-manifest-{192,512}x*.png` to `android-chrome-{192,512}x*.png` to match the legacy RFG package.

### `rfg-static` manifest pass-through

If your RFG package includes a `site.webmanifest` you would rather use verbatim, drop it into `static/` and set `params.pwa.manifest.mode = "rfg-static"`. The module then emits a `<link rel="manifest" href="/site.webmanifest">` pointing at your file instead of generating its own templated manifest.

### Generating an icon set

Run [https://realfavicongenerator.net/](https://realfavicongenerator.net/) against your source image, choose modern or legacy in the wizard, download the package, and unzip its contents into your site's `static/` directory. The naming convention is what determines `mode` -- there is no manual post-processing step.

## CustomEvents reference

The module dispatches nine `pwa:*` events on `window` for analytics, custom UI, and consumer integration. All events are dispatched via `window.dispatchEvent(new CustomEvent(name, {detail}))`.

| Event | Source | When fired | `event.detail` |
| --- | --- | --- | --- |
| `pwa:firstinstall` | `register.ts` | Per-page-load when SW is installed AND controlling. NOT once per client lifetime; analytics handlers should use a localStorage key (e.g., `__pwa_first_install_dispatched`) for first-time-only semantics. | `undefined` |
| `pwa:waiting` | `register.ts` | A new SW finished installing but the old one is still controlling. | `undefined` |
| `pwa:controlling` | `register.ts` | The new SW now controls the page; consumers usually reload here. | `undefined` |
| `pwa:installavailable` | `install.ts` | `beforeinstallprompt` was captured AND any push-intent gate has cleared. | `undefined` |
| `pwa:installed` | `install.ts` | Browser fired `appinstalled` after the user accepted the prompt. | `undefined` |
| `pwa:pushintent` | `push.ts` | User clicked the subscribe button OR an existing subscription was detected on page load. | `undefined` |
| `pwa:pushsubscribed` | `push.ts` | `pushManager.subscribe` succeeded and the subscription was POSTed to `subscribe_url`. | `{endpoint: string}` |
| `pwa:pushunsubscribed` | `push.ts` | User clicked unsubscribe; subscription was revoked locally and (if configured) on server. | `undefined` |
| `pwa:pushsubscriptionchange` | `register.ts` | Browser-initiated subscription rotation; SW posts a typed message to all clients. | `{newSubscription: object \| null}` |

### `pwa:firstinstall` per-page-load semantics

The `pwa:firstinstall` event fires ONCE PER PAGE LOAD whenever the service worker is installed AND controlling the page, NOT once per client lifetime. This per-page-load semantics is intentional: it gives every page-load observer (including handlers added late, after the SW has already been registered for prior loads) a deterministic signal that the SW is now active. The dispatch path in `register.ts` is three-fold:

- The Workbox `installed` event fires once during the `installing -> installed` lifecycle transition; `register.ts` dispatches `pwa:firstinstall` on that path when `!event.isUpdate` (initial install only).
- On every subsequent page load, `navigator.serviceWorker.ready.then(...)` resolves and -- if `navigator.serviceWorker.controller` is present -- dispatches `pwa:firstinstall` again.
- For the first navigation under `clientsClaim`, `ready` may resolve before `controller` is set; a one-shot `controllerchange` listener dispatches `pwa:firstinstall` when `controller` becomes available.

For analytics handlers that need TRUE first-time-only semantics (fire only once per client lifetime, not once per page load), gate the handler on a `localStorage` key:

```javascript
window.addEventListener('pwa:firstinstall', () => {
  const KEY = '__pwa_first_install_dispatched';
  if (localStorage.getItem(KEY)) return;
  localStorage.setItem(KEY, new Date().toISOString());
  analytics.track('pwa_first_install', {client_first: true});
});
```

For handlers that benefit from per-page-load semantics (e.g., showing an in-page toast on every load when the SW is active), use the event directly without a guard.

Consumer handler example:

```javascript
window.addEventListener('pwa:pushsubscribed', (e) => {
  // Anonymized analytics: hash the endpoint client-side, send the hash only.
  const hash = await sha256(e.detail.endpoint);
  analytics.track('pwa_subscribed', {endpoint_hash: hash});
});

window.addEventListener('pwa:installavailable', () => {
  document.querySelector('.install-cta-banner').classList.remove('hidden');
});
```

## Push backend integration

`push.ts` POSTs the subscription JSON (the canonical `PushSubscription.toJSON()` shape) to `params.pwa.push.subscribe_url`:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BNX...base64url...",
    "auth": "abc...base64url..."
  }
}
```

The fetch uses `credentials: 'same-origin'`, so cross-origin cookies are not attached. Your backend MUST validate the request origin and apply CSRF protection (origin allowlist, double-submit cookie, SameSite=Lax, or an origin-bound token).

The unsubscribe POST sends the minimum required body:

```json
{"endpoint": "https://fcm.googleapis.com/fcm/send/..."}
```

Your backend deletes the matching record by endpoint.

### Reference backends

Three runnable, audited reference implementations live in `examples/`:

| Platform | Storage | Push library | Path |
| --- | --- | --- | --- |
| Cloudflare Workers | Workers KV | Native `crypto.subtle` (VAPID JWT) | [`examples/backend-cloudflare-worker/`](../../examples/backend-cloudflare-worker/) |
| Node Express | Postgres | [`web-push`](https://www.npmjs.com/package/web-push) | [`examples/backend-express/`](../../examples/backend-express/) |
| Firebase Functions v2 | Firestore | [`web-push`](https://www.npmjs.com/package/web-push) | [`examples/backend-firebase-functions/`](../../examples/backend-firebase-functions/) |

Each reference exposes the canonical `/subscribe`, `/unsubscribe`, and admin-gated `/trigger` endpoints, validates origin, and reads VAPID secrets from a platform-appropriate secret store.

### VAPID keypair

Generate a keypair on the operator workstation (never on a CI runner with unprotected secret storage):

```bash
npx web-push generate-vapid-keys
```

The output prints `Public Key` and `Private Key` in base64url. Wire them up like this:

| Key | Where it goes |
| --- | --- |
| Public | `params.pwa.push.vapid_public_key` in your Hugo config (committed; the public key is meant to ship). |
| Private | Your backend's secret store ONLY. Never in the Hugo repo, the Hugo config, or any client bundle. |

Hugo build hard-fails if `params.pwa.push.enabled = true` and either `vapid_public_key` or `subscribe_url` is empty -- consumer misconfig is caught at build time, not at user-click time.

## Browser support

| Browser | Manifest | Service worker | Install prompt | Push API |
| --- | --- | --- | --- | --- |
| Chrome / Chromium / Edge | Yes | Yes | Yes (`beforeinstallprompt`) | Yes |
| Firefox (desktop) | Yes | Yes | No (browser-driven UI) | Yes |
| Safari (macOS 16+) | Yes | Yes | Yes (Add to Dock) | Yes (since macOS 13 / Safari 16) |
| Safari (iOS 16.4+) | Yes | Yes | Yes (Add to Home Screen) | Yes (only after install) |
| Safari (iOS 16.3 and below) | Yes | Yes | Yes (Add to Home Screen) | No |

The install prompt is Chromium-specific (the W3C `BeforeInstallPromptEvent` draft is not implemented in Gecko); on Firefox, the install button stays hidden because the script never receives the synthetic event. This is expected behavior, not a bug -- Firefox uses its own browser-chrome UI for PWA installation. Push subscription continues to work on Firefox.

## iOS Safari install-before-push flow

iOS Safari 16.4 introduced Web Push, but only for installed PWAs. The permission prompt does not appear in regular Safari; the user must add the site to the Home Screen first, then open the PWA, then tap the subscribe button.

### Default behavior

`gate_on_push_intent = true` (the default) aligns with iOS:

- The install button stays hidden until the user clicks subscribe.
- On Chromium, this gating actually does something visible.
- On iOS, install is driven by the Safari Share menu (not a button), so the gating is effectively silent and the user installs first via Safari, then opens the PWA and subscribes.

### Recommended consumer pattern

Detect iOS in your layout and show a "Tap Share -> Add to Home Screen" banner instead of (or alongside) the install button:

```javascript
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
if (isIos && !isStandalone) {
  document.querySelector('.ios-install-banner').classList.remove('hidden');
}
```

Inside the installed PWA (`display-mode: standalone`), the subscribe button works the same as on any other browser.

A full manual test checklist for iOS Safari is in [`test/IOS_MANUAL_MATRIX.md`](test/IOS_MANUAL_MATRIX.md). Automation is not feasible because the install flow runs entirely in the iOS Safari chrome.

## Workbox issue #3285 mitigation

Workbox's `wb.update()` is normally driven by browser navigations. Long-running tabs (background browser tabs that survive a redeploy) can miss an update for hours -- documented in [GoogleChrome/workbox#3285](https://github.com/GoogleChrome/workbox/issues/3285).

This module mitigates by polling `wb.update()` on an interval. Default is 3600 seconds (1 hour). Tune via:

```toml
[params.pwa]
update_check_seconds = 1800   # 30 min
# update_check_seconds = 0    # disable polling entirely
```

The polling is a one-line `setInterval` inside `register.ts`; cost is one HTTP HEAD-shaped request to `/sw.js` per interval. Keep the value above 60 seconds in production.

## Migration from `hugomods/pwa`

If you previously used [`github.com/hugomods/pwa`](https://github.com/hugomods/pwa), note these differences:

| Topic | hugomods/pwa | This module |
| --- | --- | --- |
| Workbox version | v6.5.4 (npm runtime CDN) | v7.4.1 (vendor-mounted via `modules/workbox`) |
| Toolchain | npm + workbox-build | None. Hugo `js.Build` (esbuild) compiles TS at site build time. |
| Service-worker source | `assets/service-worker.js` (your code) | Module-supplied; consumer overrides via `[params.pwa.sw.*]` config. |
| SW registration | Auto-injected at build | `{{ partial "pwa/head.html" . }}` in `baseof.html`. |
| Precache list | `params.pwa.precaches` array | `params.pwa.sw.precache.{include_recent_pages,extra_urls}` keys. |
| Install prompt | Manual | Built-in via `[params.pwa.install]`. |
| Push subscription | Not supported | Built-in via `[params.pwa.push]` + reference backends. |

There is no automatic migration. The consumer rewrites their `[params.pwa]` block per the Configuration Surface tables above.

## Security

### VAPID private key

**The VAPID PRIVATE key MUST stay server-side.** Never put it in `params.pwa`, `hugo.toml`, the Hugo repo, or any client bundle. The public key is meant to ship in `vapid_public_key`; the private key belongs in your backend's secret store (`wrangler secret put`, `firebase functions:secrets:set`, env var, vault, etc.).

A leaked private key lets an attacker send pushes to your entire subscriber base. Treat it as a production credential.

### `userVisibleOnly: true` is hard-coded

`pushManager.subscribe({userVisibleOnly: true, ...})` is the only mode this module supports. Chromium rejects subscribe with `NotAllowedError` when the flag is false, and Firefox issues a console warning. Silent push (`userVisibleOnly: false`) is not exposed and not configurable -- this is a Web Push policy decision in the browsers, not a module choice.

### CSRF on subscribe / unsubscribe

`push.ts` uses `credentials: 'same-origin'`; cookies are not attached on cross-origin POSTs. Your backend MUST still:

1. Validate `Origin` (or `Referer` fallback) against an allowlist.
2. Apply double-submit cookie or origin-bound token if you accept cross-origin requests at all.

The three reference backends in `examples/` implement origin validation as the primary defense.

### HTTPS-only

The Push API and service workers require HTTPS in production. `http://localhost` (and `127.0.0.1`) is the only HTTP exception, used by the dev server. Production sites MUST be served over HTTPS or the SW will not register at all.

### GDPR / right-to-erasure

Push endpoints are user-identifying data per GDPR. Your backend should:

- Allow users to revoke (the unsubscribe button calls `subscription.unsubscribe()` and POSTs to `unsubscribe_url`).
- Encrypt subscription rows at rest.
- Provide an admin path to delete-by-endpoint on user request.
- Record consent at subscribe time if your jurisdiction requires it.

## Troubleshooting

### "Service worker not registered"

- Verify `params.pwa.sw.enabled` is not explicitly set to `false`.
- Check the browser DevTools Application -> Service Workers panel for the exact error.
- HTTPS or `localhost` is required; `http://192.168.x.x` will fail.
- Check the Hugo build log for `js.Build` errors in `register.ts` or `service-worker/index.ts`.
- On a site whose `baseURL` has a path, confirm the registration URL matches the published worker: view source and compare `<!-- pwa-sw: ... -->` with the URL the registration script requests. Both should carry your path (`/docs/sw.js`). If you hand-prefixed `sw_path` or `sw_scope`, remove the prefix -- see [Paths and subpath deployments](#paths-and-subpath-deployments-baseurl-with-a-path).

### "Install button never appears"

- Expected on Firefox (no `BeforeInstallPromptEvent` in Gecko).
- On Chromium, check that `gate_on_push_intent = true` and the user has not yet clicked subscribe; the button stays hidden until intent fires.
- Set `gate_on_push_intent = false` to reveal the button as soon as the browser fires `beforeinstallprompt` (typically a few seconds after page load on the second-or-later visit).

### "Push subscribe fails silently on iOS"

- Expected on iOS pre-install. iOS only allows push permission AFTER the PWA is installed via Safari -> Add to Home Screen.
- Open the installed PWA from the Home Screen (not Safari) and tap subscribe.

### "RFG checker reports errors"

- Verify all icon files exist in `static/` and are named per the mode (`web-app-manifest-*` for modern, `android-chrome-*` for legacy with `use_legacy_filenames = true`).
- Verify `params.pwa.favicon.mode` matches the package you generated.

### "Workbox `module not found` during Hugo build"

- The `pwa` chain did not fully resolve, so the `modules/workbox` / `modules/idb` mounts are missing. Run `hugo mod graph` and read which chain module is unresolved: a `module.*not found` names a missing mount, and an `invalid version: unknown revision 000000000000` means the site is pinned to a `modules/pwa` that predates the resolvable-chain change -- move that pin forward with `hugo mod get -u github.com/alex-feel/hugo-artifacts/modules/pwa && hugo mod tidy` (Installation -> option A).

### "Cache is not busted on redeploy"

- Bump `params.pwa.version` (any string change rotates caches).
- Verify your CDN serves `/sw.js` with `Cache-Control: no-cache` so the browser re-checks the script on each load. Workbox itself versions the precache manifest, but the SW script bytes need to be re-fetched for the version bump to be observed.

## Validation

A 9-row Playwright validation matrix lives in [`test/`](test/). Coverage:

| Row | Scenario              |
| --- | --------------------- |
| 1   | SW registration       |
| 2   | Manifest correctness  |
| 3   | RFG modern mode head  |
| 4   | RFG legacy mode head  |
| 5   | Install prompt gating |
| 6   | Push subscription     |
| 7   | Offline rendering     |
| 8   | Update flow banner    |
| 9   | Lighthouse PWA audit  |

Row 7 (offline rendering) asserts that `/offline/` renders the module layout (heading + retry button) and is excluded from `sitemap.xml`.

Two build-level checks (in `test/`) assert on Hugo's output instead of a browser, so they need no Playwright install and bind no ports:

- `npm run test:offline-gating` builds the fixture with the offline fallback enabled and disabled and asserts that the offline page, its precache entry, and the SW catch handler appear only when enabled.
- `npm run test:subpath` builds the fixture under `baseURL = https://example.org/docs/` and under a root baseURL, and asserts that the registered service-worker URL and scope, the manifest `scope` / `start_url` / `id`, every icon `src`, every `<link>` href, and every precache URL carry the baseURL path in the first build and stay un-prefixed in the second. See [Paths and subpath deployments](#paths-and-subpath-deployments-baseurl-with-a-path).

See [`test/README.md`](test/README.md) for matrix usage instructions.
