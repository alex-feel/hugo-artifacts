# hugo-artifacts

Public multi-module Hugo monorepo for reusable artifacts: themes, shortcode libraries, utility modules, and other components shared across multiple Hugo sites.

Each artifact lives in its own subdirectory with an independent `go.mod`, making it independently importable and versionable.

## Modules

Importable Hugo modules live under [`modules/`](modules/). Each module ships its own `README.md` with installation, configuration, and consumer-side replacement instructions.

### `modules/pwa`

Consumer-facing Progressive Web App module: web app manifest, RealFaviconGenerator icon set, Workbox-powered service worker, install prompt, and push subscription wiring. See [`modules/pwa/README.md`](modules/pwa/README.md).

### `modules/workbox`

Vendor-mount companion that exposes [`github.com/GoogleChrome/workbox`](https://github.com/GoogleChrome/workbox) v7.4.1 source files as Hugo assets for `js.Build`. Imported transitively by `modules/pwa`; consumers do not import it directly, but DO need to set up an upstream replacement -- see [`modules/workbox/README.md`](modules/workbox/README.md).

### `modules/idb`

Vendor-mount companion that exposes [`github.com/jakearchibald/idb`](https://github.com/jakearchibald/idb) v8.0.3 source files as Hugo assets. Imported transitively by `modules/workbox` (and therefore by `modules/pwa`); consumers do not import it directly, but DO need to set up an upstream replacement -- see [`modules/idb/README.md`](modules/idb/README.md).

## Shortcodes

Reusable Hugo shortcode modules live under [`shortcodes/`](shortcodes/). Each shortcode ships its own `README.md` with installation, usage, parameters, and theming guidance.

### `shortcodes/github-repo`

Renders a GitHub repository link in one of five display variants (`inline`, `card`, `stats`, `lang`, `hero`) with API-driven metadata, header-aware retries, and graceful degradation. See [`shortcodes/github-repo/README.md`](shortcodes/github-repo/README.md).

### `shortcodes/hf-space`

Renders a Hugging Face Space link in one of five display variants (`inline`, `card`, `wide`, `stats`, `hero`) with Hub API-driven metadata (emoji, SDK, hardware, likes, live status, gradient colors), header-aware retries, and graceful degradation. The sibling of `shortcodes/github-repo`. See [`shortcodes/hf-space/README.md`](shortcodes/hf-space/README.md).

## Examples

The [`examples/`](examples/) directory contains standalone reference implementations that pair with `modules/pwa`. They are not importable Hugo modules -- they are runnable push-notification backends meant to be deployed to a separate platform. See [`examples/README.md`](examples/README.md) for the catalog and [`examples/QUICKSTART.md`](examples/QUICKSTART.md) for a 5-minute end-to-end walkthrough.

## Requirements

- [Hugo](https://gohugo.io/) v0.160.0+ (extended edition)
- [Go](https://go.dev/) 1.22+

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, coding conventions, the Markdown one-line-per-paragraph rule, tagging and release conventions, and pull request guidelines.
