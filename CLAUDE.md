# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Private Go **multi-module** monorepo for reusable Hugo artifacts (themes, shortcode libraries, asset libraries, utility modules). Each leaf directory is an independently importable, independently versionable Hugo module. Pattern mirrors the public companion repo `hugo-modules`.

Consumers are external Hugo sites that import individual modules via their full module path.

## Architectural rules (these are load-bearing — violating them breaks consumers)

1. **Every leaf module has its own `go.mod`.** The root `go.mod` (`module github.com/alex-feel/hugo-artifacts`) is convention-only and is **not imported by any consumer**.
2. **Module path must equal directory path** under the repo root, prefixed with `github.com/alex-feel/hugo-artifacts/`. Example: `shortcodes/accordion/go.mod` → `module github.com/alex-feel/hugo-artifacts/shortcodes/accordion`. Mismatches silently break `hugo mod get`.
3. **Grouping directories have no `go.mod`.** `themes/`, `shortcodes/`, and any other category folder are organizational containers only. `go.mod` lives exclusively in leaf directories that represent an actual importable unit.
4. **Version tags are subdirectory-prefixed**, never bare semver. `sharing/v1.0.0`, `themes/starter/v1.0.0`, `shortcodes/accordion/v1.0.0`. A bare `v1.0.0` tag is meaningless in a multi-module repo and will confuse Go's module resolver. Pseudo-versions (commit-based) are also acceptable for private use.
5. **`hugo.toml` is per-module and optional.** Only add one when the module actually needs config (imports, custom mounts, params, `hugoVersion` minimum). Themes typically need one; utility/shortcode modules usually don't.

## Hugo module component layout

A Hugo module may contain any subset of these seven directories; add only what the module needs:

`layouts/` · `assets/` · `static/` · `data/` · `i18n/` · `archetypes/` · `content/`

A shortcode module may only need `layouts/`. An asset library may only need `assets/`. Don't create empty directories.

Inside `layouts/`, use Hugo 0.146+ underscore-prefixed subdirectories: `layouts/_shortcodes/`, `layouts/_partials/`, `layouts/_markup/`. The existing `shortcodes/github-repo` module follows this convention — mirror it for new modules. The legacy non-prefixed names still work but are not what this repo uses.

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

For an end-to-end worked example of a module in this repo (shortcode with `data/`, partials, API fetching, graceful degradation), see `shortcodes/github-repo/` and its `README.md`.

## Tagging a release

```bash
git tag <module-path>/vX.Y.Z     # e.g. themes/starter/v1.0.0
git push origin <module-path>/vX.Y.Z
```

## Formatting

`.editorconfig` enforces LF, UTF-8, 2-space indent, final newline, trim trailing whitespace. Exception: `go.mod` uses tabs (width 4). Markdown files preserve trailing whitespace (for intentional line breaks).

## Requirements for any Hugo config authored here

Hugo v0.160.0+ (extended edition), Go 1.22+. When declaring `[module.hugoVersion]` in a module's `hugo.toml`, set `min = "0.160.0"` unless the module genuinely requires a newer feature.

## License

All Rights Reserved (see `LICENSE`). Repository is private; do not add public-repo conveniences (CI for public PRs, public issue templates, etc.) without an explicit request.
