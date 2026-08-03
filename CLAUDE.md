# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Public Go **multi-module** monorepo for reusable Hugo artifacts (themes, shortcode libraries, asset libraries, utility modules). Each leaf directory is an independently importable, independently versionable Hugo module.

Consumers are external Hugo sites that import individual modules via their full module path.

## Architectural rules (these are load-bearing — violating them breaks consumers)

1. **Every importable artifact is a leaf directory with its own `go.mod`.** There is intentionally NO root `go.mod` in this repository -- the repo as a whole is not a Go module. Only leaf directories that represent an actual importable unit (e.g., `modules/pwa/go.mod`, `shortcodes/github-repo/go.mod`) are real modules; consumers MUST use the leaf module path, never a bare-root path.
2. **Module path must equal directory path** under the repo root, prefixed with `github.com/alex-feel/hugo-artifacts/`. Example: `shortcodes/accordion/go.mod` → `module github.com/alex-feel/hugo-artifacts/shortcodes/accordion`. Mismatches silently break `hugo mod get`.
3. **Grouping directories have no `go.mod`.** `themes/`, `modules/`, `shortcodes/`, and any other category folder are organizational containers only. `go.mod` lives exclusively in leaf directories that represent an actual importable unit. The `examples/` directory is also a grouping container, but its children are standalone reference implementations rather than importable Hugo modules. `modules/` additionally holds one non-module child, `modules/test-composition/`: a cross-module verification suite whose fixture imports `modules/seo`, `modules/agent-readiness`, and `modules/search` together under one merged `[outputs]` table; its `fixture/go.mod` (an `example.com/` path) exists only to drive that build and is never importable.
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

Modules that fetch remote data at build time (anything calling `resources.GetRemote`) follow the github-repo resilience contract: wrap the fetch in `try` (never the deprecated remote-resource `.Err` method), classify failures, and degrade gracefully so the build NEVER breaks -- emit exactly one structured `warnf` per failed endpoint (with `.Position`) and fall back to a safe rendering rather than `errorf`. Read any API token via `os.Getenv "HUGO_<X>_TOKEN"` (the `HUGO_` prefix is mandatory under Hugo's default security policy) and deduplicate the missing-token warning once per build with a `hugo.Store` sentinel. A module that fetches nothing at build time omits this machinery entirely, but no shortcode in this repository is currently in that position -- every one of the six fetches, `shortcodes/callout` included, which calls `resources.GetRemote` for a remote icon URL and implements the full contract. Use `.Page.Store` / `hugo.Store` (never the deprecated `.Scratch`) for per-page or build-scoped state.

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

# 5. Keep the module-enumerating surfaces in sync (see note below)
```

When the module set changes -- you add, rename, or remove a module -- update every surface that enumerates modules so it does not silently go stale: the root `README.md` Modules and Shortcodes sections; the `.github/ISSUE_TEMPLATE/` dropdowns (`bug-report.yml` Affected Module, `feature-request.yml` Target Module, `question.yml` Topic Area plus its helpful-resources link list, and `docs-issue.yml` Affected Documentation for the new module's README); `.github/workflows/ci.yml` (the leaf `go.mod` list it verifies, the standalone-module `hugo mod graph` loop, and the `suites` job's matrix, which is what actually RUNS the module's tests); and `CONTRIBUTING.md` Prerequisites (the Node.js bullet enumerating the per-module validation suites). Each of those issue forms carries an inline `# NOTE` at the relevant dropdown as a reminder. Do this in the SAME change that adds or removes the module -- a stale dropdown ships a module a user cannot select, or lists one that no longer exists, a stale leaf list skips the new module's checks, and a suite missing from the matrix never runs at all, which is indistinguishable from a suite that passes.

When a module's own `hugo.toml` gains or loses an entry in its `[outputFormats]` table, a DIFFERENT sweep applies, and it is enforced by a suite in a module the change never touches: `modules/test-composition/tests/01-composition.spec.js` and `tests/02-readme.spec.js` DERIVE the required format set by scanning `[outputFormats.*]` out of `modules/agent-readiness/hugo.toml` and `modules/search/hugo.toml`, then assert every derived name appears in a merged `[outputs] home` list. So update, in the SAME change: the merged `[outputs] home` example in EVERY module README that shows one (`modules/agent-readiness`, `modules/search`, `modules/seo`) and the prose beside it naming which formats are usable; the merged home list in `modules/test-composition/fixture/hugo.toml`; and `modules/test-composition/README.md`, whose format enumeration and published-document table both name them. The composition suite is in the BLOCKING `suites` matrix, so a missed README is a red pull request whose failure surfaces in files the contributor never opened.

A new suite goes in the `suites` matrix when it is deterministic OFFLINE, and in the separate `suites-network` job when it fetches a third-party API at build time. That job is deliberately not part of the blocking set and runs on a schedule instead: a rate limit or an outage on somebody else's service must never block an unrelated pull request. A suite whose runner starts a Hugo server checks for a running one first with `pgrep -x hugo` -- matching the process NAME, the semantic twin of the `tasklist` IMAGENAME filter in the Windows branch. Never `pgrep -f`, which matches the whole command line: this checkout is named `hugo-artifacts`, so a runner invoked by absolute path matches ITSELF and aborts, which is exactly what a CI workspace path produces.

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
