# Cross-module composition test suite

Node build-output assertions for the surfaces that `modules/seo`, `modules/agent-readiness`, `modules/search`, `modules/pwa` and `modules/og-image` share: the consuming site's single `[outputs]` table, and the generated-image hook that lets one module compose the image another module publishes. This directory is a test suite, not a Hugo module -- it ships no `layouts/`, no `assets/` and no `go.mod` of its own, and nothing imports it. Only [`fixture/`](fixture/) carries a `go.mod`, because a Hugo consumer site needs one.

## Why this suite exists

Each module is proven on its own by its own suite, against a fixture that imports that module alone. No single-module fixture can see what happens when a site imports several of them at once, and that is exactly where the modules interact.

The first shared surface is the output list:

- `[outputFormats]` and `[mediaTypes]` shipped in a module's `hugo.toml` merge ADDITIVELY into the consumer configuration. A site that imports `agent-readiness` and `search` can name `llmstxt`, `llmsindex`, `agentfacts`, `agentskills`, `searchindex` and `opensearch` without defining any of them. `pwa` needs one more name in the same list, `webappmanifest`, and defines no `[outputFormats]` table for it because that format is one of Hugo's own -- so nothing in a module configuration announces it, and only this README and the suite's built-in list carry it. `og-image` defines no output format at all: it composes an image, and an image is not a document Hugo publishes per page kind.
- `[outputs]` does NOT. Hugo replaces the output list per page kind rather than merging it, and a module's own `[outputs]` table never reaches the consumer configuration at all, so every module README has to show an `[outputs]` block of its own.

A consumer who follows two of those READMEs literally lands in one of two states. Two `[outputs]` tables in one file is a hard configuration-load failure (`unmarshal failed: toml: table outputs already exists`), which is loud and self-correcting. One table replacing the other loads cleanly, exits 0, prints no warning -- and silently stops publishing every document the replaced list asked for. The second shape is what this suite catches.

The second shared surface is the generated social card. `[params.seo] image_partial` names a partial that composes an image for a page with no image of its own, and `og-image/card.html` is such a partial; neither module's own suite can show the two halves meeting. The og-image fixture composes cards and reads their pixels but publishes no tag to follow, and the seo fixture proves the hook against a deliberately minimal stand-in partial of its own -- which is what keeps that suite a test of the HOOK rather than of any one supplier, and is why the stand-in stays there instead of being swapped for the real module. So "a real generated card reached `og:image`" exists only here, and it is asserted from the published bytes: the file the tag names is opened, sniffed and decoded, because a URL in a tag says nothing about whether anything is at the other end of it.

## What the one build asserts

| Assertion | What it holds |
| --- | --- |
| every module document is published side by side | `/llms.txt`, `/llms-index.txt`, `/about.md`, `/index.md`, `/searchindex.json`, `/opensearch.xml`, `/robots.txt`, `/manifest.webmanifest` and `/index.html` all exist, non-empty, out of ONE build |
| the merged home list carries every format the modules define | the list is checked against the `[outputFormats.*]` names read out of `modules/agent-readiness/hugo.toml` and `modules/search/hugo.toml`, plus the built-in names a replacing list drops (`html`, `rss`, `markdown`, and `webappmanifest` for `pwa`), so a module that adds a format a consumer must wire fails here until the fixture wires it |
| exactly one `[outputs]` table | the merged single table is the only shape that can hold every module the fixture imports |
| the twins describe the page the index holds | the agent-readiness `llms.txt` / `about.md` entries and the search index record name the same page |
| the seo head surface and the search body markup coexist | the seo module contributes head markup only, so its composition evidence is that its markup renders on the same page through the same `baseof.html` |
| ONE build stamp reaches every dated document | the twins' `build_time`, both link indexes' and `/about.md`'s `> Build time:` line, and the search index's `generated` field are one string, although two different modules write them |
| the search module reaches that stamp by DELEGATION | equality is not enough to prove it -- the fixture builds in under a second while the stamp's precision is one second, so a search module computing its own value would print the same string. A white-box probe reads both modules' `hugo.Store` keys: the search module's own must be EMPTY (it delegated) while agent-readiness's holds the value. Deleting the delegation changes no published byte and fails only here. It is also the one place the repository verifies that `templates.Exists` sees a partial mounted from a MODULE, which the whole soft-dependency design rests on |
| a composed card outranks the site banner | the fixture configures `[params.seo] image_partial` AND a `default_image`, which is the only shape in which the hook's rank is observable: with no default configured a hook ranked below one would still answer, and every "an `og:image` is present" assertion passes either way |
| the card is real, and it is this site's | the URL `og:image` names is opened: it exists, sniffs as a 1200x630 PNG, and its corner pixel equals the corner pixel of the fixture's own committed base raster -- so the card was composed on the backdrop THIS site configured, not on anything the module carries |
| the tag and the pixels describe the same page | of two blog posts whose `og:title` lengths differ, the longer title's card draws the strictly wider first ink band, both from the same left anchor. A generator drawing the wrong page's words, or the same words on every card, satisfies every assertion above and fails this one -- measured as an ink extent, so nothing reads a glyph or depends on a font's metrics |
| a RESOURCE crossed the hook, not a string naming one | `og:image:width`/`height` are 1200/630, `og:image:type` is `image/png`, and the JSON-LD `primaryImageOfPage` carries the same URL with the same dimensions. The seo module fabricates no dimensions for a bare string, so dimensioned structured data exists only because a real image resource came back through the hook |
| a page the generator declines keeps the site banner | `[params.ogcard]` routes the home page and the blog section and nothing else, so `/search/` reaches a generator that has no template for it. Declining is silent by contract, so the published evidence is what the page carries instead: the banner, and no card path in any tag or structured-data node |
| each carded page carries its own card | no two pages in this fixture draw identical text, so every card URL in the tree is distinct -- a generator memoizing across pages would otherwise publish one card everywhere and satisfy every assertion above |
| the build log carries no `WARN`, `ERROR` or deprecation line | every module in the chain degrades by warning rather than failing, so a composition regression surfaces as an exit-0 build with a warning in it. This gate covers og-image at no extra cost, and it is a strong one for that module in particular, whose whole contract is to warn rather than fail |

`agentskills` is wired in the merged home list but publishes no document here: every `[[params.agent.skills]]` entry names a remote source the module fetches at build time, and this suite stays offline. The merged-list assertion still covers the format name, which is the part a replacing `[outputs]` table would drop.

The cards are the one published artifact that is not a document. They land beside their source asset as content-addressed derivatives of `fixture/assets/og/card-base.png`, one per carded page -- the home page, the blog section, and each blog post -- while `/search/` and every taxonomy page publish `/img/site-banner.png` instead. `og-image` therefore adds no name to the merged `[outputs] home` list, and the format assertions in `tests/01-composition.spec.js` and `tests/02-readme.spec.js` are untouched by it: those derive their required set from the `[outputFormats.*]` tables the modules define, and og-image defines none.

## Running

```bash
bash modules/test-composition/run-tests.sh
```

or, on Windows:

```text
modules\test-composition\run-tests.cmd
```

Either script performs the pre-launch hugo process check, builds `fixture/` once into `fixture/public/`, fails on any deprecation or error line in `hugo-build.log`, and then runs the specs against the published tree. The suite has no npm dependencies: `node --test`, `node:assert` and `node:zlib` are enough, so no `npm install` is needed in this directory. `node:zlib` covers the PNG inflate in [`tests/lib/raster.js`](tests/lib/raster.js), the reduced reader the card assertions decode published bytes with; a PNG shape other than the one Hugo emits for a filtered image fails loudly there rather than decoding into something plausible.

The fixture resolves every module through `fixture/hugo.work` plus a `replace` in `fixture/go.mod`, both pointing at the sibling module directories in this repository, so the suite always tests the working tree rather than a published tag. The `require` entries those replaces answer carry the placeholder pseudo-version, which is correct in a fixture and only in a fixture: the version is never fetched, because the `replace` resolves it locally.
