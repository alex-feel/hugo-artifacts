# accordion build-output test suite

Builds a fixture site that imports `shortcodes/accordion` and asserts what the module actually publishes. The module cannot build standalone -- Hugo needs a consuming site -- so the fixture here is that site, wired to the module through `hugo.work` plus a `replace` in `fixture/go.mod`.

## Running it

```bash
# From this directory
bash run-tests.sh          # Linux, macOS, Git Bash
run-tests.cmd              # Windows cmd
```

Both runners check for an already-running hugo process first and refuse to start beside one, build the fixture, gate the logs on errors and deprecations, and then run the Node assertion specs. `npm test` alone re-runs the specs against the retained build output without rebuilding.

## What it covers

| Spec | Subject |
| --- | --- |
| `01-markup-contract.spec.js` | The published shape of every item on every page: the native `<details>`/`<summary>` pair, the BEM classes, the bare `open` attribute, the absence of ARIA and of any role, the icon's inheritable SVG contract, heading mode, inline titles and block bodies, and the complete absence of CSS and script. |
| `02-groups.spec.js` | Exclusive groups: per-container name minting (two containers on one page never share a name), explicit `group` joining separate containers, the modifier class tracking the group, and the author's `open` attributes surviving untouched. |
| `03-ids.spec.js` | Deep-link ids: placement on the body rather than the details or summary element, minting from the title, collision suffixes, author override, `id=""` opt-out, uniqueness across each page, and the documented heading-collision caveat. |
| `04-partial-path.spec.js` | The public `accordion/list.html` partial: markup equivalence with the shortcode path, the string-versus-`template.HTML` content contract, container and per-item options, group-name isolation between the two paths, and the empty-slice degradation. |
| `05-warnings.spec.js` | The degradation contract as an EXACT warning set -- every documented degradation warns exactly once, nothing else warns, and every warning names a position an author can act on. |
| `06-markdown-twin.spec.js` | The `markdown` output format: no HTML leaks, every title and body survives, and the label form (bold line versus ATX heading) mirrors the HTML structure decision. |
| `07-nesting.spec.js` | Indented bodies (`.InnerDeindent`), and the raw-HTML limitation with its documented remedy -- proven in both directions across the two builds. |
| `08-rerender.spec.js` | What survives Hugo executing one page's shortcodes twice: a minted id must resolve the same in both documents, and an open item must be counted once rather than once per render. |

## Why two builds

The runner builds the same fixture twice: once at Hugo's default Markdown settings, and once with `fixture/unsafe.toml` layered on, which turns on `markup.goldmark.renderer.unsafe`.

An item's body is rendered with `.Page.RenderString`, a second pass through Goldmark, so raw HTML inside a body obeys that site-level setting. An accordion nested inside another accordion's item is therefore dropped at the default settings and rendered whole with the setting on. Both are real consumer configurations, and a single build would only ever prove whichever one the fixture happened to choose.

The subpath-baseURL and `canonifyURLs` builds that several sibling suites carry are deliberately **absent** here: this module emits no URL at all. Its only href-shaped output is a fragment id, which is baseURL-independent, so both extra builds would publish byte-identical trees with nothing to assert.

## Why there is no blanket WARN gate

The fixture exercises every tolerated input problem on purpose -- an empty container, a typo'd parameter, an unrecognized boolean token, an invalid heading level, a second open item in one exclusive group. A runner that failed on any WARN line would fail this suite on its own subject matter.

`05-warnings.spec.js` replaces the gate with something stricter: it asserts the EXACT set of warnings the module's documented degradation contract promises. A warning that stops firing fails it just as loudly as an unexpected new one, which a gate could never notice. ERROR and deprecation lines remain hard failures in the runner.

## Fixture layout

```text
test/
  fixture/
    hugo.toml                  # The site: imports the module, publishes home in html + markdown
    unsafe.toml                # Overlay for the second build: raw HTML passes through Goldmark
    go.mod, hugo.work          # Wire the fixture to the module in this working tree
    content/
      _index.md                # Core surface: plain container, heading mode, standalone item
      groups.md                # Exclusive minting, shared explicit group, two open items in one group
      ids.md                   # Minting, collision suffixes, override, opt-out, punctuation-only title
      id-collision.md          # The documented heading-collision caveat, and the id= that resolves it
      nesting.md               # An item inside a Markdown list, and an accordion inside an item
      degrade.md               # Every tolerated input problem
      layout-path.md           # A page whose layout calls the public partial
      rerender.md              # A page in two HTML-family output formats, so its shortcodes run twice
    layouts/
      baseof.html, home.html, page.html
      home.markdown.md         # The Markdown twin, which selects the module's .markdown.md variants
      layout-path.html         # Calls accordion/list.html three ways
  tests/
    helpers.js                 # Byte-level markup readers shared by every spec
    *.spec.js
```
