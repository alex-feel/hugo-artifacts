# carousel

Accessible, style-agnostic image carousel for Hugo: a build-time, no-JS-baseline labeled region of visible, stacked, labeled slides that works fully without JavaScript, progressively enhanced by a small self-authored script that adds Previous/Next navigation, an optional slide picker, and scroll-position syncing. The module implements the [W3C APG Carousel pattern's](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) grouped (buttons-only, non-tabbed) variant exactly -- there is no autoplay anywhere in this module, not even as an opt-in, because auto-rotating content is a WCAG 2.2.2 obligation this repository chooses not to ship. It emits semantic HTML with [BEM](https://getbem.com/) class hooks and `data-*` attributes and ships **zero CSS** -- no stylesheets, no colors, no dark-mode rules -- so the consuming site owns every visual decision. It also composes with [`modules/images`](../images/README.md): when both modules are imported, every slide renders through the images pipeline (responsive `srcset`, WebP/AVIF, placeholders, dark variants, a lightbox anchor) with zero duplicated authoring.

## Installation

Add the module to your site's Hugo configuration:

```toml
[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/carousel"
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/carousel
```

Confirm resolution with `hugo mod graph`.

**Important -- template lookup precedence:** a file at the same path in your site (for example `layouts/_shortcodes/carousel.html` or `assets/js/carousel.js`) overrides the module's version. That is the supported way to replace markup or behavior -- and a reason to check those paths first if output looks unexpected.

For local development against a checkout of this repository, use a `hugo.work` workspace or `[module.replacements]` as described in the [repository README](../../README.md).

### Composing with modules/images

Import both modules to get the full responsive image pipeline on every slide:

```toml
[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/images"

[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/carousel"
```

With both imported, each slide's `<figure>` wraps the unmodified output of `images/image.html` -- srcset that never upscales, WebP/AVIF, placeholders, dark-mode variant pairs, and (with `lightbox="true"`) the full-resolution lightbox anchor with `data-full-src`/`data-full-width`/`data-full-height` -- instead of a single unprocessed `<img>`. Carousel forwards the images pass-through vocabulary (`widths`, `sizes`, `sizes_auto`, `formats`, `placeholder`, `quality`, `layout`, `responsive`, `anchor`, `resample`, `bg`, `hint`, `compression`, `max_density`, `dark`, `theme_strategy`) verbatim per slide, and never forwards `caption` or `credit` to `images/image.html` -- the images render tier emits its own inner `<figure>` only when caption/credit/license is present, so withholding both guarantees a bare `<picture>`/`<img>` that carousel wraps in its own `<figure>`/`<figcaption>`, avoiding a doubled wrapper. A curated-list entry that is not a bundle resource is forwarded to `images/image.html` as the value you AUTHORED, not as the URL carousel resolved from it, so `modules/images` resolves and normalizes it exactly once -- a leading-slash entry normalized by both modules would carry the baseURL path twice. Import order does not matter; Hugo's template lookup resolves both modules' layout namespaces regardless of `[[module.imports]]` order.

**Composition decision (recorded so a future maintainer does not "fix" this):** this composition is **runtime layout-namespace composition**, detected with `templates.Exists "_partials/images/image.html"` (checked once per render; the underscore-prefixed `_partials/` prefix is required because `templates.Exists` resolves paths relative to `layouts/`, and this repository uses the Hugo 0.146+ `layouts/_partials/` convention -- not the pre-0.146 `layouts/partials/` form some documentation examples still show). The module's `go.mod` carries **no `require` on `modules/images`**, and this is deliberate, not an oversight:

- **The rejected alternative was a `go.mod require` on `modules/images`, pinned to a real commit pseudo-version.** That would make images composition a hard Go-module dependency instead of an optional runtime one.
- **Why it was rejected, reason one -- an intra-repository `require` is a maintained pin, and this coupling does not earn one.** A `require` on `modules/images` would have to name a real commit pseudo-version of this repository, which means a follow-up commit re-pins carousel every time images changes, enforced by `npm run check:pins` (see [Consuming modules that wrap non-Go upstreams](../../CLAUDE.md#consuming-modules-that-wrap-non-go-upstreams) in root `CLAUDE.md`). The `modules/pwa` -> `modules/workbox` -> `modules/idb` chain accepts that upkeep because it has no alternative: those wrappers exist solely to pull non-Go-aware upstream JavaScript through Go's module graph, and the mounted assets are unusable if the graph does not resolve. Carousel has no such need -- `modules/images` is a pure Hugo-artifacts module composed today purely through `[[module.imports]]`, with `go.mod` existing only to satisfy Hugo Modules' Go-module backing requirement, not to express real Go-level coupling. Declaring one would buy a maintenance obligation and a version-skew failure mode for zero consumer benefit.
- **Why it was rejected, reason two -- a `require` drags the whole images pipeline, including its site-wide render hook, into every consumer's graph.** `modules/images` registers `layouts/_markup/render-image.html`, which activates SITE-WIDE for any importer and upgrades every plain Markdown `![alt](src)` on the site. A consumer who wants only the carousel -- and deliberately does NOT want every Markdown image on their site rewritten -- would have no way to opt out if `modules/carousel` forced `modules/images` in via `go.mod require`. Runtime composition keeps the images pipeline strictly opt-in: it activates only when the consumer's OWN `hugo.toml` imports `modules/images` themselves.
- **The result:** a consumer who wants only the carousel gets a plain, fully functional, unoptimized-image fallback (see [Progressive enhancement and JavaScript](#progressive-enhancement-and-javascript) and [Usage](#usage)) from a normal `hugo mod get` of one leaf module, with nothing else pulled into its graph. A consumer who wants the full pipeline imports both modules and gets it for free, with no code duplicated between them.

A site-local `layouts/_shortcodes/carousel.html` overrides the module's shortcode entirely, exactly like any other Hugo Modules template precedence case.

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+ (any edition)
- [Go](https://go.dev/) 1.22+

## Usage

Bundle-glob mode selects every matching page resource in filename order:

```go-html-template
{{</* carousel match="gallery/*" */>}}
```

Curated-list mode takes an explicit, ordered, comma-separated source list -- each entry may be a bundle resource, an `assets/` resource, an absolute or protocol-relative URL, or a leading-slash site path:

```go-html-template
{{</* carousel items="gallery/one.jpg, gallery/two.jpg, /img/three.jpg" label="Trip photos" */>}}
```

A leading slash means SITE-ROOT-RELATIVE, so such an entry is normalized onto the site rather than emitted verbatim: `/img/three.jpg` renders as `/docs/img/three.jpg` under `baseURL = "https://example.org/docs/"`, because a file in `static/` publishes under the baseURL path. (The module derives that path from `site.BaseURL` itself, because no Hugo URL function can supply it: `relURL`/`relLangURL`/`absURL` all discard the baseURL path for a value that already begins with `/`, and `relURL` on the slash-stripped remainder stops emitting the path entirely once `canonifyURLs` is on -- which the HTML output post-processor compensates for and other output formats, such as the Markdown twin, never do.) Absolute (`https://host/path`) and protocol-relative (`//host/path`) entries pass through untouched -- absolutizing either would corrupt it.

Exactly one of `match`/`items` is required; supplying both, or neither, fails the build with `errorf`. A few common variations:

```go-html-template
{{</* carousel match="gallery/*" mode="slide" loop="true" picker="true" lightbox="true" */>}}
{{</* carousel match="gallery/*" start="2" controls="false" */>}}
```

The shortcode is a thin wrapper over `carousel/slides.html`, the module's public renderer partial; a layout can call the partial directly:

```go-html-template
{{ partial "carousel/slides.html" (dict
  "page" .
  "match" "gallery/*"
  "mode" "slide"
) }}
```

On a page that also renders Hugo's built-in `markdown` output format (a Markdown twin, typically wired via [`modules/agent-readiness`](../agent-readiness/README.md) or a site's own twin template calling `.RenderShortcodes`), the SAME content call automatically selects `carousel.markdown.md` instead of the HTML template -- no per-call opt-in. See [Markdown output variant](#markdown-output-variant).

## Parameters

All parameters are named. Exactly one of `match`/`items` is required.

| Parameter | Type | Default | Purpose |
| --- | --- | --- | --- |
| `match` | string | `""` | A page-resource glob (e.g. `"gallery/*"`), matched in filename order via `.Resources.Match`. Mutually exclusive with `items`. |
| `items` | string | `""` | A comma-separated ORDERED source list; each entry resolves as a bundle resource, an `assets/` resource, an absolute or protocol-relative URL (passed through untouched), or a leading-slash site path (normalized onto the baseURL), first match wins. Mutually exclusive with `match`. |
| `id` | string | `carousel-<Ordinal>` | Root `<section>` id; also the id prefix for per-slide ids (`<id>-slide-01`). |
| `class` | string | `""` | Extra class(es) appended to the root `<section>`. |
| `label` | string | i18n `carousel_label` ("Image gallery") | Accessible name (`aria-label`) for the root region. Ignored when `labelledby` is also set. |
| `labelledby` | string | `""` | Id of an existing visible heading; wins over `label` per APG guidance. |
| `start` | int | `1` | 1-based initially current slide. Out-of-range values clamp to `1` with a one-shot warning. |
| `loop` | bool | `false` | Wrap navigation at the ends via index arithmetic (never DOM cloning). |
| `mode` | string | `"scroll"` | `"scroll"` or `"slide"`; see [JavaScript section](#progressive-enhancement-and-javascript). |
| `controls` | bool | `true` | Emit the Previous/Next button pair, `[hidden]` until JS init. |
| `picker` | bool | `false` | Emit the optional grouped-variant slide-picker button group, `[hidden]` until JS init. |
| `captions` | bool | `true` | Render `<figcaption>` from resource title/credit metadata. Alt emission is unconditional regardless of this toggle. |
| `eager` | int | `1` | Leading-slide count loaded with `loading="eager"` (the first also gets `fetchpriority="high"`); the rest get `loading="lazy" decoding="async"`. `0` makes every slide lazy. |
| `lightbox` | bool | `false` | Wrap each slide image in a full-resolution anchor (images pipeline when composed; a plain anchor standalone). Suppressed per-slide when alt is missing. |
| `index_pad` | int | `0` | Minimum zero-pad width for `data-index`; the effective width is `max(digits(count), index_pad)`. `0` derives the width purely from the slide count's own digits. |
| `enable` | bool | `true` | Kill switch; `false` renders nothing at all -- no markup, no script. |
| images pass-through set | mixed | unset | `widths`, `sizes`, `sizes_auto`, `formats`, `placeholder`, `quality`, `layout`, `responsive`, `anchor`, `resample`, `bg`, `hint`, `compression`, `max_density`, `dark`, `theme_strategy` -- forwarded verbatim per slide to `images/image.html` ONLY when `modules/images` is composed. Standalone, supplying any of these warns once (deduplicated) and the whole set is ignored. |

Every option above (except call-tier-only keys like `match`/`items`/`class`/`id`) resolves through a four-tier cascade, highest precedence first: call-site shortcode/partial arguments, page front matter (`carousel:` map), site configuration (`[params.carousel]`), and [`data/carousel/defaults.toml`](data/carousel/defaults.toml). Presence wins at every tier, so an explicit `false` or `0` overrides the tier below it.

Per-slide metadata (bundle resources only) mirrors the `modules/images` convention exactly, so one authoring surface feeds both a grid gallery and a carousel:

```yaml
resources:
  - src: gallery/one.jpg
    title: Caption for one
    params:
      alt: What the image shows
      credit: Photographer name
```

`alt` is the trimmed `params.alt` value (default `""`); `caption` is the resource's `.Title` only when it differs from `.Name` (so an untitled resource's file-name-derived default title never leaks into a caption); `credit` is the trimmed `params.credit` value. Curated-list entries outside the page bundle (an `assets/` resource, a site path, an absolute or protocol-relative URL) have no `[[resources]]` front-matter home, so they render with `alt=""` and a single one-time warning naming the entry exactly as you authored it -- author sets needing per-item alt text should live as bundle resources with `[[resources]]` metadata.

### Validation

- **Build-failing `errorf`, on both the shortcode and the `carousel/slides.html` partial surfaces, identically in the HTML and Markdown output variants:** `match` and `items` supplied together, or neither supplied. This is the module's only build-breaking case -- an authoring mistake worth stopping the build for.
- **Everything else degrades with ONE deduplicated `warnf` (a `hugo.Store`-backed sentinel keyed per issue) and a safe rendering; the build never breaks:** an empty `match` glob (renders nothing); an unresolvable `items` entry (skipped, the rest of the carousel still renders); an alt-less bundle resource (renders `alt=""`, suppresses its lightbox anchor); a curated-list entry outside the page bundle (same `alt=""` degradation); an out-of-range `start` (clamps to `1`); an unknown `mode` enum value (falls back to `"scroll"`); a non-numeric int parameter (falls back to the key's shipped default); a non-map `params.carousel` or `carousel:` front-matter value (ignored -- use the `enable` kill switch instead); images-pass-through parameters supplied without `modules/images` composed (ignored, one warning); an unknown named shortcode parameter (ignored, one warning); a missing `data/carousel/defaults.toml` or `assets/js/carousel.js` (a broken module mount -- markup still renders where possible).

## Accessibility

This module implements the [W3C APG Carousel pattern's](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) **grouped, buttons-only, non-tabbed** variant exactly -- never a hybrid, never the tabbed variant. The tabbed variant's roving-tabindex tablist semantics require JavaScript to be correct at all times and degrade worse over a server-rendered baseline; the grouped variant's roles stay truthful even before enhancement, which is why it is the only variant this module ships (see the [non-goal note](#non-goal-a-future-tabbedthumbnail-variant) below).

| APG requirement | Satisfied by markup (build time, no-JS baseline) | Satisfied by JavaScript (runtime only) |
| --- | --- | --- |
| Container is a labeled region | `<section role="region" aria-roledescription="{i18n carousel_roledescription}" aria-label="{label}">` or `aria-labelledby="{labelledby}"`; the default `label` deliberately never contains the word "carousel" (the `aria-roledescription` already announces it, and the APG requires the accessible name not repeat the roledescription). | -- |
| Each slide is a labeled group | `<li role="group" aria-roledescription="{i18n carousel_slide_roledescription}" aria-label="{i of N}">`, produced SERVER-SIDE via `T "carousel_slide_label" (dict "Index" .. "Count" ..)`. The slide set is static, so this label is never rewritten by JS. | -- |
| Rotation control, when present, is reachable first in Tab order | -- (no rotation control exists; this module ships no autoplay -- see below) | n/a |
| Previous/Next controls | `<div class="carousel__controls" hidden>` with two `<button type="button">` elements, present in the DOM from the start so the no-JS baseline never depends on JS to exist. | Removes `[hidden]`; wires click handlers; toggles `aria-disabled="true"` (never the `disabled` attribute, which would drop focusability) at the boundaries when `loop=false`; a repeat press of an activated button NEVER moves focus off that button. |
| Optional slide picker | `<div class="carousel__picker" role="group" aria-label="{i18n carousel_picker_label}" hidden>` of `<button data-carousel-goto>` elements, present but hidden. | Removes `[hidden]`; wires click-to-goto handlers; toggles `carousel__picker-button--current`, `aria-disabled="true"`, and `aria-current="true"` on the active button, clearing all three from the rest; a click on the already-active button is a no-op (no re-dispatched `carousel:change`, no re-triggered scroll). |
| Live region announces slide changes | -- (nothing changes without JS) | `aria-live="polite" aria-atomic="false"` on the track, set once at init and left ALWAYS polite -- because rotation never exists in this module, the APG's "off during auto-rotation" carve-out never applies; polite is always the correct value. |
| Keyboard model | Tab order is prev, next, picker buttons, then interactive content inside the current slide -- collapsed from the APG's full "rotation-control, then prev, then next" order because no rotation control exists. Enter/Space activate buttons natively (no custom key handling). | Never moves keyboard focus anywhere. There is no arrow-key roving tabindex -- that is the tabbed variant's mechanism, deliberately not shipped here. |
| Off-screen slide concealment (mode=slide only) | -- | `inert` plus `aria-hidden="true"` applied to non-current slides ONLY after a concealment guard (`getClientRects().length === 0`) confirms the consumer's own CSS actually hides them -- an unstyled page keeps every slide visible and accessible instead of inerting visible content. `mode=scroll` never inerts anything (the multi-visible-shelf case). |
| No DOM cloning for loop | `loop=true` wraps the index via `((target - 1 + count) % count) + 1` arithmetic; no slide node is ever duplicated, inserted, or removed after initial render. | Same guarantee at runtime -- the DOM node count never changes. |

### No autoplay (Verified as of 2026-08-02)

This module ships **no autoplay anywhere, not even as an opt-in parameter.** There is no rotation timer, no interval-driven advance, no play/pause control, and no rotation-related parameter in the surface above. This satisfies **WCAG 2.2.2 Pause, Stop, Hide (Level A)** structurally rather than through a pause mechanism: content that never auto-starts moving cannot violate a requirement to let a user pause auto-started motion. The alternative -- shipping an opt-in autoplay with a pause button -- would require an entire subsystem (a persistent rotation-control button, pause-on-focus/hover, never-auto-resume semantics) whose sole purpose is mitigating a behavior the evidence below condemns, and whose rotation cadence is inherently a design decision this zero-CSS, zero-opinion repository does not make on a consumer's behalf.

Evidence: Nielsen Norman Group's and Baymard Institute's carousel research finds that auto-rotating carousels suppress engagement with every slide but the first -- click-through on slide one runs several times higher than on the last slide of an auto-rotating sequence, and most visitors never interact with a carousel at all before it has already rotated past the content they wanted. The [W3C APG's own carousel guidance](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) steers away from automatic rotation unless the content genuinely benefits from motion, and even then mandates the pause/stop/hide mechanism this module avoids needing entirely by never rotating at all. NN/G and Baymard both point toward grid-first presentation for scannable content (see [modules/images' `image-gallery` shortcode](../images/README.md#gallery)) and reserve a sequential carousel for genuinely ordered narratives (a step-by-step walkthrough, a narrow before/after strip) -- not as a space-saving trick for content that would work fine as a grid.

A consumer with a genuine, evidence-backed need for rotation can drive it entirely with the module's own public surface -- the `carousel:change` event and the `data-carousel-goto`/`data-carousel-prev`/`data-carousel-next` hooks -- from their own site-side script that activates the existing buttons on a timer. Doing so is a deliberate, visible opt-in the consumer authors themselves, and that consumer then OWNS the resulting WCAG 2.2.2 obligations (a visible pause control, pause-on-focus/hover, no auto-resume) in full -- this module's conformance claims do not extend to a site-side rotation script layered on top of it.

**Caveat:** this rationale reflects the carousel accessibility literature as commonly cited as of the verification date above; if your own content genuinely requires rotation (rare -- most "need" is habit, not requirement) and you choose to add it site-side per the paragraph above, the WCAG and APG obligations become yours to satisfy and to keep current as guidance evolves.

### Other WCAG success criteria

- **2.3.3 Animation from Interactions (best-effort, AAA):** the JavaScript checks `prefers-reduced-motion: reduce` via `matchMedia` and navigates with `behavior: 'auto'` (instant) instead of `'smooth'` when the visitor has that preference set. See the [C39 discipline](#progressive-enhancement-and-javascript) below for the matching consumer-CSS obligation.
- **2.5.1 Pointer Gestures:** the Previous/Next buttons are the mandatory single-pointer alternative to swipe/drag; native browser scrolling (`mode="scroll"`) provides touch scrolling additively, never as the only path.
- **2.5.8 Target Size (Minimum):** hit area is entirely consumer CSS, since the module ships none. See the [24x24 CSS-pixel minimum](#progressive-enhancement-and-javascript) requirement below.
- **2.4.4 / 4.1.2 (Link Purpose / Name, Role, Value):** an alt-less slide's lightbox anchor is suppressed rather than rendered with an empty accessible name, both standalone and composed with `modules/images`.

### Non-goal: a future tabbed/thumbnail variant

This module deliberately ships ONLY the APG grouped (buttons-only) variant. A tabbed carousel with a thumbnail tablist (roving-tabindex arrow-key navigation between thumbnail "tabs" that each reveal one slide) is a structurally different pattern -- a different keyboard model, different ARIA roles (`tablist`/`tab`/`tabpanel`), and a different visual affordance -- and is explicitly **out of scope for this module's parameter surface**, not merely deferred. `picker="true"` renders a `role="group"` of plain buttons (the APG's own "additional buttons" allowance inside the grouped pattern), which is NOT the tabbed variant and must not be confused with it. Should a tabbed/thumbnail variant become genuinely needed, it belongs in a separate shortcode or a separate module rather than as a `mode` value here, because mixing the two keyboard models behind one parameter would produce exactly the accessibility hybrid this module's design explicitly refuses to ship.

## Progressive enhancement and JavaScript

The build-time markup is the complete, functional, no-JS baseline: a labeled region of visible, stacked, labeled slides. `assets/js/carousel.js` is a single dependency-free IIFE that only reveals the JS-only controls/picker and wires navigation over that baseline -- it never changes what content exists, only how it is navigated. It is emitted once per render PLACEMENT (never deduplicated behind a `Page.Store` sentinel), because a `Page.Store` sentinel is shared by every paginator output of one `Page` object and would reach only the first-rendered output (`/blog/` but never `/blog/page/2/`); emitting per placement is safe because browsers fetch a duplicate same-`src` deferred script once, and a re-execution is a no-op behind the script's own `window.__carouselInit` run guard plus its per-root `[data-carousel]:not([data-enhanced])` wiring guard.

### Events

Bubbling `CustomEvent`s dispatched on the carousel's root `<section>`:

| Event | When | `detail` |
| --- | --- | --- |
| `carousel:init` | Once, after a root finishes wiring | `{index, count}` |
| `carousel:change` | The current slide index actually changes, from any trigger | `{index, count, trigger}` -- `trigger` is `"prev"`, `"next"`, `"goto"`, or `"scroll"` |

### Guards

- **Window-level run guard** (`window.__carouselInit`): a second script execution on the page is a no-op.
- **Per-root wiring guard** (`[data-carousel]:not([data-enhanced])`): `init()` only wires roots not already marked `data-enhanced="true"`, so re-running `init()` never double-wires a root.
- **Concealment guard** (`mode="slide"` only): `inert` and `aria-hidden="true"` are applied to a non-current slide only after `slide.getClientRects().length === 0` confirms the consumer's CSS has actually collapsed its box. See the CSS contract below -- this is the guard the contract exists to satisfy.
- **No-op resolved-target guard** (`goTo`, every trigger): after loop-wrap resolution (or the non-loop out-of-range return), a resolved target equal to the current index returns without dispatching `carousel:change` or calling `scrollIntoView` -- this is what keeps a click on the already-active picker button, and a `prev`/`next` wrap-to-self on a single-slide `loop="true"` carousel, silent. Mirrors the scroll-sync path's own `index !== current` guard below.
- **`scrollend`/IntersectionObserver duality** (`mode="scroll"` only): the script feature-detects `'onscrollend' in window` and prefers the native `scrollend` event (fires once per gesture); browsers that predate it fall back to a debounced `IntersectionObserver` rooted at the track (threshold ~0.6, 120ms debounce), because that fallback path can otherwise fire multiple times during one flick.

### What the script refuses to do

By design, `assets/js/carousel.js` never: autoplays or runs any timer (no rotation code exists at all, anywhere in the file); implements swipe/drag pointer-tracking math (native scrolling covers touch additively in `mode="scroll"`; the Previous/Next buttons are the WCAG 2.5.1 single-pointer path in every mode); clones DOM nodes for `loop` wraparound (index arithmetic only -- the APG-named anti-pattern); injects styles, stylesheets, or inline CSS; writes browser-history entries (no `:target` usage anywhere in the module); makes network requests; observes DOM mutations; or manages keyboard focus in any way beyond native button activation.

### The consumer CSS contract

The module ships zero CSS, so the JavaScript's runtime behavior depends on the consumer supplying specific CSS properties. This is not optional decoration -- these declarations are load-bearing for the behaviors described above.

**Scroll-snap recipe (`mode="scroll"`, the default):** copy-paste this onto `.carousel__track` to get a working swipeable, snapping slider:

```css
.carousel__track {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  list-style: none;
  margin: 0;
  padding: 0;
}

.carousel__slide {
  scroll-snap-align: center;
  scroll-snap-stop: always;
  flex: 0 0 100%;
}
```

- `overflow-x: auto` makes the track a native horizontal scroll container -- required for the JS's `scrollIntoView`-based navigation and for native touch scrolling to exist at all.
- `scroll-snap-type: x mandatory` is what makes a swipe or button press land cleanly on a slide boundary instead of stopping mid-slide.
- `scroll-snap-align: center` on each slide is what `scrollIntoView({inline: 'center', ...})` actually snaps against.
- `scroll-snap-stop: always` forces the browser to stop at EVERY slide during a fast flick rather than skipping past several -- WebKit-family browsers in particular can otherwise let a fast swipe glide past multiple snap points (see [Design notes](#design-notes-dated-findings) below); this declaration is the fix.
- `overscroll-behavior-x: contain` stops a flick at the track's own start/end from scrolling the containing page horizontally (a common regression on mobile Safari without it).

**`mode="slide"` concealment requirement:** when using `mode="slide"`, non-current slides MUST be hidden with `display: none` or `visibility: hidden` -- **`opacity: 0` alone does NOT satisfy this requirement.** The JS concealment guard checks `getClientRects().length === 0` to decide whether it is safe to apply `inert`/`aria-hidden` to a slide; an element hidden only via `opacity: 0` still reports non-empty client rects (it is still laid out and hit-testable), so the guard correctly refuses to `inert` it -- and the result is a slide that is invisible but NOT `inert`, meaning its focusable content remains reachable via Tab while looking absent. Use `display: none` (removes the box and its rects entirely) or `visibility: hidden` (collapses rects to empty while preserving layout space) for non-current slides in `mode="slide"`.

**Minimum hit area:** give `.carousel__control` and `.carousel__picker-button` at least **24x24 CSS pixels** of hit area (WCAG 2.2 Success Criterion 2.5.8, Level AA) -- padding, not necessarily visible glyph size. This is entirely a consumer obligation; the module ships no padding or sizing.

**C39 reduced-motion discipline:** define slide-transition CSS transitions or animations ONLY inside a `prefers-reduced-motion: no-preference` media query (WCAG technique [C39](https://www.w3.org/WAI/WCAG21/Techniques/css/C39)), never unconditionally:

```css
@media (prefers-reduced-motion: no-preference) {
  .carousel__track {
    scroll-behavior: smooth;
  }
}
```

The JavaScript already switches its own `scrollIntoView` calls to `behavior: 'auto'` (instant) under `prefers-reduced-motion: reduce`, so this CSS-side discipline exists specifically for consumer-authored transitions (a fade, a transform) layered on top -- an unconditional `transition: transform 300ms` would still animate for a visitor who has explicitly asked their OS not to.

## Design notes (dated findings)

Each finding below is stated as fact as of its verification date, with its caveat and the override path available if the underlying evidence shifts.

**Grid-first guidance and no-autoplay-by-default. Verified as of 2026-08-02.** Nielsen Norman Group's and Baymard Institute's published carousel usability research consistently favors a scannable grid over a sequential carousel for content that has no inherent order, and treats auto-rotation as actively harmful to engagement with anything past the first slide -- see [No autoplay](#no-autoplay-verified-as-of-2026-08-02) above for the full rationale. **Caveat:** this reflects the state of that research corpus as commonly cited at the verification date; NN/G and Baymard periodically republish and refine their carousel guidance. **Override path:** for grid-appropriate content, use [`modules/images`' `image-gallery` shortcode](../images/README.md#gallery) instead of this module; a consumer who has verified a genuine, current need for rotation can drive it site-side per the autoplay section above.

**CSS Overflow Level 5 scroll-marker/scroll-button() primitives remain Chromium-only. Verified as of 2026-08-02.** The [CSS Overflow Module Level 5](https://drafts.csswg.org/css-overflow-5/) draft defines `::scroll-marker`, `::scroll-marker-group`, and `scroll-button()` -- CSS-only primitives that could, in principle, replace a JS-driven carousel's controls entirely. As of this writing, these ship in Chromium-family browsers (Chrome/Edge) and are absent from Firefox and Safari, which is why this module ships a JavaScript-enhanced APG pattern rather than relying on the CSS-only primitive as its baseline: a CSS-only implementation would leave Previous/Next controls completely absent in roughly a third of the browser market. **Caveat:** browser support for CSS-only carousel primitives is an actively moving target; check [caniuse.com](https://caniuse.com/) or the MDN browser-compatibility tables before relying on this claim. **Override path:** a consumer targeting Chromium-only deployments (an internal tool, an Electron app) can layer a progressive `@supports` enhancement on top of this module's existing markup without waiting for a module update:

```css
@supports (scroll-marker-group: after) {
  .carousel__controls,
  .carousel__picker {
    display: none;
  }
  .carousel__track {
    scroll-marker-group: after;
  }
  .carousel__slide::scroll-marker {
    content: '';
  }
}
```

This recipe hides the module's own JS-driven controls only where the browser can render the CSS-native equivalent, and falls through to the JS baseline everywhere else -- it is a consumer-owned enhancement, not something this module ships, because doing so unconditionally would be a design decision this zero-CSS module does not make.

**`scrollend` reached Baseline "Newly available" in December 2025. Verified as of 2026-08-02.** The `scrollend` DOM event -- which fires once when a scroll gesture settles, as opposed to firing repeatedly during the scroll -- reached [Baseline "Newly available"](https://web.dev/baseline) status across Chrome, Edge, Firefox, and Safari in December 2025. `assets/js/carousel.js` uses it directly as the preferred mechanism for syncing the current-slide state in `mode="scroll"`, with a debounced `IntersectionObserver` fallback (`'onscrollend' in window` feature-detected) for engines that predate that baseline. **Caveat:** "Newly available" means broad support exists as of the verification date, not that every visitor's browser is current; the fallback path remains in the shipped script specifically to cover that gap and is not scheduled for removal. **Override path:** none needed -- both paths ship together and the script self-selects.

**`:target`-based history pollution is why fragment navigation is excluded. Verified as of 2026-08-02.** A CSS-only carousel technique using `:target` (each slide gets an `id`, "controls" are anchor links to `#slide-id`) is a well-documented anti-pattern: every navigation writes a new browser-history entry, so the visitor's Back button steps through carousel slides one at a time instead of leaving the page, and a shared/bookmarked URL can land mid-carousel unexpectedly. This module's markup includes per-slide `id` attributes for other purposes (script targeting, `aria-labelledby` wiring, deep integration), but the controls are `<button type="button">` elements, never `<a href="#...">` anchors, and the script never calls `location.hash =` or otherwise touches browser history. **Override path:** none offered -- this is a hard design boundary, not a configurable behavior, because the anti-pattern's cost (broken Back-button semantics) has no accessibility upside the buttons-only APG pattern does not already provide.

**WebKit scroll-snap flick quirks and `scroll-snap-stop`. Verified as of 2026-08-02.** WebKit-family browsers (Safari, and other engines built on WebKit) have a documented history of letting a fast, high-velocity swipe glide past multiple `scroll-snap-align` points in a single gesture rather than stopping at the very next one, particularly noticeable with wide slides at `scroll-snap-type: x mandatory`. `scroll-snap-stop: always` (included in the [consumer CSS recipe](#the-consumer-css-contract) above) is the standardized fix -- it forces a full stop at every snap position regardless of gesture velocity, at the cost of feeling slightly less "flingy" than an unconstrained snap. **Caveat:** engine behavior around scroll-snap has continued to evolve across WebKit releases; verify on a current Safari build if precise flick behavior matters to your design. **Override path:** omit `scroll-snap-stop: always` if a consumer deliberately wants the browser's default multi-slide-glide behavior on a fast flick -- this is a legitimate, if unusual, design choice the module does not prevent.

Load-bearing findings from this section are repeated tersely in the `carousel/slides.html` docstring's "Dated findings" block, per this repository's established convention of keeping template-adjacent rationale close to the code it justifies.

## Markdown output variant

`layouts/_shortcodes/carousel.markdown.md` is auto-selected by Hugo's output-format-aware shortcode template lookup whenever a page renders its `markdown` output format -- the exact same content call (`{{< carousel match="..." >}}` or `{{< carousel items="..." >}}`) resolves to this template instead of `carousel.html`, with zero per-call opt-in beyond wiring the `markdown` output format for the page kind (see `modules/images`' own `image.markdown.md`/`image-gallery.markdown.md` for the identical mechanism this twin mirrors).

Emission is compact, pure Markdown -- no HTML tags, no `class=`, no `data-*`, no inline SVG -- one block per resolved slide, in the SAME order the HTML path uses:

```text
![Login screen before redesign](https://example.org/work/app/01-login.png)
Step 1: the original login flow

![Dashboard after login](https://example.org/work/app/02-dashboard.png)
Step 2: the redesigned dashboard
```

Each block is the image line, `![alt](URL)`, plus the caption as a plain-text line directly below it when a caption is present and `captions` (the one HTML parameter that DOES still apply here) is not `false`; blocks are separated by exactly one blank line. `credit` is an HTML rendering feature (rendered inside `<figcaption>` as a `<span class="carousel__credit">`) with no Markdown representation, mirroring `modules/images`' own documented scope for its twin variants. The URL is always absolute and never a processed derivative: the ORIGINAL resource's `.Permalink` for bundle and `assets/` resources, and `absURL` of the resolved URL for a curated-list passthrough entry -- which means a leading-slash entry keeps the baseURL path it was normalized onto, and an absolute or protocol-relative entry is emitted untouched. It is angle-bracket-wrapped when it contains whitespace or parentheses, exactly like `image-gallery.markdown.md`'s existing escaping rule.

**Parameter parity:** the twin accepts the IDENTICAL parameter vocabulary as `carousel.html`, including the `match`/`items` XOR requirement (`errorf` with the same message shape on misuse) and the images pass-through set -- so a shared content call never warns on this variant about a parameter the HTML variant consumes. Presentation-only parameters (`id`, `class`, `label`, `labelledby`, `start`, `loop`, `mode`, `controls`, `picker`, `eager`, `lightbox`, `index_pad`, and the images pass-through set) are accepted for call-surface parity but have nothing to influence in a plain image-plus-caption list, since presentation and interaction state are meaningless outside a rendered, interactive DOM.

**Shared warn keys:** every degradation path in the twin reuses the EXACT SAME `hugo.Store` dedup key the HTML path uses for the identical condition -- an empty `match`, an unresolvable `items` entry, an alt-less bundle resource (`printf "carousel-alt-%s-%s" $page.Path <resource .Name>`), a passthrough entry with no `[[resources]]` home, and an unknown named parameter. This means the same underlying issue on the same page NEVER double-warns across output formats -- a page rendering both `html` and `markdown` outputs for the same content call gets exactly one warning per issue, not two. An alt-less slide renders the empty label `![](URL)`, the Markdown analog of the HTML path's `alt=""` degradation.

## Migration from a bundled gallery-slider module

If you are moving off a generic, CSS/JS-bundled "gallery slider" Hugo module (a foreign theme component that ships its own stylesheet and slideshow script) onto this module, the steps below cover the mechanical swap. This repository has no backward-compatibility obligation (see the root [`README.md`](../../README.md)) -- there is no shim or compatibility shortcode; consumers adapt their call sites.

1. **Swap the import.** Replace the foreign module's `[[module.imports]]` entry with this one (and add `modules/images` too if you want the responsive pipeline -- see [Composing with modules/images](#composing-with-modulesimages)), then run `hugo mod get` and `hugo mod tidy`. This module declares no intra-repository requires at all, so a plain `hugo mod get` resolves it directly -- no `hugo.work` trick and no sibling pins to track.

2. **Author slide metadata via `[[resources]]`.** Move (or keep) your slide images in the calling page's bundle and author `alt`/`caption`/`credit` once in front matter:

   ```yaml
   resources:
     - src: gallery/01-login.png
       title: Login screen before redesign
       params:
         alt: The original login flow
   ```

   Numeric filename prefixes (`01-`, `02-`, ...) or an explicit `items="01-login.png,02-dashboard.png"` list preserve slide order exactly -- whichever ordering mechanism your old module used, one of `match`'s filename ordering or `items`'s literal ordering reproduces it.

3. **Replace the shortcode call.** `{{< carousel match="gallery/*" >}}` or `{{< carousel items="..." >}}` replaces the foreign shortcode. Common option mappings: `loop`/`infinite` maps to `loop="true"` (index-wrap arithmetic here, never DOM cloning, so behavior may feel subtly different at the boundary -- see the [JavaScript section](#progressive-enhancement-and-javascript)); `thumbnails`/`dots`/`bullets` maps to `picker="true"`.

   > **No autoplay-equivalent exists, and this is the single highest-impact migration surprise.** If your old module's `autoplay`/`interval`/`autostart` options were on, there is no parameter in this module that reproduces that behavior -- not `loop`, not any other flag. Silently carrying over an old "autoplay: true" config gets you a carousel that never rotates, which is a deliberate, permanent design decision (see [No autoplay](#no-autoplay-verified-as-of-2026-08-02) above), not a bug to file. If you have a genuine, evidence-backed need for rotation, drive it yourself with this module's public `carousel:change` event and `data-carousel-*` button hooks from your own site-side script -- and then you own the resulting WCAG 2.2.2 obligations in full, exactly as the Accessibility section describes.

4. **Author your own site CSS.** The foreign module very likely shipped bundled CSS and a slideshow script; this module ships neither. The [consumer CSS contract](#the-consumer-css-contract) above restores a working, swipeable, snapping slider in roughly ten declarations -- copy the scroll-snap recipe as a starting point, then apply your own visual design on top. You now own 100 percent of the visual presentation, which is this repository's universal policy (see the root `README.md`'s "Shortcode module conventions").

5. **Delete the foreign module's CSS/JS includes and any CDN references.** This is also a privacy win: this module makes zero third-party contact at build time or render time -- no CDN fetch, no analytics beacon, no external font.

6. **Free upgrades after migration** -- things you get with no additional authoring effort: APG-conformant grouped-carousel semantics and keyboard model; i18n English/Russian labels out of the box (extend with your own `i18n/<lang>.toml` for additional languages); the `.markdown.md` Markdown twin for agent-readiness / LLM-facing pipelines; a subresource-integrity-pinned, fingerprinted script tag; and, when composed with `modules/images`, `srcset`/WebP/AVIF/placeholders/dark-variant/lightbox support on every slide with zero call-site changes beyond adding the second `[[module.imports]]` block.

## Styling

The module ships no CSS at all -- these hooks are yours.

### Class inventory

| Class | Kind | On | Meaning |
| --- | --- | --- | --- |
| `carousel` | block | root `<section>` | Stable root hook, always present |
| `carousel--lightbox` | modifier | root | `lightbox="true"` |
| `carousel--enhanced` | modifier | root | JS has run and wired this root |
| `carousel__controls` | element | `<div>` wrapping Previous/Next | Present only when `controls="true"`; `[hidden]` until JS reveals it |
| `carousel__control` | element | each nav `<button>` | Base class on both Previous and Next |
| `carousel__control--prev` / `carousel__control--next` | element modifier | nav `<button>` | Direction identity |
| `carousel__picker` | element | `<div role="group">` | Present only when `picker="true"`; `[hidden]` until JS reveals it |
| `carousel__picker-button` | element | each picker `<button>` | One per slide |
| `carousel__picker-button--current` | element modifier | active picker button | JS-toggled, alongside `aria-disabled="true"` and `aria-current="true"` on the same button |
| `carousel__track` | element | `<ul>` | The slide list; the scroll container in `mode="scroll"` |
| `carousel__slide` | element | each `<li>` | One per slide |
| `carousel__slide--current` | element modifier | active slide | JS-toggled |
| `carousel__figure` | element | `<figure>` inside each slide | Wraps the composed-or-standalone image |
| `carousel__img` | element | standalone `<img>` (no `modules/images`) | Absent when composed -- `modules/images` supplies its own `image__img` class instead |
| `carousel__link` | element | standalone lightbox `<a>` (no `modules/images`) | Absent when composed -- `modules/images` supplies its own `image__link` instead |
| `carousel__caption` | element | `<figcaption>` | Present when `captions="true"` and a caption resolves |
| `carousel__credit` | element | `<span>` inside `carousel__caption` | Present when a credit resolves alongside a caption |

Composed slides (with `modules/images` imported) render the images module's own class inventory (`image`, `image__img`, `image__picture`, `image--lightbox`, and so on -- see [`modules/images`' Styling section](../images/README.md#styling)) INSIDE `carousel__figure`, since carousel deliberately never wraps a second `<figure>` around an already-figured images render. Style the composed image tree through the images module's own hooks; style the carousel chrome (track, controls, picker, slide) through the classes above.

### data-\* attributes

| Attribute | On | Value |
| --- | --- | --- |
| `data-carousel` | root | Presence marks the root for JS discovery |
| `data-enhanced` | root | `"true"` once JS has wired this root |
| `data-count` | root | Total slide count |
| `data-start` | root | Resolved (clamped) 1-based initial slide index |
| `data-mode` | root | `"scroll"` or `"slide"` |
| `data-loop` | root | Present (boolean attribute, no value) only when `loop="true"`; its ABSENCE, not `data-loop="false"`, is how the script reads "off" |
| `data-carousel-track` | `<ul>` | Presence marks the track for JS discovery |
| `data-carousel-prev` / `data-carousel-next` | nav `<button>` | Presence marks each control for JS wiring |
| `data-carousel-goto` | picker `<button>` | 1-based target slide index |
| `data-index` | each `<li>` | 1-based position, zero-padded to `max(digits(count), index_pad)` -- the same rule `modules/images`' `image-gallery` shortcode uses, so the two modules' item indexes stay drop-in consistent |
| `data-current` | active `<li>` | `"true"`, JS-toggled |

**Composed slides inherit the images module's own custom properties** -- `--image-dominant-color` (dominant-color placeholder mode) and `--image-placeholder` (blur placeholder mode) -- set on the images render's own root element inside `carousel__figure` when `modules/images` is composed and a `placeholder` mode is active. See [`modules/images`' Placeholders section](../images/README.md#placeholders) for the full contract; carousel itself sets no custom properties of its own.

### Icons

Both navigation icons (`chevron-left`, `chevron-right`) are inline SVGs with `width="1em" height="1em"`, `stroke="currentColor"`, `fill="none"`, `aria-hidden="true"`, and `focusable="false"` -- they inherit your text color and font size and restyle entirely from your CSS, in the same Lucide/Tabler-style stroke idiom as this repository's other modules (`copy-page`, `github-repo`, `hf-space`, `callout`). Replace either or both glyphs by shipping your own `layouts/_partials/carousel/icon.html` -- it receives `(dict "name" <name> "class" <classes>)`, and an unrecognized name renders nothing (correct behavior for a partial site-level override).

## Validation

This module cannot build standalone -- Hugo builds require a consuming site. [`test/`](test/) ships a Playwright suite following this repository's established runner contract (a pre-launch Hugo-process check, a background `hugo server --logLevel info`, a grep-fail on any logged deprecation, and belt-and-suspenders process cleanup on exit) against fixture sites covering the no-JS markup baseline, composition with `modules/images` (proving byte-identical reuse of its render output), JavaScript-enabled navigation and event dispatch, `mode="slide"` concealment guarding both a styled and an unstyled page, accessibility and warning behavior, the Markdown twin's parity and shared-warn-key contract, per-placement script emission across a paginated output, and a standalone (no `modules/images`) fixture asserting the plain `<img>` fallback markup. Run it with Node.js 22+ from `test/`:

Among the runner's static builds is a **subpath pass** (`test/subpath.toml`, `baseURL = "https://example.org/docs/"`), built against BOTH fixtures and asserted by `tests/10-subpath.spec.js`. It exists because Hugo discards the baseURL path for a value that already begins with `/`, so at the domain-root baseURL every other build uses, a correct leading-slash resolution and a broken one emit identical bytes. It proves that `items="/site-slide-01.png"` renders `src="/docs/site-slide-01.png"` in the composed build (where the raw entry is forwarded to `modules/images`, so the path must be applied exactly once), in the standalone build (where `carousel/slides.html` emits the URL itself), and as `https://example.org/docs/site-slide-01.png` in both Markdown twins.

A **canonifyURLs pass** (`test/canonify.toml`, the same subpath baseURL plus `canonifyURLs = true`) follows it against both fixtures, asserted by the same spec. `canonifyURLs` makes Hugo rewrite every root-relative URL in HTML output into an absolute one after the templates have run, and to keep that rewrite from doubling the baseURL path, `relURL` stops emitting the path while it is on. The rewrite touches HTML output formats only, so this pass is what proves the Markdown twin still carries the baseURL path -- and that deriving the path in the template never doubles it in HTML.

```bash
cd modules/carousel/test
npm install
npx playwright install chromium
./run-tests.sh        # run-tests.cmd on Windows; PORT overrides the default 1717
```

CI additionally verifies that `go.mod` parses and `hugo mod graph` resolves.

## URLs this module publishes

Reading a slide resource's URL is what WRITES that file, and it is a Resource rather than a Page, so no walk of `.Site.Pages` reaches one. Where a site also imports [`url-retirement`](../url-retirement/README.md), the standalone render registers each bundle slide it publishes, and those URLs appear in that module's `/url-manifest.txt` with nothing configured for it.

Only the standalone render. Where [`images`](../images/README.md) is also imported, this module hands the slide to that one and reads no permalink of its own, so the registration follows whichever module actually published the file rather than being claimed twice. A site that does not import `url-retirement` is unaffected: the call sits behind `templates.Exists` and costs it nothing.

## Module Structure

```text
modules/carousel/
├── README.md                              This file
├── go.mod                                 Module path (leaf module, independently importable, no require on modules/images)
├── hugo.toml                              Minimum Hugo version pin
├── data/
│   └── carousel/
│       └── defaults.toml                  Consumer-facing defaults (lowest cascade tier)
├── i18n/
│   ├── en.toml                            English UI strings
│   └── ru.toml                            Russian UI strings
├── assets/
│   └── js/
│       └── carousel.js                    Progressive enhancement (reveal, navigation, scroll sync, events)
├── layouts/
│   ├── _shortcodes/
│   │   ├── carousel.html                  In-content entry; validates vocabulary, dispatches to the partial
│   │   └── carousel.markdown.md           Markdown output-format twin (auto-selected, zero HTML)
│   └── _partials/
│       └── carousel/
│           ├── slides.html                PUBLIC ENTRY: resolution, markup, composition probe, script emission
│           ├── config.html                INTERNAL four-tier cascade resolver
│           ├── icon.html                  Inline SVG chevrons
│           └── lib/
│               ├── int.html               Guarded decimal-integer parser (never octal, never overflow)
│               ├── md-text.html           PURE Markdown line-safety builder (the twin's label/caption escaping)
│               ├── site-url.html          PURE site-root-relative path normalizer (prepends the baseURL path)
│               └── warn.html              Single deduplicated-warning helper
└── test/                                  Fixture sites + Playwright validation suite
```
