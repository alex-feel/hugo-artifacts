# accordion

Hugo shortcode module that renders an accordion -- a group of collapsible, individually titled sections -- and the single disclosure widget it is built out of. The module outputs style-agnostic semantic HTML with [BEM](https://getbem.com/) CSS class hooks, delegating all visual styling to the consuming site. It is the sibling of [`shortcodes/callout`](../callout/README.md) and follows the same conventions (unstyled, universal, ship-zero-CSS).

It is built on the native `<details>` / `<summary>` elements and ships **zero JavaScript, zero CSS, and zero ARIA**. The browser carries the toggle behavior, the keyboard interaction, and the expand/collapse state semantics; the module carries the structure and the class hooks. That also buys two things a scripted accordion cannot have: an item stays usable with JavaScript disabled, and a browser can open a closed item by itself when the reader searches the page or follows a link into it.

Both authoring surfaces render the same markup: paired `accordion` / `accordion-item` shortcodes for Markdown, and a public `accordion/list.html` partial for layouts.

## Installation

Import the module in your site's Hugo configuration:

```toml
# hugo.toml

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/shortcodes/accordion'
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/shortcodes/accordion
```

**Important -- template lookup precedence:** If your site already has a file at `layouts/_shortcodes/accordion.html`, `layouts/_shortcodes/accordion-item.html`, or `layouts/_partials/accordion/list.html`, Hugo uses the local file instead of the module's. Delete the local file for the module to take effect, or keep it to deliberately override the module.

## Requirements

- Hugo v0.160.0+ (any edition)
- Go 1.22+

## Usage

### From Markdown

```go-html-template
{{</* accordion */>}}
{{</* accordion-item "Shipping" */>}}
Ships in **two** days. Markdown, nested shortcodes, and render hooks all work here.
{{</* /accordion-item */>}}
{{</* accordion-item "Returns" */>}}
Thirty days, no questions.
{{</* /accordion-item */>}}
{{</* /accordion */>}}
```

The item's first positional argument is its title, rendered as inline Markdown. Everything between an item's opening and closing tags is its body, rendered as block-level Markdown.

An item may also be used **on its own**, without a container. It then renders a complete single-item accordion, which is what a page needs when it has one collapsible region rather than a set:

```go-html-template
{{</* accordion-item "Full changelog" */>}}
The whole list, hidden until asked for.
{{</* /accordion-item */>}}
```

> A single shortcode call uses **either** positional **or** named arguments, never both -- this is a Hugo-wide rule, not specific to this module. Use the positional form for the common title-only case (`accordion-item "Shipping"`), and switch to all-named as soon as you need any other parameter (`accordion-item title="Shipping" open="true"`).
>
> Use the `{{</* */>}}` notation, not `{{%/* */%}}`. The percent form pushes the module's own markup back through the Markdown renderer.

### From a layout

```go-html-template
{{ partial "accordion/list.html" (dict
  "page" .
  "position" "layouts/skills/list.html"
  "items" (slice
    (dict "title" "Frontend" "content" "Everything that runs in a browser.")
    (dict "title" "Backend" "content" $alreadyRenderedHTML "open" true)
  )
) }}
```

The partial takes the current page, an `items` slice, and the same container options the shortcode accepts. It is the surface to use from a template, where there is no Markdown to author shortcodes in.

## Parameters

### Container (`accordion` shortcode, or the `accordion/list.html` dict)

| Parameter | Type | Default | Purpose |
| --- | --- | --- | --- |
| `exclusive` | bool | `false` | Single-open behavior: opening one item closes its group sibling. Implemented with the native `name` attribute, so it needs no JavaScript. A fresh group name is minted per container. |
| `group` | string | none | An explicit group name. Implies `exclusive`, and lets two separate containers share one group -- grouped `<details>` elements need not be siblings. |
| `heading` | int | none | `2`-`6`: wrap each item's title in an `<hN class="accordion__heading">` inside the summary, giving screen-reader users heading navigation between items. Read [Headings](#headings) before turning it on. |
| `icon` | bool | `true` | Render the chevron glyph in each item's summary. |
| `id` | string | none | `id` attribute on the container element. |
| `class` | string | none | Extra class(es) on the container element. |

### Item (`accordion-item` shortcode, or an `items` entry)

| Parameter | Type | Default | Purpose |
| --- | --- | --- | --- |
| `title` | string | **required** | The summary text, rendered as inline Markdown. Positional argument 0, or `title=`. |
| `open` | bool | `false` | Start expanded (emits the native `open` attribute). |
| `id` | string | minted | The item's deep-link anchor. Omit it to have one minted from the title; pass `id=""` to emit none. See [Deep linking](#deep-linking-and-find-in-page). |
| `class` | string | none | Extra class(es) on the item's `<details>` element. |
| `content` | string or `template.HTML` | none | **Partial path only** -- an item's body. A plain string is rendered as Markdown; a `template.HTML` value passes through untouched. See [Body content on the partial path](#body-content-on-the-partial-path). |

### Validation

A **missing or blank item title is a build failure.** A disclosure control with no accessible name leaves the browser to substitute its own non-localizable label, which tells a screen-reader user nothing about what the item hides -- there is no useful way to degrade from that, so the build stops instead.

Everything else degrades and warns exactly once per build:

| Input | Result |
| --- | --- |
| An unrecognized boolean token | Falls back to the parameter's default. `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off` are accepted in any casing. |
| A `heading` outside 2-6, or non-numeric | No heading; the title renders as a plain span. |
| An unknown parameter name (a typo) | Ignored. |
| Positional arguments on the container | Ignored; the container takes named parameters only. |
| A container with no items | Renders nothing. |
| An empty `items` slice on the partial path | Renders nothing. |
| A second `open` item in one exclusive group | Rendered as authored, with a warning: browsers keep only the **first** open member of a named group and silently close the rest. |

## Exclusive groups

`exclusive="true"` makes a container's items mutually exclusive through the native `<details name>` attribute -- no JavaScript, no click handler, no state to keep in sync. Two exclusive containers on one page always get different group names, so they never close each other's items.

An explicit `group="faq"` names the group instead, which is how two containers in different parts of a page join one exclusivity group.

Support floor for the `name` attribute: Chrome 120, Safari 17.2, Firefox 130. Older browsers **ignore it and degrade gracefully** -- every item still opens and closes, just independently.

Two things to know before choosing exclusive mode. Browsers keep only the first `open` item within a group (the module warns when it sees a second). And assistive technology has no defined way to announce the mutual-exclusion relationship, so exclusivity is progressive behavior rather than announced semantics.

## Accessibility

**The module emits no ARIA at all, deliberately.** `<details>` / `<summary>` already carries the disclosure semantics natively, and the first rule of ARIA is to use the host language feature when it provides equivalent accessibility. The keyboard contract the WAI-ARIA Authoring Practices Guide specifies for an accordion -- <kbd>Enter</kbd> and <kbd>Space</kbd> to toggle, ordinary <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> to move between headers, no arrow keys -- is exactly what a native `<summary>` provides.

**Do not add `role="button"` to the summary.** It is the most common "improvement" made to native disclosures and it makes them worse: it can suppress the browser's own expanded/collapsed state announcement and stop VoiceOver from exposing a heading nested inside.

Known platform-level caveats, which no module-side markup can fix:

- NVDA has an unresolved state-announcement bug with Firefox on plain `<details>`.
- VoiceOver sometimes fails to announce a summary reached by arrow-key navigation.
- Grouped (`name`ed) `<details>` have no defined accessibility-tree semantics for the grouping itself.

### Headings

`heading=2..6` wraps each item's title in a real heading element inside the summary, so screen-reader users can jump between items with heading navigation. It is **off by default**, because heading-in-summary is the one construct assistive technology handles inconsistently:

- Chrome exposes the heading only when the summary is not a `list-item` box. Add `summary { display: block }` (see [Styling](#styling)) when you turn heading mode on.
- JAWS strips the heading regardless of CSS.
- NVDA and VoiceOver expose it.

The icon stays outside the heading element, so heading navigation announces the title text alone.

## Deep linking and find-in-page

Every item carries an `id` on its body element, minted from the title with `anchorize` -- the same sanitizer Hugo uses for automatic heading anchors -- plus `-1`, `-2` collision suffixes, so `#shipping` links to the item titled "Shipping". Pass `id=` to choose the anchor yourself, or `id=""` to emit none.

The anchor is on the **body**, not on the `<details>` element, and that placement is load-bearing. The HTML standard's _ancestor details revealing algorithm_ walks up from a navigation target and opens each `<details>` the target sits inside; the walk excludes the target itself, and a `<summary>` sits outside the revealed content. Anchoring the body is what lets a browser open a closed item when a link points into it. Support: Chrome 97+, Firefox 139+ (full in 148), Safari 26.2 (partial).

The same mechanism reveals a closed item when the reader uses the browser's find-in-page, which is a real advantage over a scripted accordion whose hidden panels are not searchable at all.

One caveat: the module can deduplicate ids against its **own** items on a page, but it cannot see the ids Hugo mints for Markdown headings. A heading whose text matches an item title produces a duplicate id; give the item an explicit `id` to resolve it.

## Body content on the partial path

From Markdown, an item's body is Markdown and there is nothing to decide. From a layout, the `content` value's **type** decides how it is treated:

- a plain **string** is rendered as Markdown, exactly like a shortcode body;
- a **`template.HTML`** value (what you get from `partial`, `.Content`, `safeHTML`, or any other render) passes through untouched.

The distinction matters because Goldmark's default `markup.goldmark.renderer.unsafe = false` **strips raw HTML** out of anything it renders. Hand over pre-rendered markup as `template.HTML` and it survives; hand it over as a string and it is silently replaced with an omission comment.

## Nesting

An accordion nests inside another accordion's item, but only when the site allows raw HTML through the Markdown renderer:

```toml
# hugo.toml
[markup.goldmark.renderer]
unsafe = true
```

An item's body is rendered with `.Page.RenderString`, which is a second Markdown pass -- that is what makes nested shortcodes, render hooks, and full block Markdown work in a body. At Hugo's default `unsafe = false`, the same pass replaces the inner accordion's markup with an omission comment, and Hugo logs a `Raw HTML omitted` warning naming the page. This is a site-level markup setting; a module cannot override it.

Nesting is supported, not recommended: a nested accordion is hard to navigate with a keyboard or a screen reader, and design-system guidance generally advises against it.

## Styling

The module ships **no CSS whatsoever** -- no stylesheet, no inline `style`, no colors, no transitions, no dark-mode rule. Everything below is for the consuming site to write.

### CSS hooks

| Class | Element | Notes |
| --- | --- | --- |
| `accordion` | container `<div>` | The block. |
| `accordion--exclusive` | container `<div>` | Present only when the items form a `name`d group. |
| `accordion__item` | `<details>` | Style the open state with `details[open]`. |
| `accordion__summary` | `<summary>` | The disclosure control. |
| `accordion__heading` | `<h2>`-`<h6>` | Present only in heading mode. |
| `accordion__title` | `<span>` | Always present, inside the heading when there is one. |
| `accordion__icon` | `<svg>` | Present unless `icon=false`. |
| `accordion__body` | `<div>` | Carries the item's deep-link `id`. |

### The native marker

A browser draws its own disclosure triangle on a `<summary>`. Hide it when you use the module's chevron:

```css
.accordion__summary {
  display: flex; /* also removes the marker in most engines */
  list-style: none; /* removes it in the rest */
}
.accordion__summary::-webkit-details-marker {
  display: none; /* older Safari */
}
```

Prefer the native marker instead? Pass `icon=false` and style `::marker`.

Note the interaction with heading mode: Chrome exposes a heading inside a summary only when the summary is not a `list-item` box, so `display: flex` (or `block`) is required there rather than optional.

### Rotating the icon

```css
.accordion__icon {
  transition: transform 0.2s ease;
}
.accordion__item[open] .accordion__icon {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .accordion__icon {
    transition: none;
  }
}
```

### Animating open and close

Cross-browser open/close animation, using the `::details-content` pseudo-element with discrete-property transitions (Chrome 131+, Firefox 143+, Safari 18.4+):

```css
.accordion__item::details-content {
  block-size: 0;
  overflow: hidden;
  transition:
    block-size 0.25s ease,
    content-visibility 0.25s allow-discrete;
}
.accordion__item[open]::details-content {
  block-size: auto;
}
```

Animating to `auto` needs `interpolate-size: allow-keywords` on a root selector, which is Chromium-only as of this writing -- treat the smooth height as a progressive enhancement and make sure the un-animated result is still correct.

**Do not set `display: none`, `display: contents`, or `display: inline` on the content path.** Doing so breaks find-in-page and the fragment-reveal behavior described above.

### Responsive open state

The `open` attribute is static, so "expanded above 1024px, collapsed below" is site behavior rather than module behavior. Two ways to get it:

```js
// Recommended: toggle the attribute at a breakpoint.
const wide = window.matchMedia('(min-width: 1024px)');
const apply = () => {
  for (const item of document.querySelectorAll('.accordion__item')) item.open = wide.matches;
};
apply();
wide.addEventListener('change', apply);
```

Or CSS-only, forcing the content visible at wide viewports:

```css
@media (min-width: 1024px) {
  .accordion__item::details-content {
    block-size: auto;
    content-visibility: visible;
  }
}
```

The CSS-only form has an accessibility caveat: the summary still reports the item as collapsed to assistive technology while its content is visible. Prefer the script when both must agree.

## Module Structure

```text
shortcodes/accordion/
  go.mod
  layouts/
    _shortcodes/
      accordion.html                 # Container entry: params, group resolution, wraps its items
      accordion.markdown.md          # Markdown output-format variant of the container
      accordion-item.html            # Item entry: title, body, inherited settings, dispatch
      accordion-item.markdown.md     # Markdown output-format variant of the item
    _partials/
      accordion/
        list.html                    # PUBLIC entry: renders a whole accordion from a data slice
        item.html                    # Shared BEM markup for one <details> item
        icon.html                    # The chevron glyph, inline SVG
        lib/
          sc-config.html             # Shared container-settings resolver (container and item both call it)
          bool.html                  # Boolean token parsing
          heading.html               # Heading-level parsing
          id.html                    # Deep-link id minting and collision suffixes
          group-name.html            # Exclusive-group name derivation
          identity.html              # A shortcode's ordinal path, used as its stable identity
          position.html              # The diagnostics position a nested shortcode cannot report itself
          warn.html                  # One deduplicated warning per key, per build
```
