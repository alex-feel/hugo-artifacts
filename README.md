# hugo-artifacts

Private multi-module Hugo monorepo for reusable artifacts: themes, shortcode libraries, utility modules, and other components shared across multiple Hugo sites.

Each artifact lives in its own subdirectory with an independent `go.mod`, making it independently importable and versionable. This follows the [Go multi-module repository](https://go.dev/doc/modules/managing-source) pattern.

## Repository Structure

```text
hugo-artifacts/
  .editorconfig
  .gitignore
  go.mod                        # Root module (convention only, not imported by consumers)
  LICENSE
  README.md

  themes/
    <theme-name>/
      go.mod                    # module github.com/alex-feel/hugo-artifacts/themes/<theme-name>
      hugo.toml                 # Themes typically need config for params, mounts, hugoVersion
      layouts/
      assets/
      static/

  modules/
    <module-name>/
      go.mod                    # module github.com/alex-feel/hugo-artifacts/<module-name>
      layouts/
      assets/

  shortcodes/
    github-repo/
      go.mod                    # module github.com/alex-feel/hugo-artifacts/shortcodes/github-repo
      hugo.toml
      data/
      layouts/
```

Grouping directories (such as `themes/` or any category folder) are organizational containers. They do **not** have their own `go.mod` -- only leaf directories that represent actual importable units do.

## Creating a New Module

### 1. Create the directory and go.mod

```bash
mkdir -p sharing
cd sharing
```

Create `go.mod`:

```go
module github.com/alex-feel/hugo-artifacts/sharing

go 1.22
```

The module path must match the directory path relative to the repository root, prefixed with `github.com/alex-feel/hugo-artifacts/`.

For a nested module (e.g., inside a category directory):

```go
module github.com/alex-feel/hugo-artifacts/shortcodes/accordion

go 1.22
```

### 2. Add component directories

Add only the directories your module needs. Hugo modules can provide any combination of seven component types:

| Directory      | Purpose                              |
|----------------|--------------------------------------|
| `layouts/`     | Templates, partials, shortcodes      |
| `assets/`      | CSS, JS, images (Hugo Pipes)         |
| `static/`      | Files copied verbatim to output      |
| `data/`        | Data files                           |
| `i18n/`        | Translation tables                   |
| `archetypes/`  | Content templates                    |
| `content/`     | Content files                        |

A shortcode module may only need `layouts/`. An asset library may only need `assets/`.

### 3. Add hugo.toml (optional)

A `hugo.toml` is **not required** for every module. Only add one when the module needs its own configuration -- for example, to declare imports, custom mounts, params, or a minimum Hugo version.

Themes typically need `hugo.toml`; utility modules usually do not.

```toml
[module]
  [module.hugoVersion]
    min = "0.160.0"
```

### 4. Commit

```bash
git add sharing/
git commit -m "feat: add sharing module"
```

## Importing Modules in Consuming Sites

### Basic import

In the consuming site's Hugo configuration:

```toml
# hugo.toml or config/_default/module.toml

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/sharing'

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/themes/starter'
```

Then fetch the module:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/sharing
```

### With custom mounts

```toml
[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/sharing'

  [[module.imports.mounts]]
  source = 'layouts'
  target = 'layouts'

  [[module.imports.mounts]]
  source = 'assets'
  target = 'assets'
```

Note: defining custom mounts removes Hugo's default mounts. Re-declare any defaults you still need.

## Local Development

### Module replacements

In the consuming site's development config (`config/development/module.toml` or via `hugo.toml`):

```toml
[module]
replacements = 'github.com/alex-feel/hugo-artifacts/sharing -> ../hugo-artifacts/sharing'
```

This tells Hugo to use the local checkout instead of fetching from the remote.

### Hugo workspace (recommended for multiple modules)

Create a `hugo.work` file at the consuming site root:

```text
go 1.22

use .
use ../hugo-artifacts/sharing
use ../hugo-artifacts/images
```

Then run Hugo as usual. The workspace file resolves modules to local paths automatically.

Add `hugo.work` to the consuming site's `.gitignore` -- it contains machine-specific paths.

### Verify module resolution

```bash
hugo mod graph
```

This shows the dependency tree and confirms modules are resolved correctly.

## Version Tagging

For multi-module repositories, Go requires subdirectory-prefixed version tags:

| Module Path                     | Version | Git Tag                 |
|---------------------------------|---------|-------------------------|
| `hugo-artifacts/sharing`        | v1.0.0  | `sharing/v1.0.0`        |
| `hugo-artifacts/images`         | v2.1.0  | `images/v2.1.0`         |
| `hugo-artifacts/themes/starter` | v1.0.0  | `themes/starter/v1.0.0` |

```bash
git tag sharing/v1.0.0
git push origin sharing/v1.0.0
```

### Alternative: pseudo-versions

For a private monorepo, explicit version tags are optional. Without them, Go uses commit-based pseudo-versions (e.g., `v0.0.0-20260423120000-abc1234def56`). This avoids tagging complexity entirely and is a valid approach for private repositories.

## Private Repository Configuration

Since this repository is private, consuming sites need authentication to fetch modules.

### Option 1: Vendoring (recommended)

The simplest and most reliable approach. Run locally or in CI:

```bash
hugo mod vendor
git add _vendor
git commit -m "vendor: update Hugo modules"
```

With vendored dependencies committed, the build environment (e.g., Cloudflare Pages) does not need access to this private repository at all.

### Option 2: Git credentials + GOPRIVATE

For builds that fetch modules directly, configure authentication:

```bash
git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
export GOPRIVATE='github.com/alex-feel/*'
```

In the consuming site's Hugo config:

```toml
[module]
private = 'github.com/alex-feel/*'
proxy = 'direct'
```

### Option 3: Hugo auth (v0.144.0+)

Hugo's `auth` setting configures `GOAUTH` for private module access:

```toml
[module]
auth = 'https://github.com/alex-feel/*'
private = 'github.com/alex-feel/*'
proxy = 'direct'
```

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+ (extended edition)
- [Go](https://go.dev/) 1.22+
