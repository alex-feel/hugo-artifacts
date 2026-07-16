# callout

Hugo shortcode module that renders a paired admonition / callout block -- a titled, optionally collapsible box for notes, tips, warnings, and any other emphasis. The module outputs style-agnostic semantic HTML with [BEM](https://getbem.com/) CSS class hooks, data attributes, and CSS custom-property tone names, delegating all visual styling to the consuming site. It is the sibling of [`shortcodes/github-repo`](../github-repo/README.md) and [`shortcodes/hf-space`](../hf-space/README.md) and follows the same conventions (unstyled, universal, ship-zero-CSS).

It offers fifteen first-class types with true-synonym aliases and arbitrary custom-type passthrough, native `<details>` collapsibility, opt-in ARIA semantics, verbatim (never re-cased) user titles, and a block-level body that handles multiple paragraphs, lists, code blocks, and nested shortcodes. This module ships no color, no hex, no dark-mode rule, and no CSS at all.

## Installation

Import the module in your site's Hugo configuration:

```toml
# hugo.toml

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/shortcodes/callout'
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/shortcodes/callout
```

**Important -- template lookup precedence:** If your site already has a file at `layouts/_shortcodes/callout.html` or `layouts/_markup/render-blockquote.html`, Hugo uses the local file instead of the module's. Delete the local file for the module to take effect, or keep it to deliberately override the module (see [Blockquote alert render hook](#blockquote-alert-render-hook)).

## Requirements

- Hugo v0.160.0+ (extended edition)
- Go 1.22+

## Usage

```go-html-template
{{</* callout "note" */>}}
This is a simple note with **markdown** inside.
{{</* /callout */>}}
```

The first positional argument is the callout type; the optional second is the title. Everything between the opening and closing tags is the body, rendered as block-level Markdown -- nested shortcodes, render hooks, lists, code blocks, and multiple paragraphs all work.

````go-html-template
{{</* callout "danger" "Do not run this in production" */>}}
The following command **irreversibly** drops every table.

```sql
DROP DATABASE app;
```
{{</* /callout */>}}
````

A type with no title falls back to the type's own label (for example `warning` renders the title "Warning"). A user-supplied title is emitted verbatim, so casing such as "iOS quirks" is preserved. Pass `title=""` (an empty or whitespace-only title) to suppress the head entirely and render a head-less box:

```go-html-template
{{</* callout type="tip" title="" */>}}
A quiet, head-less tip -- body only.
{{</* /callout */>}}
```

> A single shortcode call uses **either** positional **or** named arguments, never both -- this is a Hugo-wide rule, not specific to this module. Use all-positional (`callout "tip" "Title"`) for the common type+title case, and switch to all-named (`callout type="tip" title="Title" collapsible="true"`) as soon as you need any of the named-only parameters (`collapsible`, `open`, `role`, `icon`, `id`, `class`).

## Types

The type may be a first-class type, an alias (a true synonym that resolves to a canonical type), or **any custom slug**. A custom/unknown type is passed through literally -- it emits `class="callout--<your-type>"` and `data-callout-type="<your-type>"` with a passive ARIA role and no default icon, so you can define unlimited callout styles in your site CSS. Unknown types are never coerced back to `note`.

### First-class types

Each first-class type ships a default icon and a passive default ARIA role. The label is the title shown when no title is supplied (localizable via i18n -- see [Styling](#icons)).

| Type | Default label | Default icon | Aliases | Typical semantics |
| --- | --- | --- | --- | --- |
| `note` | Note | pencil | `seealso` | General aside or annotation |
| `info` | Info | info circle | -- | Neutral informational detail |
| `tip` | Tip | lightbulb | `hint` | Helpful advice or shortcut |
| `success` | Success | check circle | `check`, `done` | Confirmation of a good outcome |
| `question` | Question | help circle | `help`, `faq` | A question or FAQ entry |
| `important` | Important | alert circle | -- | Key information not to miss |
| `warning` | Warning | triangle exclamation | `attention` | Something needing care |
| `caution` | Caution | shield alert | -- | Proceed carefully; possible risk |
| `danger` | Danger | octagon exclamation | `error` | Hazard or destructive action |
| `failure` | Failure | x circle | `fail`, `missing` | A failed state or absent item |
| `bug` | Bug | bug | -- | A known defect |
| `example` | Example | flask | -- | A worked example |
| `quote` | Quote | quotation mark | `cite` | A quotation or citation |
| `abstract` | Abstract | clipboard list | `summary`, `tldr` | A summary or TL;DR |
| `todo` | Todo | checkbox | -- | An outstanding task |

### Custom types

```go-html-template
{{</* callout type="brand-spotlight" title="Spotlight" icon="✨" */>}}
Anything you can style. This renders class `callout--brand-spotlight`,
`data-callout-type="brand-spotlight"`, and the supplied emoji icon.
{{</* /callout */>}}
```

An unknown type emits one deduplicated build warning (so a typo surfaces once) and then renders. It is otherwise a first-class citizen of the markup.

## Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `type` | string | no | `note` | Positional `0` or `type=`. First-class type, alias, or any custom slug. |
| `title` | string | no | type label | Positional `1` or `title=`. Verbatim when supplied; the type's label when omitted; an empty or whitespace-only title suppresses the head. |
| `collapsible` | bool | no | `false` | Render as a native `<details>`/`<summary>` disclosure. Truthy tokens: `true`/`1`/`yes`/`on`, any casing. |
| `open` | bool | no | `false` | When `collapsible`, start expanded (adds the `open` attribute). Same tokens as `collapsible`. |
| `role` | string | no | passive | ARIA override: `note`, `alert`, `status`, or `none`. See [Accessibility](#accessibility). |
| `icon` | string/bool | no | type default | Icon override: a built-in icon name, a single emoji, or an image reference (local path or `http(s)://` URL). `icon=false` suppresses the icon. See [Icons](#icons). |
| `id` | string | no | -- | `id` attribute on the root element, for anchoring/linking. |
| `class` | string | no | -- | Additional CSS class(es) appended to the root element. |

### Validation

The shortcode never fails the build. It is intentionally permissive:

- An unknown `type` is valid and passes through literally (one deduplicated warning per unknown type).
- An empty body is valid (the body element is rendered empty).
- An unrecognized `role` value is ignored, falling back to the passive default (one deduplicated warning).
- An unrecognized `collapsible`/`open` token is treated as `false` (one deduplicated warning).
- An `icon` image reference that cannot be resolved or fetched, or an `icon` name that is not a built-in glyph, renders without an icon (one deduplicated warning).

All warnings are emitted via `warnf` and deduplicated through `hugo.Store`, so repeated invocations do not multiply them.

## Collapsibility

Set `collapsible="true"` to render a native HTML disclosure using `<details>`/`<summary>` -- no JavaScript required. Add `open="true"` to start expanded.

```go-html-template
{{</* callout type="abstract" title="Table of contents" collapsible="true" open="true" */>}}
- Chapter one
- Chapter two
{{</* /callout */>}}
```

The collapsible form uses `<summary class="callout__head">` for the clickable title row and `<div class="callout__body">` for the disclosed content. The native disclosure already conveys expand/collapse state to assistive technology, so the collapsible form deliberately carries no explicit `role` attribute.

## Accessibility

By default the callout uses a **passive** ARIA role (`role="note"`) on the static form. This is correct for ordinary static prose: it labels the region without announcing it.

The `role` parameter opts into a different semantic for callouts whose content is genuinely **dynamic** (updated client-side after load):

- `role="status"` -- a polite live region; assistive tech announces updates without interrupting.
- `role="alert"` -- an assertive live region; assistive tech interrupts to announce.
- `role="none"` -- emit no role attribute.

Do not set `alert` or `status` on static prose: live-region roles cause assistive technology to announce content spuriously on page load. The defaults are passive precisely to avoid that. The collapsible (`<details>`) form ignores `role` because its disclosure semantics are already native.

Type icons are decorative (`aria-hidden="true"`): the type is conveyed by the visible title and the `data-callout-type` attribute, so the icon is not announced redundantly.

## Blockquote alert render hook

The module also ships `layouts/_markup/render-blockquote.html`, a blockquote render hook that turns Hugo's GitHub-style alert syntax into the **same** callout markup as the shortcode (reusing the shared type resolver and renderer, so the two render identically):

```text
> [!NOTE]
> Useful information that users should know.

> [!WARNING]
> Urgent info that needs immediate attention.
```

The five GitHub alert designators map to the first-class types `note`, `tip`, `important`, `warning`, and `caution`. The Obsidian-compatible foldable extension is honored: a trailing `+` makes the callout collapsible and open, a trailing `-` makes it collapsible and collapsed, and the text after the sign becomes the title.

```text
> [!WARNING]+ Radiation hazard
> Do not approach without protective gear.
```

Ordinary (non-alert) blockquotes pass through unchanged as a plain `<blockquote>`, so importing the module does not alter normal quotations.

**Activation is site-wide.** Importing this module registers the blockquote render hook for every Markdown blockquote on the site. To customize or disable it, place your own `layouts/_markup/render-blockquote.html` in your project root -- a project-level template wins over a module-provided one in Hugo's lookup order.

For localized alert titles and the foldable extended syntax, enable Markdown attributes for blockquotes if you also use attribute syntax; the alert and foldable features themselves require no extra configuration on Hugo v0.160.0+.

## Styling

The module outputs unstyled semantic HTML. All visual presentation is the consuming site's responsibility. The module ships no CSS, no color, no hex values, and no dark-mode rule.

### CSS hooks

Every element uses BEM naming under the `callout` block:

- **Block:** `callout` (the root `<div>` or `<details>`)
- **Type modifier:** `callout--<type>` (for example `callout--note`, `callout--danger`, or `callout--<your-custom-type>`)
- **Elements:** `callout__head`, `callout__title`, `callout__icon`, `callout__body`
- **Icon modifiers:** `callout__icon--emoji` (emoji override), `callout__icon--image` (resource override)

```css
.callout {
  border-left: 4px solid var(--callout-tone, currentColor);
  padding: 1rem 1.25rem;
}
.callout__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}
.callout__icon {
  flex: none;
}
```

### CSS custom properties

The root element sets `--callout-tone` (via an inline `style` attribute) to a per-type tone **name**, not a color value:

```text
style="--callout-tone: var(--callout-tone-note);"
```

This means your CSS only needs to define the per-type tone variables (the hex values below are illustrative consumer examples, not shipped defaults -- the module bakes in no color); the block-level `--callout-tone` resolves automatically:

```css
:root {
  --callout-tone-note: #5b8def;
  --callout-tone-info: #4aa3df;
  --callout-tone-tip: #34c759;
  --callout-tone-success: #34c759;
  --callout-tone-question: #af52de;
  --callout-tone-important: #5856d6;
  --callout-tone-warning: #ff9f0a;
  --callout-tone-caution: #ff9500;
  --callout-tone-danger: #ff3b30;
  --callout-tone-failure: #ff3b30;
  --callout-tone-bug: #ff2d55;
  --callout-tone-example: #5ac8fa;
  --callout-tone-quote: #8e8e93;
  --callout-tone-abstract: #64d2ff;
  --callout-tone-todo: #30b0c7;
  /* ...and one per custom type you introduce. */
}
```

Because the module never bakes in a color, dark mode is entirely yours: redefine the `--callout-tone-*` variables under your dark-theme selector. No `.dark` rule ships with the module.

### Data attributes

| Attribute | Value | Purpose |
| --- | --- | --- |
| `data-callout-type` | the resolved canonical/custom type | Type identification and CSS attribute selectors (`[data-callout-type="danger"]`) |

### Icons

Each first-class type ships a default inline SVG glyph in `layouts/_partials/callout/icon.html`. All icons use `width="1em" height="1em"` (scale with font size), `aria-hidden="true"`, a `24x24` viewBox, and `currentColor`, so they inherit the surrounding text color. No external icon font is required. The geometry is original line-art in the Lucide / Tabler / Octicons visual idiom.

Override the icon per call with the `icon` parameter:

- `icon="tip"` -- render a different built-in glyph by name.
- `icon="🎉"` -- emit a single emoji (rendered as text inside `callout__icon--emoji`).
- `icon="/images/brand.svg"` -- resolve a page resource, then a global resource, and emit an `<img class="callout__icon--image">`.
- `icon="https://example.com/brand.svg"` -- fetch the image at build time, republish it under the site's own origin, and emit the same `<img>`. A failed fetch renders without an icon (one deduplicated warning); the build never breaks. Remote fetching works out of the box for every media type Hugo recognizes (`svg`, `png`, `jpg`, `jpeg`, `jpe`, `jif`, `jfif`, `gif`, `webp`, `avif`, `bmp`, `tif`, `tiff`, `heic`, `heif`); a remote `.ico` needs a custom `ico` media type defined in the consuming site's configuration, because Hugo ships none -- prefer `svg`/`png` for remote icons.
- `icon=false` -- suppress the icon (the tokens `"false"`, `"none"`, `"no"`, `"off"`, `"0"`, and `""` all work, any casing).

A value counts as an image reference only when it contains `/`, starts with `http://` or `https://`, or ends in a known image extension (`svg`, `png`, `jpg`, `jpeg`, `jpe`, `jif`, `jfif`, `gif`, `webp`, `avif`, `ico`, `bmp`, `tif`, `tiff`, `heic`, `heif`); any other value -- including a dotted name such as `brand.v2` -- is treated as a glyph name, matched case-insensitively.

Custom (unknown) types have no default icon; supply one with `icon=` if you want a glyph.

To localize the default labels, add i18n strings keyed `callout.<type>` (preferred) or `<type>` -- for example `callout.warning = "Achtung"`. An i18n value is used verbatim (its casing is preserved), so translators control the exact display text. When no key matches, the label is the Title-cased type slug.

## Module Structure

```text
shortcodes/callout/
  go.mod
  hugo.toml
  layouts/
    _shortcodes/
      callout.html              # Entry shortcode: params, type resolution, body render, dispatch
    _partials/
      callout/
        resolve-type.html       # Shared resolver: raw type -> canonical/role/iconName/label/known
        render.html             # Shared BEM markup (div + details forms) reused by shortcode and hook
        head.html               # Shared head inner: icon + title
        icon.html               # Default inline SVG glyph per first-class type
    _markup/
      render-blockquote.html    # GitHub-alert blockquote hook reusing resolve-type.html + render.html
```
