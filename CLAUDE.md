# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Public Go **multi-module** monorepo for reusable Hugo artifacts (themes, shortcode libraries, asset libraries, utility modules). Each leaf directory is an independently importable, independently versionable Hugo module.

Consumers are external Hugo sites that import individual modules via their full module path.

## Architectural rules (these are load-bearing — violating them breaks consumers)

1. **Every importable artifact is a leaf directory with its own `go.mod`.** There is intentionally NO root `go.mod` in this repository -- the repo as a whole is not a Go module. Only leaf directories that represent an actual importable unit (e.g., `modules/pwa/go.mod`, `shortcodes/github-repo/go.mod`) are real modules; consumers MUST use the leaf module path, never a bare-root path.
2. **Module path must equal directory path** under the repo root, prefixed with `github.com/alex-feel/hugo-artifacts/`. Example: `shortcodes/accordion/go.mod` → `module github.com/alex-feel/hugo-artifacts/shortcodes/accordion`. Mismatches silently break `hugo mod get`.
3. **Grouping directories have no `go.mod`.** `themes/`, `modules/`, `shortcodes/`, and any other category folder are organizational containers only. `go.mod` lives exclusively in leaf directories that represent an actual importable unit. The `examples/` directory is also a grouping container, but its children are standalone reference implementations rather than importable Hugo modules. `shortcodes/` likewise holds one non-module child, `shortcodes/test-smoke/`: the build-output suite for the five shortcode modules that ship none of their own, whose `fixture/go.mod` (an `example.com/` path) exists only to drive that build and is never importable. `modules/` additionally holds one non-module child, `modules/test-composition/`: a cross-module verification suite whose fixture imports `modules/seo`, `modules/agent-readiness`, `modules/search`, `modules/pwa`, `modules/og-image`, `modules/url-retirement`, `modules/images`, `modules/social-share`, `modules/carousel` and `shortcodes/callout` together under one merged `[outputs]` table; its `fixture/go.mod` (an `example.com/` path) exists only to drive that build and is never importable.
4. **Version tags are subdirectory-prefixed**, never bare semver. `sharing/v1.0.0`, `themes/starter/v1.0.0`, `shortcodes/accordion/v1.0.0`. A bare `v1.0.0` tag is meaningless in a multi-module repo and will confuse Go's module resolver. Pseudo-versions (commit-based) are also acceptable when a module has not yet been formally tagged.
5. **`hugo.toml` is per-module and optional.** Only add one when the module actually needs config (imports, custom mounts, params, `hugoVersion` minimum). Themes typically need one; utility/shortcode modules usually don't.

## Hugo module component layout

A Hugo module may contain any subset of these seven directories; add only what the module needs:

`layouts/` · `assets/` · `static/` · `data/` · `i18n/` · `archetypes/` · `content/`

A shortcode module may only need `layouts/`. An asset library may only need `assets/`. Don't create empty directories.

Inside `layouts/`, use Hugo 0.146+ underscore-prefixed subdirectories: `layouts/_shortcodes/`, `layouts/_partials/`, `layouts/_markup/`. The existing `shortcodes/github-repo` module follows this convention — mirror it for new modules.

Hugo reads environment variables only when they match `^HUGO_` or `^CI$` (default security policy). A module that needs an API token must document the `HUGO_`-prefixed name (e.g., `HUGO_GITHUB_TOKEN`); a bare `GITHUB_TOKEN` silently returns empty string and degrades at runtime with no build error.

## Shortcode module conventions

Everything in this repo is universal: a module ships DATA and semantic MARKUP, never specialized styles, so one module drops into any number of unrelated sites and each site styles it however it needs. Shortcode modules therefore emit style-agnostic HTML carrying [BEM](https://getbem.com/) class hooks and ship ZERO CSS -- no `assets/*.scss`, no `.css`, no inline `<style>`, no hardcoded colors, and no dark-mode rule. The consuming site owns all visual presentation (typically a site-side `assets/scss/_<name>.scss`). `shortcodes/github-repo`, `shortcodes/hf-space`, `shortcodes/youtube-embed`, and `shortcodes/callout` are the reference implementations; mirror them when adding a sibling.

Cross the styling boundary by emitting DATA, not styles. The block is the module name (`github-repo`, `youtube-embed`, `callout`), variant and state modifiers are `<name>--<modifier>`, and elements are `<name>__<part>`. Expose objective values as `data-*` attributes (for example `data-callout-type`, `data-video-id`, `data-embed-url`) and, where a value must reach CSS, through an inline `style` carrying either a CSS custom-property NAME indirection (for example `style="--callout-tone: var(--callout-tone-danger)"` -- a name pointing at a token the site defines) or OBJECTIVE MEASURED IMAGE DATA (a sampled dominant color, the image's own downscaled pixels as a data URI -- the images module's `--image-dominant-color` and `--image-placeholder` values), never a design decision such as a chosen literal color. Ship no design decisions.

Icons are the one visual primitive a module ships, and they sit on the styling boundary: render them through a single `layouts/_partials/<name>/icon.html` partial as inline SVGs using `fill="currentColor"` (or `stroke="currentColor"`), `width="1em" height="1em"`, `aria-hidden="true"`, and `focusable="false"`, so they inherit the consumer's text color and font size and stay fully restyleable. Do not pull in external icon fonts.

Entry-template idiom (`layouts/_shortcodes/<name>.html`): open with a `{{/* docstring */}}` documenting parameters and usage (write shortcode examples in the docstring WITHOUT brace-escaping, because the `*/` inside an escaped `{{</* */>}}` example prematurely closes the Go-template comment and fails the parse); extract parameters with `.Get` piped through `| default`; validate with `errorf` carrying `.Name` and `.Position`; assemble a `$ctx` dict that includes `"position" .Position`; then dispatch to namespaced partials under `layouts/_partials/<name>/`. A partial that returns a value uses exactly ONE terminal `return` -- build a single result variable across the branches and return it once, because Hugo does not support multiple `return` statements in a partial. Look up bundled data with `index hugo.Data.<file>` (never the deprecated `.Site.Data`).

Paired (inner-content) shortcodes render `.Inner` with `.Page.RenderString` so nested markdown, shortcodes, and render hooks all run: `{{ .Page.RenderString (dict "display" "block") (.Inner | strings.TrimSpace) }}` -- RenderString takes the markup LAST, and `display=block` keeps block structure. Do not use `transform.Markdownify` for inner block content, and never wrap the rendered body in a bare `<p>`.

Modules that fetch remote data at build time (anything calling `resources.GetRemote`) follow the github-repo resilience contract: wrap the fetch in `try` (never the deprecated remote-resource `.Err` method), classify failures, and degrade gracefully so the build NEVER breaks -- emit exactly one structured `warnf` per failed endpoint (with `.Position`) and fall back to a safe rendering rather than `errorf`. Read any API token via `os.Getenv "HUGO_<X>_TOKEN"` (the `HUGO_` prefix is mandatory under Hugo's default security policy) and deduplicate the missing-token warning once per build with a `hugo.Store` sentinel. A module that fetches nothing at build time omits this machinery entirely, but no shortcode in this repository is currently in that position -- every one of the six fetches, `shortcodes/callout` included, which calls `resources.GetRemote` for a remote icon URL and implements the full contract. Use `.Page.Store` / `hugo.Store` (never the deprecated `.Scratch`) for per-page or build-scoped state, and never read a map back OUT of a store from a template: `Get` returns the live map, so an `index`, `range`, `len` or field access on it runs a Go map read while a page rendering beside this one writes the same map through `SetInMap`, and the runtime aborts the whole build with `fatal error: concurrent map read and map write`. It fires nondeterministically and names no template, so no suite can be relied on to catch it, which is what `npm run check:store-maps` is for. Ask membership of a per-item scalar sentinel key instead. `GetSortedMapValues` is NOT the safe way out: it keeps the map inside the store, which is a different thing from reading it under the lock -- measured in Hugo's source at v0.164.0 and unchanged on main, it takes the read lock, copies out the map header, releases the lock, and only then ranges and indexes the map, so its read races a concurrent `SetInMap` exactly as a template-level read does. Enumerate with it only where no write to that key can be in flight -- in this repository that means a document rendering alone in a pass that runs after every writer -- and say so at the call site with a `no-concurrent-writer:` comment naming the reason, which is what the check requires before it lets the call through. `docs/upstream-issues.md` carries the filed issue and the exact upstream change that retires that discipline, and it is where any other third-party workaround this repository takes on is recorded.

A shortcode module may also ship a markup render hook (for example `layouts/_markup/render-blockquote.html`) when it usefully upgrades a Markdown construct -- the callout module ships one that turns GitHub-style `> [!NOTE]` alerts into the same callout markup while passing ordinary blockquotes through unchanged. Such a hook activates SITE-WIDE for every consumer that imports the module, so it MUST be non-destructive on the unmatched case, and the README MUST document the activation and that a site-level template overrides it.

Each shortcode module carries a `README.md` in this order: an intro stating it emits style-agnostic BEM markup and delegates styling; Installation (a `[[module.imports]]` block, `hugo mod get`, and a note that a local `layouts/_shortcodes/<name>.html` overrides the module); Requirements (Hugo v0.160.0+, any edition, Go 1.22+); Usage; Parameters with Validation notes; the module's feature sections; a Styling section documenting CSS hooks, CSS custom properties, data attributes, and Icons; and a Module Structure tree.

Because a module cannot build standalone, validate every change against a consuming site (see "Verifying a module locally") -- a real `hugo` build catches template errors, deprecated-API usage, and graceful-degradation gaps that reading the templates does not.

## Creating a new module

```bash
# 1. Create leaf directory (flat or nested under a category)
mkdir -p <path>/<module-name>

# 2. Write go.mod with matching module path
#    module github.com/alex-feel/hugo-artifacts/<path>/<module-name>
#    go 1.22

# 3. Add only the component directories the module uses

# 4. Add hugo.toml only if config is needed

# 5. Write the module's test suite -- a module ships with one, always
#    (see "Every module that ships templates ships a suite" below)

# 6. Keep the module-enumerating surfaces in sync (see note below)
```

### Every module that ships templates ships a suite

A module that ships a `layouts/` tree does NOT land without a suite that builds it. This is a condition of adding the module, not a follow-up: an untested template is one nothing in this repository renders, so a parse error, a wrong function, or a silently wrong rendering reaches consumers with every check green. The rule below about keeping the `suites` matrix in sync guards a suite's REGISTRATION; this one guards its EXISTENCE, and the two are not the same gap. Five shortcode modules once shipped without suites precisely because only the first rule was written down.

The two modules with no suite are the ones with nothing to test: `modules/idb` and `modules/workbox` carry a `go.mod`, a `hugo.toml` and a README and nothing else -- they are vendor-mount declarations with no template of their own, and `modules/pwa`'s suite builds a service worker through those mounts, which is the only thing about them that can break.

A dedicated per-module suite is the norm. Where several small modules share one shape -- as the shortcode modules do -- one suite covering them together is acceptable and is what `shortcodes/test-smoke/` does, provided every module is actually invoked and asserted there.

### A module that emits a URL ships a subpath build AND a canonifyURLs build

Every module whose templates emit a URL builds its fixture twice more, and the two builds catch different mistakes that are both INVISIBLE everywhere else. Under a domain-root `baseURL` -- what a fixture uses unless told otherwise -- a URL that carries the baseURL path and one that dropped it are byte-identical, so the first extra build gives the `baseURL` a PATH. Under `canonifyURLs` Hugo rewrites root-relative URLs in HTML output into absolute ones after the templates have run and, to stop that rewrite from doubling the path, makes the whole Page family stop emitting it: measured at v0.164.0 under `baseURL = 'https://example.org/docs/'`, a page's `.RelPermalink` returns `/` rather than `/docs/` and an output format's returns `/llms.txt` rather than `/docs/llms.txt`, while a RESOURCE's keeps the path and `.Permalink` and `absURL` are untouched. So the second extra build layers `canonifyURLs` onto the first.

What only the canonify build can see is a derivation routed through the `relURL` family: correct at every other baseURL and with the setting off, wrong here, and REPAIRED in HTML so that only the surfaces Hugo never post-processes carry the damage. Measured at v0.164.0, the rewrite reaches attributes ending in `href`, `src`, `srcset`, `action` and `url`, and nothing else -- not a `<meta content="...">`, not a `<script type="application/ld+json">` body, and not any non-HTML output format. That is where these modules put most of their URLs, which is why `modules/search` published a whole search index of 404s under this combination until the build existed to say so.

Chain the second onto the first rather than restating it: `--config ../canonify.toml` merges over a `config/<env>/` environment and keeps its `baseURL` (verified), and a comma-separated `--config` chain does the same for the overlay-file suites. A `config/canonify/` directory would copy the environment's whole config for the sake of one line, and the copy is free to drift.

Give the build a SUBJECT before asserting anything. A module built on `.Permalink` and `absURL` publishes identical bytes either way -- which is the property being locked -- so an assertion that the setting is in force needs something that MOVES, or it passes just as well against two ordinary builds. Take it from the fixture rather than the module: a fixture's own root-relative links, or a value the fixture writes out of a page's `.RelPermalink`, both move under the setting exactly as much as the module's URLs must not. Beware one Hugo behavior when choosing it -- the post-processor consumes a leading segment matching the baseURL path and cannot tell it from a content path that begins the same way, so in a fixture with a section named after the baseURL's last segment the page links come out one segment short; `docs/upstream-issues.md` records it.

When the module set changes -- you add, rename, or remove a module -- update every surface that enumerates modules so it does not silently go stale: the root `README.md` Modules and Shortcodes sections; the `.github/ISSUE_TEMPLATE/` dropdowns (`bug-report.yml` Affected Module, `feature-request.yml` Target Module, `question.yml` Topic Area plus its helpful-resources link list, and `docs-issue.yml` Affected Documentation for the new module's README); `.github/workflows/ci.yml` (the leaf `go.mod` list it verifies, the standalone-module `hugo mod graph` loop, and the `suites` job's matrix, which is what actually RUNS the module's tests -- and if the new module joins an existing shared suite rather than getting its own, that suite's fixture must actually invoke it); and `CONTRIBUTING.md` Prerequisites (the Node.js bullet enumerating the per-module validation suites). Each of those issue forms carries an inline `# NOTE` at the relevant dropdown as a reminder. Do this in the SAME change that adds or removes the module -- a stale dropdown ships a module a user cannot select, or lists one that no longer exists, a stale leaf list skips the new module's checks, and a suite missing from the matrix never runs at all, which is indistinguishable from a suite that passes.

When a module's own `hugo.toml` gains or loses an entry in its `[outputFormats]` table, a DIFFERENT sweep applies, and it is enforced by a suite in a module the change never touches: `modules/test-composition/tests/01-composition.spec.js` and `tests/02-readme.spec.js` DERIVE the required format set by scanning `[outputFormats.*]` out of `modules/agent-readiness/hugo.toml`, `modules/search/hugo.toml` and `modules/url-retirement/hugo.toml`, then assert every derived name appears in a merged `[outputs] home` list. So update, in the SAME change: the merged `[outputs] home` example in EVERY module README that shows one (`modules/agent-readiness`, `modules/search`, `modules/seo`) and the prose beside it naming which formats are usable; the merged home list in `modules/test-composition/fixture/hugo.toml`; and `modules/test-composition/README.md`, whose format enumeration and published-document table both name them. The composition suite is in the BLOCKING `suites` matrix, so a missed README is a red pull request whose failure surfaces in files the contributor never opened.

EVERY suite goes in the blocking `suites` matrix, including one that fetches a third-party API at build time. A module changes exactly once -- in a pull request -- so that is the only moment its templates can break and the only moment worth testing them; a suite held out of the blocking set re-tests unchanged code on a timer while leaving the one change that matters unguarded. A suite that fetches gets `HUGO_GITHUB_TOKEN` from the workflow token to raise the rate limit, and the module's own graceful-degradation contract carries the rest: a tokenless or rate-limited fetch degrades to WARN lines the runner's log gates tolerate deliberately, so a third-party hiccup surfaces as a degraded build rather than a broken one. A suite whose runner starts a Hugo server checks for a running one first with `pgrep -x hugo` -- matching the process NAME, the semantic twin of the `tasklist` IMAGENAME filter in the Windows branch. Never `pgrep -f`, which matches the whole command line: this checkout is named `hugo-artifacts`, so a runner invoked by absolute path matches ITSELF and aborts, which is exactly what a CI workspace path produces.

## Verifying a module locally

A module in this repo cannot be run standalone — Hugo builds require a consuming site. Validate changes against an external site checkout using one of these mechanisms:

**Option A — `hugo.work` (preferred for multi-module work).** In the consuming site root:

```text
go 1.22

use .
use ../hugo-artifacts/<module-path>
```

Add `hugo.work` to the consuming site's `.gitignore` — paths are machine-specific.

**Option B — `module.replacements`.** In the consuming site's Hugo config:

```toml
[module]
replacements = 'github.com/alex-feel/hugo-artifacts/<module-path> -> ../hugo-artifacts/<module-path>'
```

Either way, confirm resolution with `hugo mod graph` from the consuming site before tagging a release.

For an end-to-end worked example of a module in this repo (shortcode with `data/`, partials, API fetching, graceful degradation), see `shortcodes/github-repo/` and its `README.md`. For a complex multi-file module that spans `data/`, `i18n/`, `assets/` (TypeScript service worker compiled via `js.Build`), `layouts/_partials/`, `content/`, and a full consumer parameter surface, see `modules/pwa/` and its `README.md`. The companion `modules/workbox/` module demonstrates the vendor-mount pattern for non-Go-aware upstream JavaScript dependencies.

## Optional sibling dependencies (template-level, no `go.mod` edge)

A module may READ a sibling module's public partial without requiring it, and `modules/search` is the reference case: its `/searchindex.json` stamp resolves through `templates.Exists "_partials/agent-readiness/build-time.html"` and delegates to that partial when a site imports both, falling back to its own implementation when it does not. Note the `_partials/` prefix -- `templates.Exists` takes a path under `layouts/`, and the pre-v0.146 `partials/` spelling silently returns false, which degrades to the fallback with no error and no warning. It DOES see a partial mounted from a module, which the composition suite verifies rather than assumes.

A `go.mod` require would be the wrong tool here and the reason generalizes: importing a Hugo module mounts its whole `layouts/` tree, so a search-only site would silently start serving `agent-readiness`'s generated `layouts/robots.txt`. A soft template-level probe buys the shared behavior where both modules are present and costs a single-module consumer nothing. Sharing a `hugo.Store` key between two modules is NOT an alternative: two modules writing one key are two concurrent first callers over a check-then-set that is not atomic, which is the same race the stamp's own machinery exists to avoid, at lower odds and therefore harder to diagnose. Delegate to one owner instead.

The same pattern also runs the other way, and `url-retirement`'s publication hook is the reference case: a module that OWNS an output format whose template renders nothing for some pages ships `layouts/_partials/url-retirement/publishes/<format-name>.html`, returning whether a given page publishes a document in that format, and `url-retirement`'s manifest resolves it through `templates.Exists` exactly as above. The direction is inverted -- the answering module places a file under the ASKING module's partial namespace -- because the question is keyed by format name and only the format's owner can answer it; `modules/agent-readiness` answers for `markdown`, `llmstxt`, `llmsindex`, `agentfacts` and `agentskills`, and `modules/search` for `searchindex` and `opensearch`. A format nobody answers for is listed as wired, so the hook can only ever REMOVE lines a build did not write, which is what keeps a missing answer a visible false alarm rather than a silently missing URL. Every such answer DELEGATES to whatever its own producer consults rather than restating that producer's conditions, because a restated gate drifts and a drifted one deletes live URLs from a registry a coverage check trusts.

A third instance runs in the ordinary direction and is what a module publishing a page-less URL owes: `url-retirement` ships the PUBLIC `layouts/_partials/url-retirement/register-url.html`, and a module that publishes a URL no walk of `.Site.Pages` can reach -- an asset-pipeline Resource, a page carrying `build.list = never`, an image resolved out of the consuming site's own bundle -- calls it behind the same `templates.Exists` guard so its URL reaches `/url-manifest.txt`. `modules/pwa` is the reference case, registering `/sw.js` and its offline page; `modules/seo`, `modules/images`, `modules/social-share`, `modules/carousel` and `shortcodes/callout` each register at the line where they read a resource's URL. Register only what the build really WROTE: registration is the one arrival path that can ADD a line no file backs. Ordering binds it -- `/url-manifest.txt` renders at `weight = 100`, so anything recorded from a zero-weight format's own pass arrives too late and is refused with a warning naming the URL -- but a URL already recorded in time is silently accepted again, so a resolver reached from BOTH the html pass and a Markdown twin's costs nothing. Pass `.resource` rather than a URL wherever you have the Resource: the module then applies the content-addressed rule itself, registering only a resource published under its own source name, because a fingerprinted name changes with its own contents and would report a retirement on every rebuild.

A FOURTH instance inverts the third the way the second inverts the first, and the choice between them is one question: can the module guarantee which pass reaches it? Where a file is published by whichever caller first reaches a shared `partialCached` resolution, it cannot -- which caller wins is a property of the CONSUMING SITE's configuration, so the same registration lands on one site and is refused on another (measured at v0.164.0 on `agent-readiness`'s Agent Skills artifacts: in time on every build at default settings, refused on every build under `manifest.output_formats = false`, because that flag decides whether the publication hook runs early). So the manifest ASKS instead, during its own pass, through `layouts/_partials/url-retirement/writes/<format-name>.html`, which the format's owner ships beside its `publishes/` hook of the same name and which returns a SLICE of server-relative URLs. It is asked only where `publishes/` answered true, because one resolution decides both; a non-slice answer is refused by type with one warning, and each element is held to the same shape rule an `extra` entry is, so one malformed URL is refused alone. `modules/agent-readiness` answers for `agentskills`.

Such a dependency is invisible to every single-module suite -- each fixture imports its own module alone -- so it is proven in `modules/test-composition/`, with a white-box probe of both modules' store keys, for the publication and side-file hooks with a white-box check that the hook files live in the OWNING modules while the fixture ships none, and for the registrations with a white-box check that the `register-url.html` calls live in the owning modules' own templates while no template in the fixture makes one. Equality of the published values is NOT sufficient evidence there: those fixtures build in under a second while a stamp's precision is one second, so two independently computed values print the same string.

That suite builds its fixture THREE times, and the second and third exist for the side-file hook alone. A skill entry names a REMOTE source with no local form, so the artifacts exist only in a build that fetches; `serve-origin.mjs` answers on 127.0.0.1 out of the committed `fixture-origin/`, which keeps the suite off anybody else's endpoint at the price of a `security.http.urls` allow-list those builds carry and the base build does not. The third build repeats the second with `manifest.output_formats = false`, and its one assertion is the load-bearing one: the artifacts are listed there too, which every push design fails and the pull passes. The fixture also configures TWO skills rather than one, because with a single artifact an answer that named a constant URL would satisfy every assertion about it.

## Consuming modules that wrap non-Go upstreams

Some modules in this repo wrap a non-Go-aware upstream (a JavaScript repo with no `go.mod` at its root, declared in the wrapper's `go.mod` as `vX.Y.Z+incompatible`) and split into sibling wrapper modules that require EACH OTHER. The `pwa` chain is the first such case: `modules/pwa` requires `modules/workbox`, which requires `modules/idb`; `modules/workbox` wraps `github.com/GoogleChrome/workbox` v7.4.1+incompatible and `modules/idb` wraps `github.com/jakearchibald/idb` v8.0.3+incompatible (the latter is needed by `workbox-expiration` and `workbox-background-sync`).

EVERY edge of such a chain MUST name a real, fetchable version. The `+incompatible` upstreams are fetchable by `hugo mod get` over the standard Go module proxy -- `+incompatible` is exactly Go's convention for a tagged repository that lacks a root `go.mod`, and a plain `go mod download github.com/GoogleChrome/workbox@v7.4.1+incompatible` succeeds against proxy.golang.org with no local checkout, replacement, or vendoring (verified). Each INTRA-REPOSITORY require names a commit pseudo-version of this repository, the same form a consumer pins, which proxy.golang.org serves for a subdirectory module exactly as it serves any third-party dependency (verified). A consumer therefore imports ONLY the top module and Go resolves the rest transitively:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/pwa
hugo mod tidy
```

NEVER ship the PLACEHOLDER pseudo-version `v0.0.0-00010101000000-000000000000` in a module's `go.mod`. It is the sentinel Go writes for a module resolved through a workspace or a `replace`, it can never be fetched, and a published module carrying one cannot be imported on its own: the build dies with `invalid version: unknown revision 000000000000` for the unresolved sibling, and the only remedy available to the consumer is to add that sibling as a direct `require` of its own. That compensating block is load-bearing, is indistinguishable from an ordinary require list, and nothing in Go tooling protects it -- any `go mod` invocation, merge resolution, or cleanup script that rewrites `go.mod` silently destroys the module graph. A test fixture is the ONE place the placeholder is correct, because every fixture pairs it with a `replace` pointing at the local directory, so the version is never fetched.

Because a commit cannot name its own hash, a sibling pin is always moved by a FOLLOW-UP commit, and a chain is edited in DEPENDENCY ORDER: commit the change to `modules/idb`, then run `npm run check:pins -- --fix` and commit the rewritten `modules/workbox` require, then do the same for `modules/pwa`. `npm run check:pins` -- part of `npm run check`, and a CI step -- fails when an intra-repository require is the placeholder or lags behind its sibling's latest commit, so a forgotten bump becomes a red pull request instead of consumers silently resolving stale content.

A pull request that moves a pin MUST be merged in a way that PRESERVES its individual commits (a merge commit, or a rebase), never SQUASHED. A pin names a commit, and squashing replaces the named commit with a new one; the module proxy can then fail to resolve a version that resolved a moment earlier, for consumers only, with nothing in the repository looking wrong. `npm run check:pins` does catch the aftermath on `main` -- the pin now lags the squash commit -- so if it ever happens, re-point the pin at the squash commit and push.

`[module.replacements]` and `hugo.work` remain useful for LOCAL development against a local checkout, and `hugo mod vendor` (committed `_vendor/`) is a valid choice when a consumer wants a fully hermetic, network-free CI build -- but none of the three is REQUIRED to consume the chain.

When authoring a new module that wraps a non-Go upstream, document this consumption recipe in the module README (Installation section) and surface it in the root `README.md` Modules section AND in this section.

## Tagging a release

The repository carries NO tags, deliberately. Every module -- including each edge of the `pwa` chain -- is consumed at a commit pseudo-version, which resolves transitively and needs no release process. Should a module ever warrant a released version, the tag is subdirectory-prefixed and the sibling requires of any chain it belongs to are bumped in dependency order alongside it:

```bash
git tag <module-path>/vX.Y.Z     # e.g. themes/starter/v1.0.0
git push origin <module-path>/vX.Y.Z
```

## Formatting

`.editorconfig` enforces LF, UTF-8, 2-space indent, final newline, trim trailing whitespace. Exception: `go.mod` uses tabs (width 4). Markdown files preserve trailing whitespace (for intentional line breaks).

## Markdown authoring convention

**PROTOCOL VIOLATION if breached.** Markdown files in this repository (`*.md`, `*.markdown`) MUST NOT use hard line wraps INSIDE a paragraph. One paragraph = one line. Soft-wrap is the consumer renderer's job. This rule applies to every agent (developer, doc-writer, implementation-guide, validator, oversight, ANY OTHER) when AUTHORING or EDITING any Markdown file in this repo. Re-introducing artificial wraps in a previously-correct paragraph is also a PROTOCOL VIOLATION.

Constructs that legitimately have line-bound semantics are PRESERVED:

- Code fences (the inside of `...` blocks)
- Table rows (each row stays on its own line; intra-row content does not wrap)
- List items (each bullet on its own line; multi-line list items are allowed when the list itself spans logical sub-points, but a SINGLE bullet's body is one line)
- Headings (`#`, `##`, ...)
- Blockquotes (`>` lines)
- Intentional Markdown line breaks via trailing two-space (` ` + ` `) -- preserved only where the `.md` semantically requires a `<br>` (rare; typically only in poetry/address blocks, not in technical docs)
- Front-matter YAML/TOML (line-bound by definition)

A paragraph that would otherwise wrap at ~80 columns simply gets a longer line. Editors handle visual wrapping. Reviewers MUST NOT "improve" rendered Markdown by re-introducing hard wraps. The rule binds even when the agent's training data or past conventions suggest 80-column wrapping; THIS REPO'S RULE WINS. Validators and oversight agents MUST detect violations and reject the work as FAIL.

If you are an agent reading this file: before writing any Markdown content, RE-READ this section. If you have JUST WRITTEN multi-line paragraphs, STOP, REPLACE them with single-line paragraphs, and only then proceed. The user has explicitly directed every agent in this repository to follow this rule with no exceptions.

## Requirements for any Hugo config authored here

Hugo v0.160.0+ (any edition -- the only extended-edition-exclusive feature is the deprecated embedded LibSass, which nothing here may use), Go 1.22+. When declaring `[module.hugoVersion]` in a module's `hugo.toml`, set `min = "0.160.0"` unless the module genuinely requires a newer feature.

A deprecation is not always something a build can tell you about, and the difference decides which gate protects you. `.LanguageCode`, `.LanguageDirection` and `.LanguageName` are deprecated in Hugo's code: each logs a WARN and will one day fail the build, so a suite's own log gate catches them. `.Language.Lang` is retired in the documentation only -- use `.Language.Name` -- and Hugo's binary says nothing at any log level, which is why a template using it survived every green check here until `npm run check:hugo-api` was written to look for it. That check reads every tracked template with Go-template comments blanked, so a docstring may still NAME a retired spelling in order to forbid it; a template ACTION may not use one. Its companion `.Weight` carries the same documentation tag with no replacement documented, so it stays as it is and the check leaves it alone.
