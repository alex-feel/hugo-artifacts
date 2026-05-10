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
      go.mod                    # module github.com/alex-feel/hugo-artifacts/modules/<module-name>
      hugo.toml                 # Optional, depending on the module
      layouts/
      assets/

  shortcodes/
    github-repo/
      go.mod                    # module github.com/alex-feel/hugo-artifacts/shortcodes/github-repo
      hugo.toml
      data/
      layouts/

  examples/
    backend-cloudflare-worker/  # Reference push backends for the PWA module
    backend-express/            # (NOT importable Hugo modules; see Examples below)
    backend-firebase-functions/
```

Grouping directories (such as `themes/`, `modules/`, `shortcodes/`, or any other category folder) are organizational containers. They do **not** have their own `go.mod` -- only leaf directories that represent actual importable units do. The `examples/` directory is also a container; its children are standalone reference implementations, not Hugo modules.

## Modules

This repository ships two paired Hugo modules under `modules/`:

### `modules/pwa`

Consumer-facing Progressive Web App module. Drop a `[params.pwa]` block into your Hugo configuration, include one partial in `baseof.html`, and your site ships a production-grade PWA: web app manifest, RealFaviconGenerator icon set, Workbox-powered service worker, install prompt gated on push intent, push subscription wiring, and a nine-event `window.dispatchEvent` surface for analytics and consumer UI.

See [`modules/pwa/README.md`](modules/pwa/README.md) for full documentation.

```toml
[module]
[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/pwa"

[outputs]
home = ["html", "rss", "webappmanifest"]

[params.pwa.manifest]
name = "My App"
theme_color = "#3367d6"
```

### `modules/workbox`

Vendor-mount companion module that exposes [`github.com/GoogleChrome/workbox`](https://github.com/GoogleChrome/workbox) v7.4.1 source files as Hugo assets, so a consumer's service worker can be compiled at Hugo build time via `js.Build` (esbuild) without any npm toolchain.

Consumers do not import `modules/workbox` directly -- it is a transitive dependency of `modules/pwa`. However, external consumers DO need to handle the upstream replacement explicitly because upstream `github.com/GoogleChrome/workbox` is not a Go module. See [`modules/workbox/README.md`](modules/workbox/README.md) for setup instructions.

### `modules/idb`

Vendor-mount companion module that exposes [`github.com/jakearchibald/idb`](https://github.com/jakearchibald/idb) v8.0.3 source files as Hugo assets. `modules/workbox` transitively imports `idb` because Workbox v7's `workbox-expiration` and `workbox-background-sync` packages call `import {openDB} from 'idb'` at the top of their source files; without a bare-import resolution for `idb`, esbuild fails the service-worker build.

Consumers do not import `modules/idb` directly -- it is a transitive dependency of `modules/workbox`, which is itself a transitive dependency of `modules/pwa`. However, external consumers DO need to handle the upstream replacement explicitly because upstream `github.com/jakearchibald/idb` is not a Go module. See [`modules/idb/README.md`](modules/idb/README.md) and the [Non-Go-module upstream replacement convention](CLAUDE.md#non-go-module-upstream-replacement-convention) section of root `CLAUDE.md` for setup instructions.

### Importing the PWA module

External consumers need both the Hugo import AND replacements for the two non-Go-aware vendor upstreams (Workbox and idb), because neither upstream ships a `go.mod`. The minimum config is:

```toml
[module]
[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/pwa"

# Required: point the non-Go-aware Workbox AND idb upstreams at the local vendor mounts.
replacements = '''
github.com/alex-feel/hugo-artifacts/modules/workbox -> ../hugo-artifacts/modules/workbox
github.com/alex-feel/hugo-artifacts/modules/idb -> ../hugo-artifacts/modules/idb
'''
```

Or, with `hugo.work` (recommended for local development):

```text
go 1.22

use .
use ../hugo-artifacts/modules/pwa
use ../hugo-artifacts/modules/workbox
use ../hugo-artifacts/modules/idb
```

See [`modules/pwa/README.md` Installation](modules/pwa/README.md#installation) for the full options.

## Examples

The `examples/` directory contains standalone reference implementations that pair with `modules/pwa`. They are NOT importable Hugo modules; they are runnable backends meant to be deployed to a separate platform.

### Reference push backends

`modules/pwa` POSTs subscription payloads to a consumer-supplied `subscribe_url` (and optional `unsubscribe_url`). Three reference backend implementations cover the common deployment platforms:

| Platform | Storage | Push send pipeline | Path |
| --- | --- | --- | --- |
| Cloudflare Workers | Workers KV | Native `crypto.subtle` (VAPID JWT) | [`examples/backend-cloudflare-worker/`](examples/backend-cloudflare-worker/) |
| Node Express | Postgres | [`web-push`](https://www.npmjs.com/package/web-push) npm package | [`examples/backend-express/`](examples/backend-express/) |
| Firebase Functions v2 | Firestore | [`web-push`](https://www.npmjs.com/package/web-push) npm package | [`examples/backend-firebase-functions/`](examples/backend-firebase-functions/) |

Each reference exposes the canonical `/subscribe`, `/unsubscribe`, and admin-gated `/trigger` endpoints, validates request origin, and reads the VAPID private key from a platform-appropriate secret store. See each backend's `README.md` for deployment instructions.

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

| Directory     | Purpose                         |
| ------------- | ------------------------------- |
| `layouts/`    | Templates, partials, shortcodes |
| `assets/`     | CSS, JS, images (Hugo Pipes)    |
| `static/`     | Files copied verbatim to output |
| `data/`       | Data files                      |
| `i18n/`       | Translation tables              |
| `archetypes/` | Content templates               |
| `content/`    | Content files                   |

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
| ------------------------------- | ------- | ----------------------- |
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
