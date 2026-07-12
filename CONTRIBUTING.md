# Contributing to hugo-artifacts

Thank you for your interest in contributing to **hugo-artifacts** -- a public, MIT-licensed, multi-module Hugo monorepo of reusable leaf modules (themes, shortcode libraries, asset libraries, and utility modules) shared across multiple Hugo sites.

## License Agreement

By contributing to hugo-artifacts, you agree that your contributions will be licensed under the MIT License (see [`LICENSE`](LICENSE)).

## Repository Structure

Every leaf directory in this repo is its own independently importable, independently versionable Hugo module with its own `go.mod`. There is intentionally **no** root `go.mod` -- the repo as a whole is not a Go module; only leaf directories are. Category folders such as `modules/`, `shortcodes/`, and any future `themes/` are organizational containers without their own `go.mod`. The `examples/` directory is also a grouping container, but its children are standalone reference implementations rather than importable Hugo modules.

For the full architectural rules and exemplar modules, see the root [`README.md`](README.md) Repository Structure section and the [`CLAUDE.md`](CLAUDE.md) Architectural rules.

## Prerequisites

- **Hugo v0.160.0+** (extended edition) -- required by every module's `[module.hugoVersion]` floor.
- **Go 1.22+** -- required by every leaf `go.mod`.
- **Node.js v22+** -- needed for `modules/pwa`'s TypeScript service worker (compiled via `js.Build`), the project's ESLint/Prettier setup, and the validation suites under `modules/pwa/test/`, `modules/social-share/test/`, and `modules/search/test/` (all Playwright) plus `modules/images/test/` (Node build-output assertions).

## Development Setup

No module in this repository runs standalone -- Hugo builds require a consuming site. Validate changes against an external Hugo site checkout using one of the two patterns below.

### Option A: `hugo.work` (preferred for multi-module work)

In the consuming site root, create a `hugo.work` file that uses the local checkout of hugo-artifacts:

```text
go 1.22

use .
use ../hugo-artifacts/<module-path>
```

Add `hugo.work` to the consuming site's `.gitignore` -- paths are machine-specific.

### Option B: `[module.replacements]`

In the consuming site's Hugo config:

```toml
[module]
replacements = 'github.com/alex-feel/hugo-artifacts/<module-path> -> ../hugo-artifacts/<module-path>'
```

Either way, confirm resolution with `hugo mod graph` from the consuming site before submitting a change or tagging a release. For the full local-development guidance, see the root [`README.md`](README.md) Local Development section.

## Coding Conventions

### Hugo Version Compatibility

All templates, configuration, and code MUST be compatible with **Hugo v0.160.1+**. Do not use functions, methods, template constructs, configuration keys, or CLI flags that are deprecated at v0.160.1 or earlier. Use the modern replacements (for example, Dart Sass instead of embedded LibSass; `.Meta` instead of `.Exif`; `hugo.Data` instead of `.Site.Data`). When in doubt, validate with `hugo build --logLevel info | grep deprecate` against a consuming site -- zero deprecation warnings is the bar.

### Module Path Equality

Every leaf module's `go.mod` declares a module path that MUST equal its directory path under the repo root, prefixed with `github.com/alex-feel/hugo-artifacts/`. For example, `shortcodes/accordion/go.mod` declares `module github.com/alex-feel/hugo-artifacts/shortcodes/accordion`. Mismatches silently break `hugo mod get` for downstream consumers.

### Hugo Template Directory Conventions

Inside `layouts/`, use the Hugo v0.146+ underscore-prefixed subdirectories: `layouts/_partials/`, `layouts/_shortcodes/`, `layouts/_markup/`, `layouts/baseof.html`, `layouts/home.html`. Do NOT use the legacy pre-v0.146 conventions (`layouts/partials/`, `layouts/shortcodes/`, `layouts/_default/`, `layouts/index.html`). The existing `shortcodes/github-repo/` and `modules/pwa/` modules follow the modern convention -- mirror them when adding new modules.

### Environment Variable Naming

Hugo reads environment variables only when they match `^HUGO_` or `^CI$` (default security policy). Any module that needs an API token MUST document a `HUGO_`-prefixed name (for example, `HUGO_GITHUB_TOKEN`). A bare token name such as `GITHUB_TOKEN` silently returns the empty string and degrades at runtime with no build error.

### Style-Agnostic Output (Shortcode and Component Modules)

These artifacts are built for reuse across any number of unrelated sites, so shortcode and component modules ship **data and semantic markup, never opinionated styles**. Emit semantic [BEM](https://getbem.com/) markup (block = module name, modifiers `<name>--<modifier>`, elements `<name>__<part>`); expose objective values as `data-*` attributes; and, where a value must reach CSS, emit a CSS custom-property _name_ the site defines (for example `style="--callout-tone: var(--callout-tone-danger)"`), never a literal color. Ship **zero CSS** -- no `assets/*.scss`, no `.css`, no inline `<style>`, no hardcoded colors, and no dark-mode rules. Icons are the one shipped visual: render them as inline SVGs using `currentColor` and `1em` sizing so they inherit the consumer's text color and font size. The consuming site owns all presentation. The reference modules under [`shortcodes/`](shortcodes/) follow this contract -- mirror them. For the full rationale and the entry-template idiom, see the shortcode module conventions in [`CLAUDE.md`](CLAUDE.md#shortcode-module-conventions).

## Markdown Style: One Paragraph = One Line

**PROTOCOL VIOLATION if breached.** Markdown files in this repository (`*.md`, `*.markdown`) MUST NOT use hard line wraps INSIDE a paragraph. One paragraph = one physical line. Soft-wrap is the consumer renderer's job. This rule binds every contributor -- human or agent -- when authoring or editing any Markdown file in this repo. Re-introducing artificial wraps in a previously-correct paragraph is also a PROTOCOL VIOLATION.

Constructs that legitimately have line-bound semantics are PRESERVED: code fences (the inside of fenced code blocks), table rows (each row on its own line; intra-row content does not wrap), list items (each bullet on its own line; multi-line list items are allowed when the list itself spans logical sub-points, but a single bullet's body is one line), headings (`#`, `##`, ...), blockquotes (`>` lines), intentional Markdown line breaks via trailing two-space (` ` + ` `, used only where the `.md` semantically requires a `<br>`), and front-matter YAML/TOML.

A paragraph that would otherwise wrap at ~80 columns simply gets a longer line. Editors handle visual wrapping. Reviewers MUST NOT "improve" rendered Markdown by re-introducing hard wraps. The rule binds even when an editor's, linter's, or AI assistant's default suggests 80-column wrapping; THIS REPO'S RULE WINS. This is the project's Markdown authoring convention; see [`CLAUDE.md`](CLAUDE.md#markdown-authoring-convention) for the canonical wording.

## Tagging and Releases

Version tags in this repo are **subdirectory-prefixed**, never bare semver. The format is `<module-path>/vX.Y.Z`:

```bash
git tag modules/pwa/v1.0.0
git push origin modules/pwa/v1.0.0
```

Examples: `shortcodes/github-repo/v1.0.0`, `modules/pwa/v1.0.0`, `themes/starter/v1.0.0`. A bare `v1.0.0` tag is **meaningless** in a multi-module repo and will confuse Go's module resolver. Pseudo-versions (commit-based, of the form `v0.0.0-<UTC-timestamp>-<short-sha>`) are also acceptable for early-stage modules that have not yet been formally tagged -- downstream consumers can pin a pseudo-version directly until you cut a tagged release.

## Creating a New Module

1. Create the leaf directory (flat under a category folder or nested as appropriate):

   ```bash
   mkdir -p <category>/<module-name>
   ```

2. Write `<category>/<module-name>/go.mod` with a matching module path:

   ```text
   module github.com/alex-feel/hugo-artifacts/<category>/<module-name>

   go 1.22
   ```

3. Add only the Hugo component subdirectories the module actually needs (from this set): `layouts/`, `assets/`, `static/`, `data/`, `i18n/`, `archetypes/`, `content/`. Do not create empty directories. A shortcode-only module may need only `layouts/`; an asset library may need only `assets/`.

4. Add a per-module `hugo.toml` ONLY when the module actually needs config (imports, custom mounts, params, `hugoVersion` minimum). Themes typically need one; utility and shortcode modules usually do not.

5. When the module set changes, keep the surfaces that enumerate modules in sync so they do not silently go stale: the root [`README.md`](README.md) Modules and Shortcodes sections, and the `.github/ISSUE_TEMPLATE/` dropdowns (`bug-report.yml` Affected Module, `feature-request.yml` Target Module, `question.yml` Topic Area, and `docs-issue.yml` Affected Documentation for the new module's README). Each issue form carries an inline `# NOTE` at the relevant dropdown as a reminder. Do this in the same change as adding or removing the module -- a stale dropdown ships a module a user cannot select, or lists one that no longer exists.

6. Commit and (when ready) tag with the subdirectory-prefixed pattern from the Tagging and Releases section above.

For worked examples, mirror these existing modules: [`shortcodes/github-repo/`](shortcodes/github-repo/) is a small shortcode-only module (`data/`, partials, API fetching, graceful degradation); [`modules/pwa/`](modules/pwa/) is a complex multi-file module spanning `data/`, `i18n/`, `assets/` (TypeScript service worker compiled via `js.Build`), `layouts/_partials/`, `content/`, and a full consumer parameter surface.

## Pull Request Guidelines

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (for example, `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).
- Keep PRs small and focused -- one feature, one fix, or one cohesive refactor per PR.
- Reference the related issue (for example, `Fixes #123`) in the PR description when applicable.
- Test changes against a real consumer site using `hugo.work` or `[module.replacements]` (see Development Setup above) before submitting.
- Run `hugo build --logLevel info` against your test site and ensure ZERO deprecation warnings appear in the output.
- Ensure your changes pass the project formatting rules enforced by [`.editorconfig`](.editorconfig): LF line endings, UTF-8 encoding, final newline, trim trailing whitespace (exception: `*.md` preserves trailing whitespace for intentional `<br>` breaks; `go.mod` uses tabs at width 4).
- For Markdown files specifically, follow the **one paragraph = one line** rule documented above. Any in-paragraph hard wrap will be rejected in review.

## Reporting Issues

If you find a bug, want to request a feature, spot a documentation issue, or have a question, please use one of the [issue templates](https://github.com/alex-feel/hugo-artifacts/issues/new/choose) -- they prompt you for the information we need to triage and respond efficiently. The chooser is also reachable from the green **New issue** button on the [issues tab](https://github.com/alex-feel/hugo-artifacts/issues).

## Security

Do **NOT** file public issues for security vulnerabilities. Report them privately via the GitHub Security Advisory link in the issue chooser, or directly at [`https://github.com/alex-feel/hugo-artifacts/security/advisories/new`](https://github.com/alex-feel/hugo-artifacts/security/advisories/new). Public-issue disclosure of an unpatched vulnerability puts every downstream consumer at risk; the private advisory path lets us coordinate a fix and a coordinated disclosure timeline.

## Code of Conduct

We expect contributors to behave respectfully and professionally. Be welcoming to newcomers; assume good faith; focus on technical merit; avoid personal attacks. Disagreement is fine and often productive -- disrespect is not.

Behavior that is harassing, discriminatory, or otherwise harmful will not be tolerated in issues, pull requests, comments, or any other project space. This includes (non-exhaustively) personal insults, sexualized language or imagery, deliberate intimidation, doxxing, and sustained disruption of constructive discussion.

If you experience or witness unacceptable behavior, contact the maintainer privately. For a longer reference, see the [Contributor Covenant](https://www.contributor-covenant.org/), which informs the spirit of this section.
