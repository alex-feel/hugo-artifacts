# og-image

Universal build-time Open Graph card generator for Hugo. Hand it a page and it returns ONE composed image resource -- a background raster normalized to the card canvas, any number of overlays, and any number of text slots wrapped and fitted to their boxes -- or nothing at all when the site has no card template for that page. It plugs into [`modules/seo`](../seo/README.md) through that module's generated-image hook with a single configuration line, and it works on its own through the `og-image/meta.html` head partial.

The module ships LOGIC ONLY. It carries no fonts, no background rasters, no card templates, no colors and no coordinates: the consuming site supplies the artwork and the type, and this module composes them. What it does ship is mechanics -- a canvas size, an encoder default, a nominal glyph-width table for line breaking -- so that no design decision is ever made on your behalf, and a slot key you did not set is omitted from the drawing call entirely, leaving Hugo's own documented default in force. A wrapping slot is the one exception, because the fit engine cannot compute lines out of absent numbers: there the defaults in the parameter table below apply, and each row says so.

The type is yours the same way the artwork is: a face, a line height and the seven other keys that describe how text is rendered are set ONCE at the module level for every card the site publishes, and overridden on a card template or on a single text slot where one of them needs to differ. See [Typography](#typography).

It never breaks a build over an image. One wiring guard aside, every problem below it is a deduplicated warning plus a card that still draws, or a silent decline that leaves the page with whatever image it would have had without this module.

## Installation

Add the module to your site configuration and fetch it:

```toml
# hugo.toml
[[module.imports]]
  path = 'github.com/alex-feel/hugo-artifacts/modules/og-image'
```

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/og-image
```

Confirm resolution with `hugo mod graph`.

**Template lookup precedence:** any file your site places at `layouts/_partials/og-image/<same path>.html` OVERRIDES the module's partial of that path -- that is the extension mechanism, and it also means a stray local `og-image/` partial silently shadows the module. If the module "does nothing", check for a shadowing local template first. Only `og-image/card.html` (returns a resource) and `og-image/meta.html` (renders head tags) are the stable public surface; the partials under `og-image/resolve/`, `og-image/text/` and `og-image/lib/` are internal and may change between minor versions, though same-path overrides of them work exactly the same way.

For local development against a checkout of this repository, use `hugo.work` or `[module.replacements]` as described in the repository root [`README.md`](../../README.md) and [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+. The module uses no feature Hugo documents as extended-edition-only, but everything here is built and tested on the extended edition alone, and WebP output on a non-extended binary is untested either way -- PNG or JPEG is the safe choice if you build with one.
- [Go](https://go.dev/) 1.22+ (required by Hugo Modules).
- Your own background raster under `assets/`, and -- unless Hugo's built-in Go Regular face suits the design -- your own font file under `assets/`. The registry accepts `.ttf` and `.otf`; Hugo's own documentation names TrueType, so `.ttf` is the safe choice, and a font that turns out to be unreadable costs one warning and the built-in face rather than the card.

## Usage

### Wired to the seo module

Set one key, and every page that reaches the seo module's generated-image tier gets a card of its own:

```toml
[params.seo]
  image_partial = 'og-image/card.html'
```

The hook passes `{page, title, description}`, where `title` and `description` are the RESOLVED strings that module publishes as `og:title` and `og:description`. This module draws those strings as handed rather than re-deriving them from front matter, so the card and the tags beside it can never disagree. The hook is consulted only for pages that name or bundle no image of their own, and only after the page's own candidates are exhausted, so composing a card is never paid for on a page that would discard it; a page this module declines falls straight through to the site's `default_image`. See the seo README's [Extension Hooks](../seo/README.md#extension-hooks) for the full precedence chain.

Two consequences worth knowing before you change the canvas size. The seo module crops whatever the hook returns to `1200x630` and skips the crop entirely for an image that already measures exactly that, so a card composed at the default `width`/`height` is published once and `og:image` names the very file this module returned. Move the canvas off `1200x630` and the card is paid for twice: seo re-crops it back to `1200x630` and `og:image` names that crop, while the card at your own size is still published beside it -- this module reads its URL to materialize the transformation -- with nothing referencing it. Nothing here needs a `go.mod` edge to the seo module and there is none in either direction -- the coupling is that one configuration string, so an og-image-only site never mounts the seo module's templates and vice versa.

### Standalone

With no SEO module in the site, call the shipped head partial inside `<head>`:

```go-html-template
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{ partial "og-image/meta.html" . }}
</head>
```

It emits `og:image`, `og:image:width`, `og:image:height` and `twitter:card` for the page's card, and nothing at all when the page has none. It also emits nothing when `modules/seo` is MOUNTED, because that module owns `og:image` and two of them is worse than none. Note the limit of that check: it sees whether the seo module is mounted, not whether your layout actually calls its head partial -- a site that imports seo but renders its own head gets image tags from neither module. If that is your layout, call `og-image/card.html` yourself instead:

```go-html-template
{{ with partial "og-image/card.html" . }}
  <meta property="og:image" content="{{ .Permalink }}">
  <meta property="og:image:width" content="{{ .Width }}">
  <meta property="og:image:height" content="{{ .Height }}">
{{ end }}
```

### Calling the entry directly

`og-image/card.html` takes EITHER the page itself or a dict carrying it under `page`, and RETURNS an image resource or `""` -- it never renders markup. Guard the call with `with`, as above: an empty return is how this generator says it has no card for that page, and it is silent by design.

```go-html-template
{{/* the page itself: title and description are derived from the page */}}
{{ $card := partial "og-image/card.html" . }}

{{/* handed strings: drawn exactly as given, including a deliberately empty description */}}
{{ $card := partial "og-image/card.html" (dict "page" . "title" "Launch day" "description" "") }}

{{/* a second card for the same page */}}
{{ $square := partial "og-image/card.html" (dict "page" . "opts" (dict "variant" "square" "template" "square")) }}
```

`title` and `description` are honored by PRESENCE, not by truthiness: pass them and they are drawn as handed; omit them and they are derived from the page (`.Title`, and `.Description` falling back to the plain-text `.Summary`). The `opts` dict is the call tier of the configuration cascade and additionally carries `variant`, which exists at that tier only.

The module returns at most ONE resource per call. A page that needs a second card calls the partial again with a different `variant`, because `(page, language, variant)` is the identity of a card -- see [Cascade and card identity](#cascade-and-card-identity). Callers that accept a slice of resources (the seo hook does) work unchanged; this module simply never returns one.

## Configuration

Every key is OPTIONAL, and a site that configures nothing composes nothing: the module ships no card template, so until one is defined -- as a `[params.ogcard.templates.<name>]` table, or as a `templates` map in some page's own `ogcard` front matter -- there is nothing to draw and every page declines. A language in which no card template is defined ANYWHERE warns once, because a site that imported the module and got nothing has no other signal.

```toml
# hugo.toml (or config/_default/params.toml). Every key OPTIONAL.
#
# The namespace is `ogcard`, NOT `og_image`: `og_image` and `ogimage` are widely used SCALAR
# front-matter keys naming a page's OG image URL, and a map cannot coexist with a scalar at the
# same key.

[params.ogcard]
  enable           = true      # Master switch. false makes the partial decline everywhere, silently.
  width            = 1200      # Canvas width in px (1-100000). Every x, y, size and width below is
                               # expressed in these canvas pixels.
  height           = 630       # Canvas height in px (1-100000). 1200x630 is the 1.91:1 frame Open
                               # Graph consumers crop to.
  format           = 'png'     # png | jpeg | webp. PNG is lossless, so text stays crisp.
  quality          = 75        # 1-100. Emitted for jpeg and webp only, never for png.
  anchor           = 'Center'  # Fill anchor used to normalize the background raster to width x
                               # height. Any Hugo anchor, Smart included.
  template         = ''        # Force ONE template for every page this tier covers. Normally unset
                               # -- route instead.
  default_template = ''        # Template for a page no route names. '' means an unrouted page gets
                               # NO card, silently. Name a template here to card every page.
  # variant: a CALL-TIER-ONLY key inside the `opts` dict, never read from config or front matter.
  # It distinguishes a second card for one page and is part of a card's identity. Default ''.

  # --- Typography: HOW text is rendered, as opposed to where one slot sits or what it says.
  #     Written here, each applies to every card the site publishes; a card template overrides
  #     it for its own slots, and a text slot overrides it again. See Typography cascade below.
  font         = 'regular'  # a NAME from [fonts]. Unset draws in Hugo's built-in Go Regular.
  metrics      = 'default'  # width-table name; travels with `font`, since a table models ONE face.
  line_height  = 1.4        # Line pitch = round(size * line_height) (0 < v <= 100).
  overflow     = 'shrink'   # shrink | truncate.
  ellipsis     = '…'        # Appended to a truncated last line. Set it to '' for none.
  min_scale    = 0.7        # Ladder floor as a fraction of size (0 < v <= 1).
  shrink_step  = 4          # Ladder step in px (>= 1).
  safety       = 0.98       # Budget multiplier absorbing width-estimate error (0 < v <= 1).
  width_factor = 1.0        # Coarse correction for a font wider or narrower than its metrics table
                            # (0 < v <= 100).

  # --- Routing: page -> template NAME, most specific first:
  #     front matter ogcard.template > [sections] > [kinds] > default_template.
  [params.ogcard.sections]     # keyed by the page's section
    blog = 'post'
    docs = 'doc'
  [params.ogcard.kinds]        # home | page | section | taxonomy | term
    home    = 'home'
    section = 'section'

  # --- Font registry: NAME -> a path under assets/. The module ships NO fonts.
  #     TrueType (.ttf) and OpenType (.otf) files are accepted; any other extension (.ttc, .woff,
  #     .woff2, ...) is rejected with one warning and those slots draw in Hugo's built-in Go Regular.
  [params.ogcard.fonts]
    regular = 'fonts/Inter-Regular.ttf'
    bold    = 'fonts/Inter-Bold.ttf'

  # --- Card templates: one background, N text slots, N overlays. The module ships NONE.
  [params.ogcard.templates.post]
    background = 'og/post-bg.png'   # REQUIRED. Normalized to width x height with .Fill plus `anchor`,
                                    # so a raster of any size or aspect ratio drops in and every
                                    # coordinate below stays valid. An SVG is rejected. Write it as a
                                    # table to compose on the page's own artwork instead --
                                    # { source = 'resource', match = 'tile.png', fallback = 'og/post-bg.png' }
                                    # -- see "Background sources" below.

    # Any of the nine typography keys, written here to override the module level for every slot
    # of THIS card template. All nine are optional; a card template that names none draws in the
    # site's type.
    font        = 'bold'
    line_height = 1.2

    # Text slots, drawn in declaration order, ON TOP of the overlays.
    [[params.ogcard.templates.post.text]]
      source      = 'title'     # title | description | section | section_title | kind | site_title
                                # | domain | date | param | literal
      key         = ''          # a .Param path for source='param' (dotted paths work); a Hugo time
                                # layout for source='date' (default ':date_long').
      value       = ''          # the string drawn for source='literal'.
      prefix      = ''          # glued in front of a resolved value, and dropped with it when the
      suffix      = ''          # value resolves empty, so a lone separator never draws.
      case        = 'none'      # none | upper | lower | title
      # The nine typography keys again, each overriding this card template and the module level
      # for THIS slot alone. A slot that names none draws in the card template's type.
      font        = 'bold'      # a NAME from [fonts]. Unset draws in Hugo's built-in Go Regular.
      metrics     = 'default'   # width-table name from data/og-image/metrics.toml (or your own
                                # metrics-local.toml). Lower case.
      size        = 64          # px. In a wrapping slot an unset size is taken as 20, the value
                                # Hugo itself uses, because the fit engine needs the number; in a
                                # single-line slot an unset size is omitted and Hugo applies it.
      color       = '#ffffff'   # '#rgb' or '#rrggbb' ONLY. Unset leaves Hugo's own #ffffff.
      x           = 72          # With `width` set: the wrap box's LEFT edge (0 when unset). Without
                                # `width`: the absolute anchor coordinate itself, per `align`.
      y           = 320         # Top of the first line (0 when unset in a wrapping slot).
      align       = 'left'      # left | center | right, applied per line.
      width       = 1040        # Wrap-box width in px. Its PRESENCE turns on the wrap engine;
                                # without it the slot draws on one line.
      max_lines   = 3           # Hard bound on drawn lines. 0 or unset means unlimited -- and an
                                # unlimited slot never shrinks and never truncates.
      ellipsis    = '…'         # Appended to a truncated last line. Set it to '' for none.
      overflow    = 'shrink'    # shrink walks the size ladder and truncates only at its floor;
                                # truncate truncates at the base size.
      min_scale   = 0.7         # Ladder floor as a fraction of size.
      shrink_step = 4           # Ladder step in px. The ladder holds at most 25 sizes; a step too
                                # fine to reach the floor within them is widened.
      safety      = 0.98        # Budget multiplier absorbing width-estimate error.
      width_factor = 1.0        # Coarse correction for a font systematically wider or narrower than
                                # its metrics table.
      line_height = 1.4         # Line pitch = round(size * line_height).

    # Overlays, composited in declaration order, UNDER the text.
    [[params.ogcard.templates.post.overlay]]
      source  = 'asset'          # asset | param | resource
      src     = 'og/logo.png'    # a path under assets/, for source='asset'
      key     = ''               # a front-matter param holding a path, for source='param'
      match   = ''               # a page-bundle resource glob, for source='resource' (e.g. '*avatar*')
      width   = 96               # resized to this width before compositing; unset draws native size.
      opacity = 1.0              # 0.0 - 1.0
      anchor  = 'bottomright'    # topleft|top|topright|left|center|right|bottomleft|bottom|bottomright
      x       = 72               # offset INWARD from that anchor: a left or top anchor adds it, a
      y       = 48               # right or bottom anchor subtracts it, a centered axis offsets from
                                 # the center.
```

Per-page front matter uses the same key names under an `ogcard` map, which is all the per-page work there is:

```yaml
ogcard:
  enable: false # opt this page out, silently
  template: launch # force a template; a Hugo cascade sets this for a whole section
  line_height: 1.2 # any module-level key for this page alone, the typography ones included
```

## Parameters

Module-level keys, all four tiers:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `enable` | bool | `true` | `true`, `1`, `yes`, `on` (any case) are true; anything else is false |
| `width`, `height` | int | `1200`, `630` | 1-100000. The canvas, and the unit every coordinate below is expressed in |
| `format` | string | `png` | `png`, `jpeg`, `webp` |
| `quality` | int | `75` | 1-100; applied to `jpeg` and `webp` only |
| `anchor` | string | `Center` | Any Hugo Fill anchor, `Smart` included; case-insensitive |
| `template` | string | -- | Forces one card template for every page the tier covers |
| `default_template` | string | -- | Card template for a page no route names; unset means those pages decline |
| `variant` | string | -- | CALL TIER ONLY. Distinguishes a second card for the same page |
| `sections`, `kinds` | table | -- | Routing maps, merged per NAME across tiers |
| `fonts` | table | -- | Font registry, merged per NAME across tiers |
| `templates` | table | -- | Card templates, merged per NAME across tiers |
| the nine typography keys | -- | -- | The site's type, for every card it publishes; see [Typography](#typography) |

Card template keys (`[params.ogcard.templates.<name>]`):

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `background` | string or table | yes | Where the base raster comes from. Everything else is composed onto it, and it is normalized to the canvas with `.Fill` plus `anchor` whatever its size or aspect ratio. A string is a path under `assets/`; a table names its image the same three ways an overlay entry does -- `source` (`asset`, `param` or `resource`) with `src`, `key` or `match` -- so a card can be composed on the page's own artwork. See [Background sources](#background-sources) |
| `fallback` (inside the `background` table) | string | no | A path under `assets/` composed instead when the table form resolves to nothing on a given page -- most often a routed page carrying no artwork of its own. Without one, such a page is declined |
| `text` | array of tables | no | Text slots, drawn in declaration order, above the overlays |
| `overlay` | array of tables | no | Overlays, composited in declaration order, below the text |
| the nine typography keys | -- | no | This card's type, overriding the module level for every slot it owns; see [Typography](#typography) |

Text slot keys (`[[params.ogcard.templates.<name>.text]]`) -- everything that describes THIS element rather than the site's type. The nine typography keys are accepted here too and override both levels below them:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `source` | string | `title` | See [Text sources](#text-sources) |
| `key` | string | -- | `.Param` path for `source='param'`; time layout for `source='date'` (`:date_long`) |
| `value` | string | -- | The string drawn for `source='literal'` |
| `prefix`, `suffix` | string | -- | Glued around a non-empty value only |
| `case` | string | `none` | `none`, `upper`, `lower`, `title` |
| `size` | int | `20` | 1-100000. Omitted from the drawing call when unset on a single-line slot |
| `color` | string | -- | `#rgb` or `#rrggbb`; unset leaves Hugo's `#ffffff` |
| `x`, `y` | int | `0` in a wrapping slot | -100000 to 100000. Omitted when unset on a single-line slot, where Hugo's own `10` applies |
| `align` | string | `left` | `left`, `center`, `right`. Omitted when unset on a single-line slot |
| `width` | int | -- | 1-100000. PRESENCE turns on wrapping |
| `max_lines` | int | `0` | 0-100000. 0 means unlimited; nothing shrinks or truncates without it |

Overlay keys (`[[params.ogcard.templates.<name>.overlay]]`):

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `source` | string | `asset` | `asset` (a path under `assets/`), `param` (a front-matter key holding a path), `resource` (a page-bundle glob) |
| `src` | string | -- | The `assets/` path, for `source='asset'` |
| `key` | string | -- | The front-matter key, for `source='param'` |
| `match` | string | -- | The bundle glob, for `source='resource'` |
| `width` | int | -- | 1-100000; resized before compositing, unset draws the native size |
| `opacity` | float | `1.0` | 0 <= v <= 1 |
| `anchor` | string | `topleft` | The nine Hugo-style anchors |
| `x`, `y` | int | `0` | Offset inward from the anchor |

### Typography

Nine keys describe HOW text is rendered rather than where one slot sits or what it says, and every one of them is the consuming site's to decide at THREE levels, most specific winning: **a text slot > the card template that slot belongs to > the module level** (`[params.ogcard]`, and the four tiers around it). So a site names one face and one line height ONCE, in `[params.ogcard]`, and every card it publishes draws with them -- no repeating the font on each slot of each template, and no editing this module to change a pitch.

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `font` | string | -- | A name from `[fonts]`; unset, or explicitly empty, draws in Hugo's built-in Go Regular |
| `metrics` | string | `default` | A width-table name; see [Text layout](#text-layout) |
| `line_height` | float | `1.4` | 0 < v <= 100. Line pitch = `round(size * line_height)` |
| `overflow` | string | `shrink` | `shrink`, `truncate` |
| `ellipsis` | string | `…` | Appended to a truncated last line; an explicitly empty value means none |
| `min_scale` | float | `0.7` | 0 < v <= 1 |
| `shrink_step` | int | `4` | 1-100000 |
| `safety` | float | `0.98` | 0 < v <= 1 |
| `width_factor` | float | `1.0` | 0 < v <= 100 |

The split falls where it does because of what a key DESCRIBES. A key describing how text is rendered is site typography and cascades: a face, the width table that models that face, a pitch, and the six knobs the fit engine reads. A key describing where THIS slot sits or what it says -- `source`, `key`, `value`, `prefix`, `suffix`, `case`, `size`, `color`, `x`, `y`, `align`, `width`, `max_lines` -- is per-element design and stays in the slot, because there is no site-wide answer to where a subtitle goes.

`metrics` cascades WITH `font` deliberately. A width table models one particular face, so a level that sets a face and leaves the table behind would have its lines measured against the previous face's advances, and the only symptom is line breaking at the wrong words -- see [What the width estimate is, and is not](#what-the-width-estimate-is-and-is-not).

`line_height` is the single number this module ships in `data/og-image/defaults.toml`, and it is there because the engine draws each line as its own filter and computes its `y` itself: there is no such thing as placing a line without a pitch. The number is not the module's choice either -- `1.4` is the line height Hugo's own `images.Text` documentation names when it explains its `linespacing` option. It sits in the data file with every other resolved default, so a site sees it and overrides it at any tier, on a card template, or on one slot. `font` has NO shipped default and must not have one: the module carries no fonts, and an unset face means Hugo's built-in one, which is Hugo's decision rather than this module's.

A card template is the MORE SPECIFIC level, so its value outranks the module level at every one of the module's four tiers -- a page's front matter included. A page that needs to move a value its card template sets writes that template's key in its own `ogcard.templates.<name>` map, which merges per name; a page overriding a value the module level sets writes the key directly, as the front-matter example above does.

A bad value at any of the three levels warns once, naming the level that carries it, and that level alone is dropped -- the level below it applies, and the card still draws. A `font` naming no registry entry likewise warns once and draws in Hugo's built-in face.

### Validation

Integers are read as DECIMAL and bounded: a leading zero never turns a value octal, at most nine digits are accepted, and a value that does not parse or falls outside its documented range warns once and leaves that ONE key at its default while the rest of the card draws. Floats must be written as a plain unsigned decimal (`0.5`, not `.5`), and a value outside its range warns once and falls back the same way -- including a digit string too long to be a number at all, which is out of range by definition rather than a reason to stop the build. Enum values are matched case-insensitively against their allow-list; an unknown value warns once and takes the documented fallback. Colors accept `#rgb` and `#rrggbb` only -- and that warning is the only diagnostic that exists, because Hugo accepts an unreadable color silently and draws white.

A [typography](#typography) key is the one class whose fallback is a LEVEL rather than a fixed value: the bad value is dropped from the level that wrote it, so the card template's value applies where a slot's failed, the module's where a card template's failed, and the shipped default where the module level's failed. The warning names the level either way, and the same parse and the same bounds apply at all three.

Template, font, section, kind and metrics-table names are matched in LOWER CASE, because Hugo folds configuration and front-matter keys to lower case. That also applies to the tables you write in `data/og-image/metrics-local.toml`, whose keys Hugo does NOT fold: name those tables in lower case or they will not be found.

Exactly one mistake fails a build: calling `og-image/card.html` with something that is neither a Page nor a dict carrying one under `page`. A wiring mistake has no other diagnostic. Everything else degrades -- see [Validation & Degradation](#validation--degradation) for the full catalog.

## Cascade and card identity

Configuration resolves through four tiers, lowest precedence first:

1. `data/og-image/defaults.toml` -- the module's shipped mechanics (fully commented, the authoritative key reference).
2. Site configuration: `[params.ogcard]`, read per language, so `[languages.de.params.ogcard]` works and a card composed for a translation reads that translation's configuration.
3. Page front matter: the `ogcard:` map -- which Hugo's `cascade` can set for a whole section.
4. Call site: the `opts` dict passed to `og-image/card.html`.

PRESENCE wins at every tier, not truthiness: an explicit `false`, `0` or `''` overrides the tier below it. The named tables (`templates`, `fonts`, `sections`, `kinds`) merge per NAME across tiers, so a page can override one card template's `background` without restating the rest of the site's templates.

Those four tiers resolve the MODULE level. The nine [typography](#typography) keys then take two more levels above it -- a card template, and a text slot -- so a font or a line height written in `[params.ogcard]` reaches every slot of every template, a card template overrides it for its own slots, and a slot overrides it once more. Nothing about the four tiers changes: they are how the module level itself is decided, which is why a page's front matter or a call site can still move a site-wide face for one page or one card.

Two replacement rules are worth reading twice, because both can silently discard configuration you thought was still in force. The `text` and `overlay` ARRAYS inside a card template are REPLACED wholesale by a higher tier, never merged entry by entry -- so a page that overrides one slot's color by restating `[[ogcard.templates.post.text]]` discards every other slot of that template. And a page that writes its OWN `ogcard:` map replaces a cascaded one wholesale; that is Hugo's front-matter semantic rather than this module's, so a section that cascades `ogcard.template` and a page inside it that sets `ogcard: {enable: false}` loses the cascaded template on that page.

**A card's identity is `(page, language, variant)`.** The composed result is memoized on those three, so a direct caller that varies anything else -- a different `template`, a different geometry -- WITHOUT varying `variant` gets the first call's card back. Vary `variant` whenever you want a genuinely different card for one page.

## Routing

A page is routed to a card template by name, and the candidates are walked most specific first:

1. Front-matter `ogcard.template` (or the same key at any lower tier, which is what makes a site-level `template` force one card template everywhere).
2. `[params.ogcard.sections].<the page's section>`.
3. `[params.ogcard.kinds].<the page's kind>` -- `home`, `page`, `section`, `taxonomy`, `term`.
4. `default_template`.

Whether a page with no card is a silent decline or a reported mistake is decided by PROVENANCE, not by emptiness. A page that NO candidate named is a page this generator simply has no template for: it declines silently, and the caller falls through to whatever it uses otherwise. A name that a route, front matter or `default_template` ACTUALLY SUPPLIED but `[templates]` does not define is a typo whose only other symptom would be the site's default banner turning up where a card was expected: it warns once, keyed by origin AND name, so two sections pointing at two differently misspelled templates both report. That key covers every page the misspelled name routes, so the page the message names is one EXAMPLE of them rather than the only page left without a card.

## Background sources

A card is composed ON a raster, and `background` says where that raster comes from. The string form names a path under `assets/` -- the shared backdrop every card of that template carries. The table form names the image the same three ways an overlay entry does, which is what lets a card be composed on artwork the PAGE carries:

| `source` | Names its image with | Resolves to |
| --- | --- | --- |
| `asset` (default) | `src` | A path under `assets/`, identical to the string form |
| `param` | `key` | The path held by that front-matter key, looked up in the page's own bundle first and `assets/` second |
| `resource` | `match` | The first resource of the page's own bundle matching that glob |

```toml
[params.ogcard.templates.post]
  background = { source = 'resource', match = 'tile.png', fallback = 'og/post-bg.png' }

# The same key as a sub-table, which TOML treats identically:
[params.ogcard.templates.post.background]
  source   = 'param'
  key      = 'cover'
  fallback = 'og/post-bg.png'
```

Whatever it resolves to is normalized with `.Fill` plus `anchor`, so a source of ANY size or aspect ratio covers the canvas exactly. Passing that artwork as a full-bleed overlay instead is not equivalent and fails silently: an overlay is resized to a `width` with its aspect preserved and then composited, so a source wider than the canvas ratio leaves the backdrop showing above and below it while the build exits 0.

`fallback` is what a routed page composes on when it carries no artwork of its own. It is a path under `assets/` rather than another table, because it is the last resort and must not depend on the page. A page that resolves to nothing with no fallback declared is declined, and the template says so once.

## Text sources

Each text slot resolves its `source` to one string, then applies `case`, `prefix` and `suffix`:

| `source` | Resolves to |
| --- | --- |
| `title` | The title handed to the partial, or the page's own when none was handed |
| `description` | The description handed to the partial, or the page's own (`.Description`, else the plain-text summary) |
| `section` | The page's section; empty on the home page |
| `section_title` | The current section's link title; skipped on the home page, which is in no section |
| `kind` | The page's kind |
| `site_title` | The site title for THIS page's language |
| `domain` | The host of the site's base URL |
| `date` | The page date formatted with `key` as the layout (`:date_long` by default) |
| `param` | The page parameter named by `key`, dotted paths included |
| `literal` | The slot's own `value` |

A source that resolves to nothing is a SILENT skip, together with its `prefix` and `suffix` -- an optional per-page field that only some pages carry is exactly what a slot is for: no section on the home page, no date on an undated page, no subtitle on most posts. Only mistakes speak: an unknown source token, a `param` that holds a table or a list, and a `date` layout Hugo cannot read each warn once and drop that one slot while the rest of the card renders.

## Text layout

### Wrapping and fitting

A slot with `width` set runs through the fit engine; a slot without it draws on one line, and Hugo's own canvas-edge word wrap is the silent backstop if that line does not fit. The engine measures the text once, then walks a bounded ladder of sizes from `size` down to `ceil(size * min_scale)` in `shrink_step` steps, wrapping greedily at each rung against the budget

```text
budget = floor(width * em * safety * width_factor / size)
```

and taking the first rung whose wrap neither dropped content nor left a line wider than the budget. The floor is the ladder's LAST rung ALWAYS: stepping down by `shrink_step` lands on it only when the step divides the span exactly, so the floor is appended whenever the stepped rungs stop above it, and the smallest size you allowed is always tried. If no rung fits, the smallest one is used and its last line is truncated with the `ellipsis`, so an over-long string is a visible loss the reader can see rather than a silent clip; the ellipsis itself is appended only when the truncated line still fits the budget with it, because a truncation wider than the text it replaced would be worse than none. With `overflow = 'truncate'` the ladder holds only the base size. The ladder is capped at 25 sizes (the base, at most 23 stepped rungs, and the floor); a `shrink_step` too fine to reach the floor within them is widened so the floor is still reached.

One shape no rung can fix is a box narrower than a single glyph: the wrapper has to place that glyph anyway rather than drop a character, so the line is drawn running past the box. That much the engine can see in its own arithmetic -- unlike an estimate that came out a few pixels short, which it cannot -- so it warns once per slot.

`max_lines` is what makes any of that happen. Leave it unset (or `0`) and the slot has no line bound, nothing ever overflows, and the size stays where you set it -- the text simply wraps to as many lines as it needs. The narrow-box case above is the one exception: a line the wrapper had to place over budget sends the fitter down the ladder even with no line bound, because a smaller size is what widens the per-mille budget such a line overruns.

Each line is drawn as its own text filter at `y + line_index * round(size * line_height)`, with `x` naming the box's left edge and the alignment anchor derived from `align` (left edge, box center, or right edge). That makes horizontal placement exact and makes `y` mean the top of the first line under either alignment. Nothing checks VERTICAL fit: lines below the canvas are simply not visible, so `max_lines` times the pitch is your own arithmetic. Slots fit independently and their `y` values are fixed, so a title that wraps to three lines does not push the description down; leave room for the longest case you accept, or bound it with `max_lines`.

Line breaks the author wrote survive: every newline in the resolved text is a hard break the wrapper honors. A single word wider than the whole budget is split across lines without inserting a hyphen or any other marker -- the author's text is not the module's to edit.

Of the knobs named above, `width`, `size` and `max_lines` are the slot's own; `min_scale`, `shrink_step`, `safety`, `width_factor`, `line_height`, `overflow` and `ellipsis` are [typography](#typography) keys, so each can be written on the slot, on its card template, or once for the whole site.

### What the width estimate is, and is not

Hugo exposes no way to measure rendered text -- nothing in its image namespace reports the width a string will draw at -- so THE ENGINE ESTIMATES. It sums per-glyph advance widths from a table in `data/og-image/metrics.toml`, expressed in thousandths of an em, which is why one measurement can be re-wrapped at every rung of the ladder without re-measuring anything.

The shipped `default` table is a NOMINAL model of a generic proportional Latin sans. It is not a measurement of any particular font, and it models neither side bearings nor kerning, so the estimate and the ink your font actually draws differ by a small amount that accumulates over a long line. Three knobs correct that, in increasing exactness: `safety` shrinks the budget so a mild under-estimate still lands inside the box; `width_factor` scales the budget for a font that is systematically wider or narrower than the model; and a per-glyph table extracted from the font itself removes the estimate altogether.

The cost of the estimate is what it cannot do: because the module never sees the drawn pixels, a line that overflows its box by a few pixels is invisible to it and produces no warning. **A font change silently invalidates a tuned table.** Swap `Inter-Bold` for a wider face at the same registry name and every card keeps building, keeps looking plausible, and starts breaking lines at the wrong words -- nothing in the build says so. Re-check your cards when you change a font. That is also why `metrics` cascades alongside `font`: a level that names a face is the level that should name the table modeling it, and a site that sets one face for every card sets one table with it.

### Calibrating for your own font

Extract exact advance widths from the font file once, offline, and commit them. This needs [fontTools](https://github.com/fonttools/fonttools) and is not a build dependency:

```python
from fontTools.ttLib import TTFont
f = TTFont("MyFont-Bold.ttf"); upm = f["head"].unitsPerEm; hmtx = f["hmtx"]
for cp, name in sorted(f.getBestCmap().items()):
    if 0x20 <= cp < 0x2FFF:
        print(f'"{chr(cp)}" = {round(hmtx[name][0] * 1000 / upm)}')
```

Paste the output into `data/og-image/metrics-local.toml` -- a file this module never ships, so nothing shadows yours -- under a table of your own name, and point the slot at it with `metrics = 'myfont-bold'`:

```toml
[fonts.myfont-bold]
em = 1000          # the per-mille denominator; the recipe already normalizes to 1000
space = 260        # the separator width between words
fallback = 560     # the width used for any glyph this table does not name

[fonts.myfont-bold.glyphs]
"A" = 664
"B" = 686
# ... one line per codepoint

# Optional: one width shared by a run of characters, the form the shipped table uses.
[[fonts.myfont-bold.classes]]
width = 660
chars = "ABCDEFGHJKLNOPQRSTUVXYZ"
```

A table of the same name in `metrics-local.toml` REPLACES the shipped table of that name wholesale rather than merging into it, so restate `em`, `space` and `fallback` if you override `default`; tables under other names are unaffected. `[[fonts.<name>.classes]]` and `[fonts.<name>.glyphs]` can both be present, and the per-glyph value always wins. Note the double brackets: `classes` is an ARRAY OF TABLES, as the shipped table writes it, and each entry carries exactly two keys -- `chars`, a string of the characters that share a width, and `width`, that width in per-mille em. A single `[fonts.<name>.classes]` table written without the double brackets is read as a one-entry list. Two characters need escaping when written as TOML keys: `"` and `\`.

Both files are hand-written, so every level of them is shape-checked before it is read: a file, a `fonts` key, a named table, a `classes` list, a `classes` entry or a `glyphs` table written as something other than what the recipe above shows warns once and is treated as absent. The cost is coarser line breaking -- the glyphs that piece was meant to size fall back to the table's `fallback` width -- and never a broken build.

### Non-Latin text

Any character the table does not name measures at `fallback` -- a single flat width. The shipped `default` table names only the characters whose advances differ most from that average: the capitals, a few conspicuously wide or narrow lowercase letters, and some punctuation. Everything else already measures at the one fallback width, digits and the rest of the lowercase alphabet included. For Latin that is the nominal model doing its job, but **for Cyrillic, Greek and every other non-Latin script it makes line breaking a character count rather than a width estimate** -- and for an all-caps Cyrillic headline in a condensed face that is badly wrong in both directions. If your cards carry non-Latin text, extract a table for the font you actually use (the recipe above covers Latin, Greek, Cyrillic and punctuation in one pass) -- that is the difference between breaking at the right word and breaking wherever the character count lands.

Measurement is per RUNE, not per byte, so a multi-byte character counts once. That is the part that works without a table; the WIDTH is what needs one.

### Missing glyphs

**A font draws whatever it draws for a character it has no glyph for, and the module cannot detect it.** Hugo reports nothing about a font's coverage, so nothing here can warn you, and what a given face substitutes -- a blank, a box, some other mark -- is that font's own business rather than anything predictable from here. Hugo's built-in Go Regular does draw genuine glyphs for Cyrillic and Greek, which this module's suite asserts as real ink; CJK and emoji are outside that face's coverage, and the build stays clean whatever it puts there instead. Look at a real card for every script your site publishes in, at least once.

The same applies to the default ellipsis, U+2026: a face that has no glyph for it substitutes whatever it substitutes, and the width estimate is a guess either way, because the shipped `default` table does not name that character and measures it at `fallback`. Set `ellipsis` to `...` if you would rather not depend on the face carrying it.

## Validation & Degradation

The module NEVER breaks a build over an image. `errorf` is reserved for the single wiring mistake in the first row; everything below it is a deduplicated `warnf` (a misconfiguration a maintainer should fix) or a silent skip (a legitimately absent optional value). Every warning is prefixed `[og-image]`, names the page or the offending value, and fires ONCE per key per build across every page and output format -- and the keys embed the offending value, so two distinct mistakes of the same class both surface rather than the first one hiding the second.

| Situation | Behavior | One warning per |
| --- | --- | --- |
| `og-image/card.html` called with neither a Page nor a dict carrying one under `page` | **errorf** -- the one build-failing case | n/a |
| `enable` false at any tier | Silent decline | -- |
| No route named a template and `default_template` is unset | Silent decline -- the contract: this generator has no template for that page | -- |
| A route, front matter or `default_template` names a card template `[templates]` does not define | Warn + decline | origin + name |
| A `[sections]` or `[kinds]` route entry holds a table, list or boolean | Warn + treated as unnamed, so the next route tier is tried | origin + value |
| `template` or `default_template` holds a table, list or boolean at some tier | Warn + that tier's value dropped, so a lower tier's value stands and the router still tries the remaining candidates | key + value |
| `template`, `default_template` or a route entry written with no value at all | Silently ignored, so the tier or candidate below it stands -- unlike an explicit `''`, which is a value and does override the tier below | -- |
| Card template defines no `background` | Warn + decline (a card is composed ON a raster) | template name |
| `background` names nothing under `assets/`, including a path the operating system refuses to look up at all (a glob, a pasted URL) | Warn + decline, or compose on `fallback` when one is declared | path |
| `background` is an SVG, an unsupported format, or a file whose bytes are not the image its extension claims | Warn + decline, or compose on `fallback` | path |
| `background` cannot be normalized to the canvas | Warn + decline | path |
| `background` raster is not exactly the canvas size | Silently normalized with `.Fill` plus `anchor` | -- |
| `background` table names a `source` outside `asset`, `param`, `resource` | Warn + decline, or compose on `fallback` | source token |
| `background` table names a `source` but no `src`, `key` or `match` | Warn + decline, or compose on `fallback` | template name |
| `background` `match` is not a pattern Hugo can match against a page's resources (an unclosed `[`) | Warn + decline, or compose on `fallback` | template + pattern |
| The page carries no image the `param` or `resource` source resolves to, and a `fallback` is declared | Silently composed on the fallback -- the case it exists for | -- |
| The page carries no such image and NO `fallback` is declared | Warn once per template + decline; the page named is one EXAMPLE of those it covers | template name |
| `background.fallback` names nothing under `assets/`, or carries no image Hugo can process | Warn + decline; reported separately from the primary source's own diagnostic | path |
| `background.fallback` is a table, list or boolean | Warn + treated as undeclared | template name |
| Slot names a font `[fonts]` does not register | Warn + that slot draws in Go Regular; **card still produced** | font name |
| Registered font path names nothing under `assets/`, including one the operating system refuses to look up | Warn + Go Regular | path |
| Registered font is not `.ttf` or `.otf` | Warn + Go Regular | path |
| Font passes that guard but cannot be read as a font | Warn + the card is redrawn with every font dropped, in Go Regular. A failing redraw warns and declines | template + fonts, then page + template |
| Int that does not parse or is out of range (module `width`/`height`/`quality`; slot `size`/`x`/`y`/`width`/`max_lines`; overlay `width`) | Warn + that ONE key falls back to its default; everything else still draws | key + value, plus the tier for a module key and the template and index for a slot or overlay |
| Overlay `x` or `y` that does not parse | Silently taken as 0 | -- |
| A typography key (`font`, `metrics`, `line_height`, `safety`, `width_factor`, `min_scale`, `shrink_step`, `overflow`, `ellipsis`) that does not parse, is out of range, or is not in its allow-list, at ANY of its three levels | Warn naming the level + that level's value dropped, so the level below it applies; the card still draws | key + value + level |
| A typography key given a table or a list where a single value is expected (`font`, `metrics`, `ellipsis`) | Warn naming the level + that level's value dropped, so the level below it applies | key + value + level |
| Float that does not parse or is out of range (overlay `opacity`) | Warn + that key falls back to its default | template + index + key + value |
| `color` is not `#rgb` or `#rrggbb` | Warn + the key is dropped, so Hugo's own `#ffffff` applies. Hugo accepts an unreadable color silently and draws white, so this is the only signal | template + value |
| Unknown enum (`format`, `anchor`, slot `align`, `case`, overlay `anchor`, overlay `source`) | Warn + the documented fallback (`png`, `Center`, `left`, text as written, `topleft`; an unknown overlay `source` drops that overlay) | key + value, plus the tier for `format` and `anchor` |
| Unknown slot `source` token | Warn naming the whole vocabulary + that slot dropped; the rest of the card draws | token |
| `source='param'` naming a key the page does not carry | Silent skip -- optional per-page fields are a design, not a mistake | -- |
| `source='param'` resolving to a table or a list | Warn + that slot skipped | key |
| `source='date'` on a page with no date | Silent skip | -- |
| `source='date'` whose `key` is not a layout Hugo understands | Warn + that slot skipped | layout |
| `source='section'` or `'section_title'` on the home page | Silent skip | -- |
| Any source resolving to empty or whitespace | Silent skip, together with its `prefix` and `suffix` | -- |
| Overlay entry naming no image at all: no `src` under `source='asset'`, no `key` under `'param'`, no `match` under `'resource'` | Warn + that overlay dropped; **card still produced** | template + index |
| Overlay `src` naming nothing under `assets/`, including a path the operating system refuses to look up | Warn + that overlay dropped; **card still produced** | path |
| Overlay `match` that is not a pattern Hugo can match against a page's resources (an unclosed `[`) | Warn + that overlay dropped -- a card-template pattern no page could satisfy | template + pattern |
| Overlay naming an unusable image (SVG, unsupported format, bytes that are not the image the extension claims) | Warn + that overlay dropped; **card still produced** | path or pattern |
| Overlay that cannot be resized or faded | Warn + that overlay dropped | path or pattern |
| Overlay `source='param'`/`'resource'` the page does not carry, or whose page-supplied value names no image | Silent skip -- the per-page avatar case | -- |
| Every slot resolved empty AND no overlay drew | Silent decline: a per-page copy of a shared background says nothing the site's default image does not | -- |
| Text wider than the canvas in a slot with no `width` | Silent. Hugo word-wraps at the canvas edge on its own; the module cannot warn about a layout it did not perform | -- |
| `max_lines` set on a slot with no `width` | Silent no-op | -- |
| A wrapping slot whose box is narrower than one glyph at every size it allows | Warn + its lines drawn running past the box; card still produced | template + slot index |
| `metrics` names a table neither data file defines | Warn + every glyph measured at the nominal fallback width, so breaking is coarse; card produced | table name |
| A metrics data file, its `fonts` key, or a named width table inside it is not a table | Warn + no width table from that file (or under that name) applies | file, or file + table name |
| A width table's `classes` is not one or more tables, a `classes` entry carries no `chars` string or no whole-number `width`, or `glyphs` is not a table | Warn + the glyphs that piece was meant to size fall back to that table's `fallback`; card produced | table name + value, or table name + entry index |
| `data/og-image/defaults.toml` not found (the module is mounted wrongly) | Warn + only explicitly configured values apply | fixed |
| A site's own `data/og-image/defaults.*` overrides the shipped one with something that is not a table | Warn + the shipped defaults do not apply, so only explicitly configured values do | fixed |
| `params.ogcard`, the front-matter `ogcard`, the `opts` handed to `og-image/card.html`, or one of the named tables (`templates`, `fonts`, `sections`, `kinds`) is not a table | Warn + that tier or section ignored | language for the site tier, page for the front-matter and call tiers, section + value for a named table |
| An entry of `text` or `overlay` is not a table, or the key itself is a bare scalar | Warn + that entry (or the whole key) dropped; the rest of the card draws. A single table written where an array of tables is expected is accepted as a one-entry list | template + array + index, or template + array |
| Anything else failing while composing, encoding or publishing | Warn + decline. This row exists so the completeness of the rest of the table is not load-bearing | page + template |
| No card template is defined anywhere in a language -- no `[params.ogcard.templates.<name>]` table at any tier, and no `ogcard.templates` map in any page's front matter | One warn naming the missing configuration, per language | language |

## Build cost and caching

A card costs a handful of image transformations: normalizing the background to the canvas, resizing or fading each overlay, ONE composite that applies every overlay and every text line at once, and one encode into the configured format. The composite is a single transformation no matter how many lines and overlays it draws, so a five-line card is not five times the work of a one-line card. The template work -- measuring, wrapping, fitting -- is memoized on `(page, language, variant)`, so a page rendered into several output formats measures its text once.

Hugo caches processed images under `caches.images` (`:resourceDir/_gen` by default, `maxAge = -1`) and gives every derivative a hashed file name, and this pipeline is deterministic: no timestamp, counter or build-varying value ever reaches the drawn pixels. Two consequences follow. Cards that resolve to identical inputs -- the same background, the same strings, the same geometry -- resolve to one derivative and publish as ONE file that every one of those pages points at. And a rebuild that changed nothing resolves to the same file names and reuses the cached derivatives instead of composing and encoding them again. Either commit `resources/_gen` or persist it in CI (point `caches.images.dir` at `:cacheDir/images` so a CI cache step can capture it); a derivative URL carries that hash, so serve those paths with `Cache-Control: max-age=31536000, immutable`.

Cost scales with the number of pages that actually reach the generator, which is why the seo hook's placement matters: it is consulted only for pages that name no image of their own. Changed geometry, changed strings or a changed background orphan the old derivatives until `hugo --gc`.

## Module Structure

The module ships `layouts/` and `data/` plus the two identity files, this README, and a `test/` directory carrying its validation suite. It needs no `assets/`, `static/`, `i18n/`, `content/` or `archetypes/`: the fonts and rasters a card is made of are the consuming site's, by design.

```text
modules/og-image/
├── go.mod                                  Go module definition (leaf module)
├── hugo.toml                               Hugo version floor
├── README.md                               This file
├── data/
│   └── og-image/
│       ├── defaults.toml                   Shipped mechanical defaults (tier 1 of the cascade)
│       └── metrics.toml                    Nominal per-glyph width table used for line breaking
├── layouts/
│   └── _partials/
│       └── og-image/
│           ├── card.html                   PUBLIC entry: returns the page's card resource, or ""
│           ├── meta.html                   PUBLIC head renderer for standalone use; silent when seo is mounted
│           ├── config.html                 INTERNAL four-tier cascade resolver
│           ├── compose.html                INTERNAL composer: background, overlays, text, encode, publish
│           ├── resolve/
│           │   ├── template.html           Chooses the card template; decides decline versus warn
│           │   ├── background.html         Turns `background` into the normalized base raster
│           │   ├── slots.html              Turns the `text` array into one text filter per line
│           │   ├── typography.html         Normalizes the nine type keys at any of their three levels
│           │   ├── source.html             Resolves ONE slot's source, case, prefix and suffix
│           │   ├── overlays.html           Turns the `overlay` array into positioned overlay filters
│           │   └── font.html               Turns one registered font path into a usable font resource
│           ├── text/
│           │   ├── metrics.html            Resolves one named width table into a per-glyph lookup
│           │   ├── measure.html            Turns a string into tokens with per-mille-em widths
│           │   ├── wrap.html               Greedy word wrap against a budget; total, bounded, truncating
│           │   ├── split-word.html         Breaks one over-budget word into fitting chunks
│           │   └── fit.html                Walks the size ladder and returns the fitted lines
│           └── lib/
│               ├── warn.html               Single deduplicated-warning helper
│               ├── warn-emit.html          The emitting body warn.html wraps in partialCached
│               ├── int.html                Guarded decimal-integer parser (never octal, never overflow)
│               ├── as-map-list.html        Reads an array-of-tables key as something safe to range over
│               └── resolve-image.html      Owns the asset/param/resource vocabulary a background and an overlay share
└── test/                                   Fixture site + build-output assertion suite
```

This module cannot build standalone -- Hugo builds require a consuming site -- so `test/` ships a fixture consuming site plus build-output assertions, run with `bash modules/og-image/test/run-tests.sh` (or `run-tests.cmd` on Windows). Composing a card and publishing it as an `og:image` are two modules' work, so that combination is covered by the cross-module suite in [`modules/test-composition/`](../test-composition/README.md) rather than by either module's own fixture.
