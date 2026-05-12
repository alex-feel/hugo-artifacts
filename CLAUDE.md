# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Public Go **multi-module** monorepo for reusable Hugo artifacts (themes, shortcode libraries, asset libraries, utility modules). Each leaf directory is an independently importable, independently versionable Hugo module.

Consumers are external Hugo sites that import individual modules via their full module path.

## Architectural rules (these are load-bearing — violating them breaks consumers)

1. **Every importable artifact is a leaf directory with its own `go.mod`.** There is intentionally NO root `go.mod` in this repository -- the repo as a whole is not a Go module. Only leaf directories that represent an actual importable unit (e.g., `modules/pwa/go.mod`, `shortcodes/github-repo/go.mod`) are real modules; consumers MUST use the leaf module path, never a bare-root path.
2. **Module path must equal directory path** under the repo root, prefixed with `github.com/alex-feel/hugo-artifacts/`. Example: `shortcodes/accordion/go.mod` → `module github.com/alex-feel/hugo-artifacts/shortcodes/accordion`. Mismatches silently break `hugo mod get`.
3. **Grouping directories have no `go.mod`.** `themes/`, `modules/`, `shortcodes/`, and any other category folder are organizational containers only. `go.mod` lives exclusively in leaf directories that represent an actual importable unit. The `examples/` directory is also a grouping container, but its children are standalone reference implementations rather than importable Hugo modules.
4. **Version tags are subdirectory-prefixed**, never bare semver. `sharing/v1.0.0`, `themes/starter/v1.0.0`, `shortcodes/accordion/v1.0.0`. A bare `v1.0.0` tag is meaningless in a multi-module repo and will confuse Go's module resolver. Pseudo-versions (commit-based) are also acceptable when a module has not yet been formally tagged.
5. **`hugo.toml` is per-module and optional.** Only add one when the module actually needs config (imports, custom mounts, params, `hugoVersion` minimum). Themes typically need one; utility/shortcode modules usually don't.

## Hugo module component layout

A Hugo module may contain any subset of these seven directories; add only what the module needs:

`layouts/` · `assets/` · `static/` · `data/` · `i18n/` · `archetypes/` · `content/`

A shortcode module may only need `layouts/`. An asset library may only need `assets/`. Don't create empty directories.

Inside `layouts/`, use Hugo 0.146+ underscore-prefixed subdirectories: `layouts/_shortcodes/`, `layouts/_partials/`, `layouts/_markup/`. The existing `shortcodes/github-repo` module follows this convention — mirror it for new modules.

Hugo reads environment variables only when they match `^HUGO_` or `^CI$` (default security policy). A module that needs an API token must document the `HUGO_`-prefixed name (e.g., `HUGO_GITHUB_TOKEN`); a bare `GITHUB_TOKEN` silently returns empty string and degrades at runtime with no build error.

## Creating a new module

```bash
# 1. Create leaf directory (flat or nested under a category)
mkdir -p <path>/<module-name>

# 2. Write go.mod with matching module path
#    module github.com/alex-feel/hugo-artifacts/<path>/<module-name>
#    go 1.22

# 3. Add only the component directories the module uses

# 4. Add hugo.toml only if config is needed
```

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

## Non-Go-module upstream replacement convention

When a Hugo module in this repo imports a non-Go-aware repository (one without `go.mod` at its root, declared as `vX.Y.Z+incompatible` in `go.mod`), external consumers attempting `hugo mod get <our-module>` will encounter a download error because Go cannot fetch the upstream repository's metadata over the standard module-fetch path.

The repo's MODULE itself works fine -- the consumer pulls it via `hugo mod get`, but the upstream non-Go dependency cannot be resolved transitively.

Resolution: the consumer adds a `[module.replacements]` line in their `hugo.toml`, OR uses `hugo.work` to point at a local checkout of the non-Go repo (or our wrapper module).

```toml
[module]
replacements = 'github.com/<upstream-org>/<upstream-repo> -> ../<local-or-replacement-path>'
```

This convention currently applies to TWO sibling vendor-mount modules: `modules/workbox` (depending on `github.com/GoogleChrome/workbox` v7.4.1+incompatible) and `modules/idb` (depending on `github.com/jakearchibald/idb` v8.0.3+incompatible). Both wrapper modules exist specifically to vendor-mount their upstream source files for `js.Build` consumption; external consumers using `modules/pwa` (which transitively imports `modules/workbox`, which itself transitively imports `modules/idb` for `workbox-expiration` and `workbox-background-sync`) MUST follow this replacement convention for BOTH upstream repositories. See `modules/pwa/README.md` -> Installation for the consumer-facing instructions, `modules/workbox/README.md` for the workbox vendor-mount mechanics, and `modules/idb/README.md` for the idb vendor-mount mechanics.

Example consumer config showing both replacements:

```toml
[module]
replacements = '''
github.com/alex-feel/hugo-artifacts/modules/workbox -> ../hugo-artifacts/modules/workbox
github.com/alex-feel/hugo-artifacts/modules/idb -> ../hugo-artifacts/modules/idb
'''
```

When authoring a new module that wraps a non-Go upstream, document the replacement requirement prominently in the module README (Installation section) and surface it in the root `README.md` Modules section AND in this convention section to avoid silent build failures for downstream consumers.

## Tagging a release

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

Hugo v0.160.0+ (extended edition), Go 1.22+. When declaring `[module.hugoVersion]` in a module's `hugo.toml`, set `min = "0.160.0"` unless the module genuinely requires a newer feature.
