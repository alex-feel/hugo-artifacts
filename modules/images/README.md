# images

Universal build-time image module for Hugo: ONE processing pipeline behind THREE authoring surfaces -- a partial for templates, an `image` shortcode for content, and a Markdown image render hook that upgrades plain `![alt](src)` site-wide -- all sharing one parameter vocabulary and one central renderer, so identical inputs emit identical markup. Every render is responsive (width-descriptor srcsets that never upscale), optimized (WebP plus original-format fallback, AVIF opt-in), and accessible (strict alt discipline, native figure semantics, guaranteed `width`/`height` for zero layout shift). The module emits style-agnostic semantic [BEM](https://getbem.com/) markup with `data-*` attributes and ships ZERO CSS and ZERO JavaScript -- the consuming site owns all presentation.

## Installation

Add the module to your site configuration and fetch it:

```toml
# hugo.toml
[[module.imports]]
  path = 'github.com/alex-feel/hugo-artifacts/modules/images'
```

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/images
```

**Template lookup precedence:** a local `layouts/_shortcodes/image.html`, `layouts/_shortcodes/image-gallery.html`, any file under `layouts/_partials/images/`, or a local `layouts/_markup/render-image.html` in your site OVERRIDES the module's template of the same path. If the module "does nothing", check for a shadowing local template first.

For local development against a checkout of this repository, use `hugo.work` or `[module.replacements]` as described in the repository root [`README.md`](../../README.md) and [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

The following consumer-side configuration cannot ship inside the module (Hugo does not merge a module's `markup`, `caches`, or `security` configuration into the consuming site):

```toml
# hugo.toml -- recommended companion configuration
[markup.goldmark.parser]
  # Without this every Markdown image renders the inline form (no <figure>,
  # no caption surface) -- a graceful, valid degradation.
  wrapStandAloneImageWithinParagraph = false

  [markup.goldmark.parser.attribute]
    # Without this the per-image Markdown attribute overrides are unavailable
    # (attributes are enhancement, never a dependency).
    block = true

# CI cache persistence for processed derivatives (see Performance and caching).
[caches.images]
  dir = ':cacheDir/images'
  maxAge = -1
```

Only when you enable build-time remote fetching (`remote.fetch = true`), allow-list the hosts you fetch from under `[security.http] urls`, and extend `security.http.mediaTypes` only for exotic image types (Hugo's defaults already cover the standard rasters).

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+ (any edition: WebP and AVIF encoding are WASM-based, so the full imaging pipeline works in every Hugo edition)
- [Go](https://go.dev/) 1.22+ (required by Hugo Modules).
- AVIF output additionally requires Hugo 0.163.0+; the module feature-detects the version and degrades to WebP plus the original format with one build warning below it.

## Usage

### Partial (templates)

```go-html-template
{{ partial "images/image.html" (dict
  "page" .
  "src" "photo.jpg"
  "alt" "A described scene"
) }}
```

`src` resolves in this order: a `data:` URI or a URL-shaped value is classified first and passes through by default (it is never matched against resources), then a page-bundle resource (exact name, then glob), then a global resource under `assets/` (a leading-slash path is tried against `assets/` first, with the slash stripped), then a leading-slash path that matched no resource resolves as a `static/` path (passthrough); anything else is a missing source (one warning, raw-src `<img>` fallback). `page` and `src` are required; `alt` is required unless `decorative` is true.

### Shortcode (content)

```go-html-template
{{</* image src="photo.jpg" alt="A described scene" */>}}
{{</* image "photo.jpg" "A described scene" */>}}
{{</* image src="hero.jpg" alt="..." priority="true" layout="full" */>}}
```

The shortcode accepts the same names as the partial (named parameters, plus a two-positional `src` then `alt` shorthand -- `{{</* image "photo.jpg" "A described scene" */>}}`) and forwards only the parameters you set, so everything else falls through the configuration cascade. Positional `alt` is offered because `alt` is a call-tier-only key that never cascades, so a `src`-only positional call cannot satisfy the alt requirement.

### Markdown images (render hook)

**Activation is site-wide:** importing this module upgrades EVERY Markdown image on your site through the shipped render hook.

```text
![A described scene](photo.jpg)

![A fixed-width badge](badge.png)
{layout="fixed" width="120"}
```

The attribute block goes on its OWN LINE directly BELOW a standalone image. A same-line `{...}` silently delivers no attributes and additionally makes the image non-standalone (inline form). See the Render hook section for the escape hatches.

### Figure with caption, credit, and license

```go-html-template
{{</* image src="photo.jpg" alt="..." caption="A *fine* view" credit="Photo: **Jane** Doe" license="CC BY 4.0" license_url="https://creativecommons.org/licenses/by/4.0/" */>}}
```

Caption and credit render as inline Markdown. Any of the three surfaces turns the render into a `<figure>` with a `<figcaption>` (block contexts only). Inside the `<figcaption>` the caption sits in its own `image__caption` span while credit and license group inside one `image__meta` span, with an empty `image__meta-separator` span between them when both are present. The separator carries `aria-hidden="true"`, so the glyph you supply is guaranteed to stay out of the accessibility tree; your CSS owns the glyph via a `::before` pseudo-element (see the Styling section).

### Fixed-layout assets (logos, avatars, badges)

```go-html-template
{{</* image src="avatar.png" alt="..." layout="fixed" width="96" */>}}
```

Fixed layout emits density descriptors (`1x`, `2x`) instead of width descriptors and requires an explicit `width` or `height` -- a height alone derives the width proportionally from the source's aspect ratio.

### Art direction (partial only)

```go-html-template
{{ partial "images/image.html" (dict
  "page" .
  "src" "wide.jpg"
  "alt" "..."
  "variants" (slice
    (dict "src" "square.jpg" "media" "(max-width: 600px)" "dark" "square-dark.jpg"))
) }}
```

Each variant needs `src` and `media` (a complete media query) and may override `dark`, `process`, `width`, `height`, and `widths`. `variants` is a slice of dicts and therefore exists on the partial surface only. A variant without a `dark` key serves its light source in dark mode too.

### Gallery

```go-html-template
{{</* image-gallery match="gallery/*" */>}}
{{</* image-gallery match="gallery/*" crop="1x1" */>}}
{{</* image-gallery match="photos/*" lightbox="false" id="grid" class="tight" */>}}
```

Beyond `match` (required) and `crop`, the gallery accepts `lightbox` (per-gallery override of the `true` default), `index_pad` (minimum `data-index` digit width -- see the data-\* attributes section), `id` and `class` on the `<ol>`, and the standard cascade keys `widths`, `sizes`, `sizes_auto`, `formats`, `loading`, `placeholder`, `responsive`, `enable`, `quality`, `anchor`, `resample`, `bg`, `hint`, `compression`, `layout`, and `max_density`, forwarded to every item.

Per-item alt, caption, and credit come from the page's front-matter `resources:` metadata (`params.alt`, `title`, `params.credit`). The caption uses `title` only when it is explicitly set: Hugo defaults an untitled resource's `title` to its file name, and the gallery suppresses that default so a file name never leaks into a caption -- a resource with no `title` renders caption-free.

```yaml
resources:
  - src: gallery/one.jpg
    title: Caption for one
    params:
      alt: What the image shows
      credit: Photographer name
```

### Remote images

```go-html-template
{{</* image src="https://example.com/photo.jpg" alt="..." */>}}
{{</* image src="https://example.com/photo.jpg" alt="..." fetch="true" */>}}
```

By default a URL is emitted untouched (passthrough, no processing, no third-party contact at build time). With `fetch="true"` (or `[params.img.remote] fetch = true`) the module downloads the image at BUILD time, runs the full pipeline, and republishes the derivatives same-origin, so the rendered page makes zero third-party requests. Every surface honors `fetch` identically -- the partial, shortcode, and render hook, plus `images/preload.html`, `images/src.html`, and remote `dark`/`variants` sources all resolve through one shared fetch step -- so a fetched remote hero preloads and renders processed bytes consistently. Requires the `[security.http]` allow-list from the Installation section. The remote cache never expires by default; pass a new `remote_key` value to force a refetch.

### Disabling

```yaml
# Per page (front matter): neutral fallback everywhere on the page.
img:
  enable: false
# Render hook only, keeping partial/shortcode call sites fully active:
img:
  hook:
    enable: false
```

Per image in Markdown, append the `#raw` fragment: `![alt](photo.jpg#raw)`. Per call, pass `enable="false"`. Site-wide, set `params.img.enable = false`. The neutral fallback publishes the original file as-is with alt/class/loading preserved -- content always keeps rendering.

## Parameters

The `Tiers` column states where each option may be set: `all four` cascades through the full four-tier resolution (defaults, `[params.img]`, `img:` front matter, call), while `call only` is read from call arguments alone -- setting it in `[params.img]` or `img:` is a silent no-op. This matches the module's design: call-tier-only options either are per-image by nature (`alt`, `caption`, `id`, ...) or must be impossible to configure site-wide (`fetchpriority`, section 5.8 of the design).

| Parameter | Type | Required | Tiers | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `page` | Page | yes (partial) | call only | -- | The calling Page (the shortcode and hook pass it automatically) |
| `src` | string | yes | call only | -- | Image source: bundle resource, `assets/` path, `/static` path, or URL |
| `alt` | string | yes unless `decorative` | call only | -- | Alternative text describing the image |
| `decorative` | bool | no | call only | `false` | Emit the explicit empty `alt=""` of a purely decorative image |
| `dark` | string | no | call only | -- | Dark-variant source (same resolution order as `src`) |
| `variants` | slice of dicts | no (partial only) | call only | -- | Art-direction variants (`src` + `media` each) |
| `caption`, `credit` | string | no | call only | -- | Inline-Markdown figure surfaces |
| `license`, `license_url` | string | no | call only | -- | License display name and URL |
| `width`, `height` | int or `"640px"` | no (see Validation) | call only | -- | Display/derivative geometry |
| `process` | string | no | call only | `resize` | `resize`, `fit`, `fill`, or `crop` |
| `quality` | int | no | call only | per-format | Overrides every lossy format's quality for this call (per-format defaults set via `[params.img.quality]` cascade all four tiers) |
| `anchor`, `resample`, `bg`, `hint`, `compression` | string | no | all four (via `[process_defaults]`) | see cascade | Spec options: crop anchor, resampling filter, `#RRGGBB` background, WebP preset, `lossy`/`lossless` |
| `layout` | string | no | all four | `constrained` | `constrained`, `full`, or `fixed` (see Responsive behavior) |
| `widths` | slice or `"480,800"` | no | all four | `[640, 960, 1280, 1920]` | Width ladder override |
| `max_density` | int | no | call only | `densities` maximum | Density cap/lift (also caps the constrained-layout fidelity at `max_density * width`) |
| `sizes` | string | no | all four | generated | Explicit `sizes` attribute override (verbatim) |
| `sizes_auto` | bool | no | all four | `true` | Prefix the sizes value with `auto` on lazy-loaded images |
| `formats` | slice or `"avif,webp"` | no | all four | `['webp']` | Modern format chain (`webp`, `avif`) |
| `loading` | string | no | all four | `lazy` | `lazy` or `eager` |
| `priority` | bool | no | call only | `false` | LCP hero mode: eager, `fetchpriority="high"`, no `decoding` (exactly one per viewport-critical region) |
| `fetchpriority` | string | no | call only | -- | `high`, `low`, or `auto`; deliberately excluded from the site/page tiers |
| `placeholder` | string | no | all four (via `[placeholder] mode`) | `none` | `none`, `dominant`, or `blur` (see Placeholders) |
| `lightbox` | bool | no | call only (gallery: `[gallery] lightbox`) | `false` (gallery: `true`) | Wrap in an anchor to a capped full-size derivative |
| `index_pad` | int | no | gallery call (`[gallery] index_pad` for the default) | `1` | Minimum `data-index` digit width on gallery items; the item count's own digit width still wins when larger |
| `theme_strategy` | string | no | all four (via `[theme] strategy`) | `media` | `media` (OS preference) or `class` (class togglers) |
| `fetch` | bool | no | all four (via `[remote] fetch`) | `false` | Build-time remote fetch opt-in |
| `remote_key` | string | no | call only | -- | Remote fetch cache key |
| `responsive` | bool | no | all four | `true` | `false` collapses to a single derivative (build-speed kill switch) |
| `enable` | bool | no | all four | `true` | Per-call kill switch (neutral fallback) |
| `credit_from_meta` | bool | no | all four (via `[credit_from_meta]`) | `false` | Fall back to the original image's IPTC credit/byline when `credit` is empty (see Accessibility) |
| `class` | string | no | call only | -- | Extra class(es) appended to the `<img>` element |
| `root_class` | string | no | call only | -- | Extra class(es) appended to the ROOT element -- the figure, anchor, swap span, picture, or img, whichever the render makes root (see Root element by combination) |
| `id` | string | no | call only | -- | `id` attribute on the root element |

### Validation

Build-failing `errorf` -- ON THE PARTIAL AND SHORTCODE SURFACES ONLY -- covers exactly the parameter-shape authoring mistakes: missing `page`/`src`, missing `alt` without `decorative=true`, `decorative=true` combined with a non-empty `alt`, `decorative=true` combined with `lightbox=true`, `layout=fixed` without a `width` or `height`, and `process` of `fit`/`fill`/`crop` without BOTH `width` and `height` (either dimension missing fails, because these operations need a two-dimension target).

Everything environmental degrades with ONE deduplicated build warning and a safe rendering: missing files (raw-src `<img>` fallback), remote failures (URL passthrough), unknown enum tokens (feature default), AVIF below the version gate (WebP plus original), unknown named shortcode parameters (a typo such as `captoin=` is ignored after one warning naming it), and feature requests on unprocessable sources (feature skipped).

The render hook NEVER calls `errorf` and demotes every listed contradiction to a warning plus a defined degradation (empty alt renders `alt=""`, fixed without a width or height falls back to `constrained`, fit/fill/crop missing either dimension falls back to `resize`, decorative wins over Markdown alt, decorative suppresses the lightbox anchor) -- Markdown content can never break the build.

## Configuration cascade

The options marked `all four` in the Parameters table resolve through four tiers, presence-wins at each (an explicit `false`, `0`, or `""` overrides the tier below). The options marked `call only` are read from call arguments alone: they are either per-image by nature (`alt`, `caption`, `width`, `id`, ...) or deliberately excluded from the site/page tiers (`fetchpriority` -- a site-wide deprioritized-images default must be impossible to configure), so setting a call-only option in `[params.img]` or the `img:` front matter is a silent no-op. The four tiers, lowest to highest precedence:

1. The shipped defaults ([`data/images/defaults.toml`](data/images/defaults.toml) -- fully commented, the authoritative key reference).
2. Site configuration: `[params.img]`.
3. Page front matter: the `img:` map.
4. Call-site arguments (partial dict keys, shortcode named parameters, hook Markdown attributes).

**The configuration namespace is `img`, NOT `images`, and this is deliberate:** Hugo's embedded Open Graph and Twitter Cards templates read page front matter `images` and site `params.images` as an ARRAY of image paths, and common front-matter conventions (including sibling modules in this repository) share that array vocabulary. TOML and YAML cannot hold both an array and a map at the same key, so a map-shaped `images` namespace would structurally break Hugo's own embedded templates for every consumer using them. The module name stays `images` (directory, partials, data); only the configuration key is `img`.

Nested sections (`quality`, `process_defaults`, `placeholder`, `lightbox`, `theme`, `remote`, `hook`, `gallery`) cascade per KEY, so a page can override `quality.webp` alone without restating the section:

```toml
# hugo.toml
[params.img]
widths = [480, 960, 1600]
formats = ['avif', 'webp']

[params.img.quality]
webp = 80

[params.img.placeholder]
mode = 'dominant'
```

Shortcode parameters and Markdown attributes deliver strings; the module normalizes every typed key at one place (bools accept `true`/`1`/`yes`/`on`, dimensions accept `"640"` and `"640px"`, integers parse as decimal -- a leading zero never turns a value octal, and an absurdly long digit string is garbage rather than an overflow -- slices accept `"480,800"` comma strings, unknown tokens warn once and fall back), so every surface lands on identical typed values.

When verifying the resolved configuration with `hugo config`, note that the command omits keys whose value is `false`, so an absent key in its output does not prove the option is unset -- verify boolean keys by their rendered effect instead.

## Formats and AVIF

The default chain is a WebP `<source>` plus an original-format fallback `<img>`, both carrying full srcsets; browsers pick by `type`. A `<picture>` wrapper is emitted only when at least one `<source>` exists -- an already-WebP source with the default `formats = ['webp']` collapses to a single bare `<img>` chain. BMP and TIFF sources fall back to JPEG (no browser-appropriate original format; transparent regions fill with the effective background color). GIF is ALWAYS passthrough: animation survives only when the target stays GIF, and templates cannot distinguish animated from static GIFs -- re-encode a static GIF as PNG to opt into the pipeline.

AVIF is opt-in (`formats = ['avif', 'webp']` at any tier) and version-gated: per-image AVIF quality in processing specs requires Hugo 0.163.0+, so below that version the module skips AVIF with one build warning and emits WebP plus the original format. When enabled and gate-passed, AVIF sources are emitted FIRST (browsers take the first matching type). AVIF is excluded from the default because at Hugo's defaults it measures larger than WebP q75 on UI-screenshot-class content while roughly doubling cold-cache processing time -- enable it for photographic content after measuring.

Default qualities (explicit in every processing spec, so output is deterministic across consumers regardless of their own `[imaging]` configuration): WebP 75, AVIF 60, JPEG 75; the crop anchor defaults to `Smart` and the resampling filter to `lanczos`. AVIF encoder speed is NOT a per-image option; it is the consumer's own `[imaging.avif] encoderSpeed` setting: keep the default 10, or set 8 for real byte savings -- NEVER 6 or below, which stalls the encoder and hard-fails every affected image after an internal timeout.

## Responsive behavior

The default width ladder is `[640, 960, 1280, 1920]` (configurable site-wide via `widths` or per call). The effective candidates never upscale: entries strictly greater than the source width are dropped (an entry exactly equal stays), and the capped source width joins as the top candidate when it is smaller than the ladder top. With an explicit `width` in `constrained` layout, candidates are additionally capped at `max_density * width` (2x by default: fidelity beyond 2x DPR is not perceivable and roughly doubles bytes; pass `max_density=3` for a genuine 3x need). A height-only call (`height` set, `width` unset, under the default `process=resize`) derives the equivalent width from the source's aspect ratio before planning, so it behaves exactly like the equivalent explicit width -- on every layout, `fixed` included.

| `layout` | srcset | Generated `sizes` | Use |
| --- | --- | --- | --- |
| `constrained` (default) | w-descriptors | `(min-width: {W}px) {W}px, 100vw` | Content images in a max-width column (`W` = `width`, else the top candidate) |
| `full` | w-descriptors | `100vw` | Full-bleed heroes |
| `fixed` | x-descriptors | none (x-descriptors do not use `sizes`) | Logos, avatars, badges; `width` or `height` required |

An explicit `sizes` parameter always wins verbatim. When `sizes_auto` is true (the default) AND the image is lazy-loaded, the emitted value is `auto, <fallback>`: browsers with `sizes=auto` support (Chromium 126+, Firefox 150+) size from the layout, and all others (Safari included) skip the invalid first entry and use the fallback list -- zero regression. The prefix is never emitted on eager/priority images (invalid there).

For `fixed` layout the density list is the configured `densities = [1, 2]` filtered to `max_density` (a larger `max_density` appends itself); each density is emitted only when `width * density` fits the source width. `responsive = false` at any tier collapses the plan to a single derivative while keeping format conversion and CLS dimensions -- the build-cost kill switch.

Every processed `<img>` carries `width` and `height` from its fallback derivative (post-orientation truth; EXIF-rotated portraits reserve the correct portrait box), and every media-qualified `<source>` (art direction, differently-shaped dark variants) carries its own `width`/`height` so a media-matched variant with a different ratio cannot shift the layout. See the Styling section for the two lines of consumer CSS this contract expects.

## Dark-mode variants

Supply the `dark` parameter with a second source and pick a strategy via `theme_strategy` (or `[params.img.theme] strategy`):

**`media` (default, OS preference, zero consumer CSS needed):** one `<picture>` whose dark sources come FIRST, each with `media="(prefers-color-scheme: dark)"` -- covering every enabled modern format PLUS a media-qualified original-format source, so non-WebP browsers in dark mode still get the dark image -- followed by the light sources and the light fallback `<img>`. Every `<source>` and the `<img>` carry `data-theme-variant`, so a class-toggler site can still adopt a small media-rewrite script of its own (the module ships no JavaScript).

**`class` (opt-in, for `html.dark`-style togglers):** TWO complete trees inside one wrapper carrying `image--theme-class` and `data-theme-swap="class"`; each tree root carries `data-theme-variant`, both trees share the same `alt`, and the dark tree is `loading="lazy"` UNCONDITIONALLY (an eager hidden variant is a guaranteed double download in every engine). The consuming site MUST ship the toggling CSS -- without it both trees render, by design:

```css
[data-theme-swap='class'] [data-theme-variant='dark'] {
  display: none;
}
html.dark [data-theme-swap='class'] [data-theme-variant='light'] {
  display: none;
}
html.dark [data-theme-swap='class'] [data-theme-variant='dark'] {
  display: revert;
}
```

The reveal rule is `display: revert` (not `block`) so an inline-context render keeps its inline flow. Hiding MUST be `display: none` -- `visibility: hidden` and `opacity: 0` still fetch the hidden image. With the CSS active, only the displayed variant downloads at load and the hidden lazy variant downloads at first toggle; with visitor JavaScript disabled, browsers ignore `lazy` and both variants download while rendering stays correct; CSS-less readers (RSS) render both variants -- inherent to a zero-CSS module, which is exactly why `media` is the default.

`priority=true` combined with the `class` strategy warns once: for a dark-default visitor the VISIBLE dark tree is lazy (delayed LCP) while the hidden light tree downloads eagerly at high priority. Priority heroes with dark variants should use the `media` strategy (one tree, one prioritized fetch). Dark variants should be genuinely re-arted images, not dimmed copies -- dimming is not an inclusive strategy.

## Placeholders

Opt-in and JS-free (`placeholder` parameter or `[params.img.placeholder] mode`); default `none` generates no placeholder derivatives at all:

- `dominant`: samples the image's most dominant color from a downscaled probe and emits `data-placeholder="dominant"`, `data-dominant-color="#rrggbb"`, `data-dominant-luminance="0.NN"` (so your CSS/JS can pick contrasting overlays), and `--image-dominant-color` in the root `style`.
- `blur`: generates one tiny blurred WebP (width `placeholder.blur_width`, default 20; sigma `placeholder.blur_sigma`, default 3), inlined as a base64 data URI in `--image-placeholder` on the root `style`.

The values crossing into `style` are objective MEASURED data about the image (a sampled color, the image's own pixels), never design decisions; presentation stays 100 percent consumer CSS (see the Styling Recipes for the selector pair that paints only the image box), and with no consumer CSS the placeholders are inert attributes. Both modes compose with native `loading="lazy"`; no-JS visitors always receive the real image, and the alt text is never touched by placeholder machinery.

CSP note: the root `style` attribute requires your Content-Security-Policy to permit inline style attributes (`style-src-attr` -- or a `style-src` that covers attributes), and the blur data URI requires `img-src data:` only if your CSS loads it via `background-image`. Without those permissions the placeholders degrade to inert attributes while `data-dominant-color` still carries the value for JavaScript consumers. Client-side BlurHash/ThumbHash renderers remain possible on top of the emitted data attributes as a consumer-owned enhancement.

## Lightbox

`lightbox=true` (default `true` inside galleries) wraps the picture in `<a class="image__link" href="..." data-full-src="..." data-full-width="..." data-full-height="...">` where the target is a CAPPED derivative: `min(source width, lightbox.width)` (default 2048) in the fallback format -- never the multi-megabyte original. The plain anchor is the no-JS/no-CSS baseline (functional, shareable, back-button friendly); the `data-full-*` attributes carry the upfront dimensions PhotoSwipe-class libraries require. The module ships zero lightbox JavaScript and zero CSS -- see the Styling Recipes for PhotoSwipe, GLightbox, and CSS-only wiring. On unprocessable sources the anchor links the passthrough URL with `data-full-src` only. Because the capped derivative is processed, it is metadata-stripped like every derivative.

## Render hook

Importing the module registers `layouts/_markup/render-image.html` for EVERY Markdown image on the consuming site -- **activation is site-wide**. The hook is non-destructive on every path: unresolvable and unprocessable destinations degrade per the passthrough rules, and no Markdown content can ever break the build (see Validation).

Per-image attribute overrides use the block-attribute syntax ON ITS OWN LINE directly BELOW a standalone image:

```text
![Alt](photo.jpg)
{width="640" layout="fixed" lightbox="true"}
```

A trailing SAME-LINE `{...}` after the image silently delivers NO attributes and additionally makes the image non-standalone (inline form) -- always put the block below the image. Attribute names matching the Parameters table become call-tier overrides; remaining attributes pass through onto the `<img>`, except that every attribute name the module itself emits (`src`, `srcset`, `sizes`, `alt`, `width`, `height`, `loading`, `decoding`, `fetchpriority`, `class`, `style`, and the module's `data-*` names) is dropped with one warning, because a duplicate attribute would produce invalid HTML that silently ignores the author.

Bypasses, per image to site-wide: the `#raw` destination fragment (`![alt](photo.jpg#raw)`) bypasses the pipeline for that one image with no configuration; `[params.img.hook] enable = false` (site) or `img: { hook: { enable: false } }` (page) makes the hook emit the neutral fallback while partial/shortcode call sites keep the full pipeline; and a project-level `layouts/_markup/render-image.html` replaces the module's hook entirely.

## Performance and caching

Derivative count per processed image = effective ladder length x number of chains, plus extras: the shipped defaults (4-step ladder, WebP + original) generate 8 derivatives; a lightbox adds 1; a placeholder adds 1 (probe or blurred tiny); a dark pair roughly doubles the count; AVIF adds one more full chain at roughly 1.2-1.5x the WebP per-variant encode cost. Orientation correction adds zero entries (it is chained inside each derivative's single cached transformation). Unreferenced variants cost nothing: Hugo generates derivatives lazily at template-execution time and publishes only what templates reference.

Derivatives cache under `caches.images` (`:resourceDir/_gen` by default, `maxAge = -1`): either COMMIT `resources/_gen` or persist it in CI cache -- the portable CI pattern points `caches.images.dir` at `:cacheDir/images` (see Installation) so the CI cache step can capture it. Changed processing specs orphan old derivatives until `hugo --gc`. Remote fetches cache under `caches.getresource` and never expire by default; refresh via the `remote_key` parameter.

Derivative URLs are content-hashed, so ship immutable host headers for the derivative paths: `Cache-Control: max-age=31536000, immutable`.

The dominant cost driver is oversized sources: processing time and memory grow with source dimensions, so pre-scale multi-megapixel originals toward roughly 2x the largest rendered width before committing them. The cost escape valves are the lean defaults (default-off AVIF and placeholders), `responsive = false`, and the `enable` kill switches at every tier. For image SEO beyond page markup, an image sitemap is a site-level output-format recipe the consumer owns -- see Google's image-sitemap documentation; this module emits display markup only (no `og:image`, no JSON-LD -- that surface belongs to an SEO module).

## Privacy

Hugo does not preserve metadata during image transformation, so EVERY derivative this module publishes is EXIF/GPS-free by construction -- no extra stripping step exists or is needed.

The paths that publish ORIGINAL bytes -- with any embedded metadata intact -- are: `static/` passthrough, GIF passthrough, SVG/ICO passthrough, remote passthrough URLs, AVIF/HEIC sources on Hugo versions that cannot decode them, PLUS every neutral-fallback path: `enable = false` at ANY tier, `[params.img.hook] enable = false`, and the `#raw` per-image bypass. Flipping a kill switch on a page of GPS-tagged photos therefore ships the coordinates -- strip metadata at the source if that matters to you.

With `remote.fetch = true`, remote images are fetched once at BUILD time and republished same-origin, so rendered pages make zero third-party requests for images.

## Accessibility

- `alt` is required on the partial and shortcode surfaces; a missing alt is a build error, not a silent gap. `decorative=true` emits exactly `alt=""` (assistive technology skips the image) and contradicts both a non-empty `alt` and `lightbox=true` (an anchor whose accessible name is the empty alt is announced as a bare "link" -- a WCAG 2.4.4/4.1.2 failure), so those combinations fail the build on the strict surfaces and degrade with a warning on the hook and gallery surfaces.
- Caption association is native `<figure>`/`<figcaption>` semantics -- the module fabricates no ARIA roles, relationships, or ids from text; its only ARIA output is the separator hook's `aria-hidden="true"`, which keeps the decorative glyph out of the accessibility tree, and semantic HTML carries everything else. The lightbox anchor's accessible name is the contained image's alt (native behavior).
- Dark variant trees carry the SAME alt; under the class strategy the hiding CSS (`display: none`) removes the hidden tree from the accessibility tree, so exactly one image is announced.
- Captions and credits are Markdown rendered under YOUR site's goldmark security settings: with the default `unsafe = false` raw HTML is stripped; a site that enables `unsafe = true` owns that consequence.
- `credit_from_meta = true` (default `false`, cascades all four tiers) fills the credit line from the ORIGINAL image's embedded IPTC metadata when no explicit `credit` is supplied: the module reads the IPTC `Credit` field, falling back to `By-line`, via `.Meta.IPTC` on the unprocessed resource (metadata is stripped from every derivative, so the read always targets the original). A source without those IPTC fields degrades silently to no credit line.

## Styling

The module ships no CSS at all -- these hooks are yours.

### Class inventory

| Class | Kind | On | Meaning |
| --- | --- | --- | --- |
| `image` | block | the OUTERMOST element | Stable root hook, always present |
| `image__img` | element | every `<img>` | Always present on the img (plus your `class` pass-through) |
| `image__picture` | element | every `<picture>` | Present whenever a picture wrapper exists |
| `image__link` | element | the lightbox `<a>` | Lightbox anchor |
| `image__caption-area` | element | `<figcaption>` | Caption container |
| `image__caption` | element | `<span>` in the figcaption | Author caption |
| `image__meta` | element | `<span>` in the figcaption | Groups the credit and license lines (present when either exists) |
| `image__credit` | element | `<span>` inside `image__meta` | Credit line |
| `image__meta-separator` | element | empty `<span>` inside `image__meta` | Separator hook between credit and license (present only when both exist; carries `aria-hidden="true"`; supply the glyph via a CSS `::before` pseudo-element -- `content` is inert on the element itself) |
| `image__license` | element | `<a>`/`<span>` inside `image__meta` | License name/link |
| `image--decorative` | modifier | root | `decorative=true` |
| `image--priority` | modifier | root | `priority=true` (style the hero distinctly) |
| `image--placeholder-dominant`, `image--placeholder-blur` | modifiers | root | Active placeholder mode |
| `image--theme-class` | modifier | root | Class theme strategy (dual trees) |
| `image--swap-block`, `image--swap-inline` | modifiers | the bare class-strategy swap `<span>` root | Block versus inline render context (the bare span is otherwise indistinguishable from its context in CSS) |
| `image__picture--light`, `image__picture--dark` | element modifiers | each tree under the class strategy | Theme tree identity |
| `image--lightbox` | modifier | root | Lightbox enabled |
| `image--static` | modifier | root | Passthrough render (unprocessed source) |
| `image-gallery` | block | `<ol>` | Gallery list |
| `image-gallery__item` | element | `<li>` | Gallery item (contains a full `image` block) |

All class names are STATIC strings in the templates, so Tailwind-style scanners and `hugo_stats.json` tree-shaking see every hook; when nothing wraps, the `<picture>` -- or, single-chain case, the `<img>` itself -- is the root and carries BOTH its element class and the block class (`class="image image__img ..."`).

### Root element by combination

Which element is root follows one fixed precedence -- figure, else lightbox anchor, else class-strategy swap span, else the picture/img tree itself -- so the FIRST matching row below is the root:

| Combination (first match wins) | Root element | Root-only classes beyond `image` |
| --- | --- | --- |
| Block context with any figcaption surface (`caption`, `credit`, or `license`) | `<figure>` | -- |
| Lightbox, no figure | `<a>` | `image__link` |
| Class theme strategy, no figure and no lightbox | `<span>` | `image--swap-block` or `image--swap-inline` |
| Bare render with at least one `<source>` | `<picture>` | `image__picture` |
| Bare render, single chain or passthrough | `<img>` | `image__img` |

On every one of these forms the root carries the block class `image`, the applicable modifiers from the inventory above, your `root_class` value (always the final entry in the class list, emitted after the root-only element class), the `id`, the `data-kind`/`data-layout` pair, and the placeholder style. Consequence: `.image` always selects the root, `.image__img` always selects the img, and your `root_class` classes always close the root's `class` attribute, on every variant.

### data-\* attributes

| Attribute | On | Value |
| --- | --- | --- |
| `data-kind` | root | `page`, `global`, `static`, `remote`, or `data` (resolution origin) |
| `data-layout` | root | `constrained`, `full`, or `fixed` |
| `data-placeholder` | root | `dominant` or `blur` (only when active) |
| `data-dominant-color` | root | `#rrggbb` (dominant mode) |
| `data-dominant-luminance` | root | `0.00`-`1.00` (dominant mode) |
| `data-full-src`, `data-full-width`, `data-full-height` | lightbox `<a>` | Capped full derivative URL plus intrinsic dimensions |
| `data-theme-swap` | swap wrapper | `class` (class strategy only) |
| `data-theme-variant` | `media` strategy: every `<source>` and the `<img>`; `class` strategy: the two tree roots only | `light` or `dark` |
| `data-count` | gallery `<ol>` | Item count |
| `data-index` | gallery `<li>` | 1-based position, zero-padded to the item count's digit width or to `index_pad`, whichever is wider (`01`..`10` in a ten-item gallery; `index_pad="2"` guarantees `01`..`03` in a three-item one), so lexicographic attribute selectors order correctly and `attr(data-index)`-driven chips keep one fixed width |

CSS custom properties (set via the root `style`; you define all presentation): `--image-dominant-color: #rrggbb` (dominant mode) and `--image-placeholder: url('data:image/webp;base64,...')` (blur mode). These are the ONLY style attributes the module can ever emit, and both carry measured image data, never design decisions. The same CSP note as the Placeholders section applies: inline style attributes need `style-src-attr` (or a covering `style-src`), and loading the blur URI from CSS needs `img-src data:`.

### Recipes

**Baseline CLS CSS (start here):**

```css
img {
  max-width: 100%;
  height: auto;
}
```

The emitted `width`/`height` attributes reserve the layout box only while CSS keeps the aspect ratio derivable -- `height: auto` with a constrained width does exactly that, while CSS `width: auto` silently breaks the reservation. Tailwind v4 Preflight already applies `img { display: block }`, which composes fine with this contract; pass your img-level utility classes through the `class` parameter (they land on `image__img`) and root-level ones through `root_class` (they land on the root element, whatever form it takes).

**Hero LCP image:** mark exactly one above-the-fold image per page `priority="true"` and pair it with the head-side preload emitter:

```go-html-template
{{/* in the head */}}
{{ partial "images/preload.html" (dict "page" . "src" "hero.jpg") }}
{{/* in the body */}}
{{ partial "images/image.html" (dict "page" . "src" "hero.jpg" "alt" "..." "priority" true "layout" "full") }}
```

The preload carries the first modern chain's `imagesrcset`/`imagesizes`/`type` (so non-supporting browsers skip it), emits a media-qualified light/dark PAIR when a `dark` source rides the media strategy, preloads only the light tree under the class strategy, and emits nothing (with one warning) for art-directed images -- hand-author media-qualified preloads for those. A passthrough source that still resolves to a URL (SVG, GIF, a `static/` path, an unfetched remote URL) preloads via a plain `href` with no `imagesrcset`/`imagesizes`/`type`, because there is no derivative ladder to describe; a source that cannot be resolved emits nothing after one warning, and a `data:` URI emits nothing silently (it is already inline). One preloaded hero per page.

**Hero background image (consumer-owned styling):**

```go-html-template
{{ $bg := partial "images/src.html" (dict "page" . "src" "hero.jpg" "width" 1600) }}
<div class="hero" style="background-image: url('{{ $bg.url }}')"></div>
```

`images/src.html` returns `{url, width, height, type}` for the top fallback derivative through the identical pipeline; you own everything visual.

**Dark-mode pair:** the `media` strategy needs zero CSS. For class togglers set `theme_strategy="class"` and ship the three-line CSS block from the Dark-mode variants section.

**Credit/license separator glyph:** `image__meta-separator` is an empty `aria-hidden` hook, and CSS `content` renders only on pseudo-elements (it is inert on the span itself), so supply the glyph via `::before`:

```css
.image__meta-separator::before {
  content: '·';
}
```

**Gallery grid:**

```css
.image-gallery {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: 1rem;
}
```

**PhotoSwipe wiring (v5):** the lightbox anchors already carry everything PhotoSwipe needs. Point the lightbox at the anchors with `children: 'a.image__link'`, then supply the dimensions through an `itemData` filter (each `PhotoSwipeLightbox` instance exposes `addFilter`), reading the anchor's `href` and `data-full-*`:

```js
const lightbox = new PhotoSwipeLightbox({
  gallery: '.image-gallery',
  children: 'a.image__link',
  pswpModule: () => import('photoswipe'),
});
lightbox.addFilter('itemData', (itemData, index) => {
  const el = itemData.element; // the a.image__link
  return {
    ...itemData,
    src: el.getAttribute('href'),
    width: Number(el.dataset.fullWidth),
    height: Number(el.dataset.fullHeight),
  };
});
lightbox.init();
```

**GLightbox wiring:** GLightbox reads each anchor's `href` as the source, so `new GLightbox({selector: '.image__link'})` works directly against the capped-derivative links. A CSS-only overlay works too: style `.image__link:target`-based or `:has()`-based overlays on top of the plain anchors -- the no-JS baseline (a plain link to the capped derivative) always keeps working.

**Placeholder styling:**

```css
.image--placeholder-blur .image__img,
.image__img.image--placeholder-blur {
  background-image: var(--image-placeholder);
  background-size: cover;
}
.image--placeholder-dominant .image__img,
.image__img.image--placeholder-dominant {
  background-color: var(--image-dominant-color);
}
```

The modifier classes and custom properties live on the ROOT and custom properties inherit, so this selector pair paints only the image box on every root form (the descendant selector covers wrapper roots, the compound selector covers the bare `<img>` root). Styling the root element directly would bleed the placeholder under the `<figcaption>` on captioned figures.

## Validation

This module cannot build standalone -- Hugo builds require a consuming site. The [`test/`](test/) directory ships a fixture consuming site plus a Node build-output assertion suite (`node --test` parsing the built HTML and published files) with `run-tests.sh` / `run-tests.cmd` runners that hard-fail on any deprecation or error output from `hugo build --logLevel info`. Repository CI additionally verifies that the leaf `go.mod` files parse and that `hugo mod graph` resolves. See [`test/README.md`](test/README.md).

## Module Structure

```text
modules/images/
├── go.mod                                  Go module definition (leaf module)
├── hugo.toml                               Hugo version floor
├── README.md                               This file
├── data/
│   └── images/
│       └── defaults.toml                   Shipped configuration defaults (tier 1 of the cascade)
├── layouts/
│   ├── _markup/
│   │   └── render-image.html               Markdown image render hook (site-wide; non-destructive)
│   ├── _partials/
│   │   └── images/
│   │       ├── image.html                  PUBLIC entry: validates, resolves, dispatches
│   │       ├── preload.html                PUBLIC head partial: LCP preload emitter
│   │       ├── gallery.html                PUBLIC gallery renderer (ordered figure list)
│   │       ├── src.html                    PUBLIC value-returning processed-URL feed
│   │       ├── config.html                 INTERNAL four-tier cascade resolver
│   │       ├── render.html                 INTERNAL central renderer (wrappers, policy, assembly)
│   │       ├── picture.html                INTERNAL single picture/img tree emitter
│   │       ├── resolve/
│   │       │   ├── source.html             PURE src classifier/resolver
│   │       │   ├── remote.html             Shared build-time remote fetch-and-process step
│   │       │   ├── dims.html               PURE width/height normalizer
│   │       │   ├── plan.html               PURE derivative planner (ladder, chains, sizes)
│   │       │   ├── sizes.html              PURE sizes attribute generator
│   │       │   ├── srcset.html             Chain executor (the ladder/lightbox processing site)
│   │       │   └── placeholder.html        Placeholder data generator (probe/blur processing site)
│   │       └── lib/
│   │           ├── int.html                Guarded decimal-integer parser (never octal, never overflow)
│   │           └── warn.html               Single deduplicated-warning helper
│   └── _shortcodes/
│       ├── image.html                      image shortcode (thin forwarding wrapper)
│       └── image-gallery.html              image-gallery shortcode (thin forwarding wrapper)
└── test/                                   Fixture site + Node build-output assertion suite
```
