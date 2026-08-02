# modules/workbox

Vendor-mount companion Hugo module that exposes [`github.com/GoogleChrome/workbox`](https://github.com/GoogleChrome/workbox) v7.4.1 source files to consuming sites as Hugo assets, so a consumer's service worker can be compiled at Hugo build time via `js.Build` (esbuild) without any npm toolchain.

This module is the sibling of [`modules/pwa`](../pwa/README.md), the consumer-facing PWA module. Consumers do **not** import or require `modules/workbox` directly -- it is a transitive dependency of `modules/pwa`, which records it at a real commit pseudo-version, so one `hugo mod get` of `modules/pwa` resolves it; see [`modules/pwa` README -> Installation](../pwa/README.md#installation). The upstream `github.com/GoogleChrome/workbox` is fetched normally as a `+incompatible` Go module -- no local replacement or vendoring is required.

## Status

v1.0 -- production-ready. Hugo 0.160.0+ (any edition), Go 1.22+. Pinned to upstream Workbox v7.4.1 (commit [`62b9d8ba8eb3c1a2ab8aac9d84c90cda7865d6a3`](https://github.com/GoogleChrome/workbox/tree/v7.4.1)).

Companion module to `modules/pwa`. Consumers depend on `modules/pwa`, which transitively imports `modules/workbox`. The vendored upstream Workbox sources are Apache-2.0 licensed; see [Workbox's LICENSE](https://github.com/GoogleChrome/workbox/blob/main/LICENSE).

## How it works

`modules/workbox/hugo.toml` declares `[[module.imports]]` of `github.com/GoogleChrome/workbox` and 16 `[[module.imports.mounts]]` entries that map upstream source paths into the Hugo unified file system under `assets/`:

| Upstream path                              | Hugo target path                     |
| ------------------------------------------ | ------------------------------------ |
| `packages/workbox-background-sync/src/`    | `assets/workbox-background-sync/`    |
| `packages/workbox-broadcast-update/src/`   | `assets/workbox-broadcast-update/`   |
| `packages/workbox-build/src/`              | `assets/workbox-build/`              |
| `packages/workbox-cacheable-response/src/` | `assets/workbox-cacheable-response/` |
| `packages/workbox-core/src/`               | `assets/workbox-core/`               |
| `packages/workbox-expiration/src/`         | `assets/workbox-expiration/`         |
| `packages/workbox-google-analytics/src/`   | `assets/workbox-google-analytics/`   |
| `packages/workbox-navigation-preload/src/` | `assets/workbox-navigation-preload/` |
| `packages/workbox-precaching/src/`         | `assets/workbox-precaching/`         |
| `packages/workbox-range-requests/src/`     | `assets/workbox-range-requests/`     |
| `packages/workbox-recipes/src/`            | `assets/workbox-recipes/`            |
| `packages/workbox-routing/src/`            | `assets/workbox-routing/`            |
| `packages/workbox-strategies/src/`         | `assets/workbox-strategies/`         |
| `packages/workbox-streams/src/`            | `assets/workbox-streams/`            |
| `packages/workbox-sw/`                     | `assets/workbox-sw/`                 |
| `packages/workbox-window/src/`             | `assets/workbox-window/`             |

After this module is imported, a consumer's service-worker source can use bare module specifiers:

```typescript
import {precacheAndRoute, cleanupOutdatedCaches} from 'workbox-precaching';
import {NetworkFirst, CacheFirst, StaleWhileRevalidate} from 'workbox-strategies';
import {registerRoute, setCatchHandler} from 'workbox-routing';
import {ExpirationPlugin} from 'workbox-expiration';
```

Hugo's built-in `js.Build` (esbuild) resolves these against the `assets/workbox-*/` mount targets at build time and produces a single bundled service worker without any consumer-side `npm install`.

The `workbox-sw` package is a special case: it ships pre-bundled `.mjs` files (no `src/` subdirectory upstream), so the mount targets the entire package directory rather than a `src/` subpath.

The `workbox-build` package is mounted for completeness with the canonical `hugomods/workbox` layout, but it is a Node-build-side tool and **must not** be imported from service-worker source -- it depends on Node-only APIs that esbuild cannot bundle for the service-worker runtime.

## Why vendor-mount instead of npm?

`hugo-artifacts` is an npm-free monorepo; consumer Hugo sites should not need a Node toolchain to build. The vendor-mount pattern (proved in production by [`hugomods/workbox`](https://github.com/hugomods/workbox)) achieves three things:

1. **Single-stage build:** consumer runs `hugo --gc --minify`; no `npm install`, no `workbox-build`, no separate post-build step.
2. **Native TypeScript:** Hugo's `js.Build` (esbuild) compiles `.ts` directly since Hugo 0.74.0; no `tsc` toolchain.
3. **Native bare imports:** esbuild resolves `from 'workbox-precaching'` against the mounted `assets/workbox-precaching/` directory automatically; no path-mapping configuration.

## Version pinning

Workbox version is pinned in `go.mod`:

```text
require github.com/GoogleChrome/workbox v7.4.1+incompatible
```

The `+incompatible` suffix is required because `github.com/GoogleChrome/workbox` is a JavaScript monorepo without a `go.mod` at its root. Go's module system uses this convention for tagged-but-not-Go-aware repositories. The exact tag `v7.4.1` resolves to upstream commit `62b9d8ba8eb3c1a2ab8aac9d84c90cda7865d6a3` (verified via `git ls-remote --tags`).

Hugo's `[[module.imports]] path = "github.com/GoogleChrome/workbox"` defers version resolution to `go.mod` -- there is intentionally no `version` field in `hugo.toml`.

If a future hotfix is required against an untagged commit, the equivalent Go pseudo-version syntax is `vX.0.0-<UTC-tagger-date-YYYYMMDDHHMMSS>-<12-char-commit-prefix>`. Tagged `+incompatible` pinning is the canonical path for the UPSTREAM requirement.

### The sibling pin

`go.mod` also requires `github.com/alex-feel/hugo-artifacts/modules/idb` at a real commit pseudo-version of this repository:

```text
require github.com/alex-feel/hugo-artifacts/modules/idb v0.0.0-20260802210047-4f8fca370e07
```

That is what lets a consumer resolve the whole chain from one `hugo mod get`. It is deliberately NOT the placeholder `v0.0.0-00010101000000-000000000000`: a placeholder is the sentinel Go writes for a module resolved through a workspace or a `replace`, it can never be fetched, and shipping one in a published module's `go.mod` forces every consuming site to carry a compensating direct `require` that no tooling protects. Test fixtures in this repository do use the placeholder, correctly -- each one pairs it with a `replace` pointing at the local directory, so it is never fetched.

Because a commit cannot name its own hash, moving this pin is always a FOLLOW-UP commit: change `modules/idb/`, commit it, then run `npm run check:pins -- --fix` from the repository root and commit the rewritten `require`. `npm run check:pins` fails when the pin lags behind the sibling's latest commit, so CI catches a forgotten bump on the pull request.

### Why v7.4.1?

- Workbox v7.4.1 is the latest tagged release at the time `modules/pwa` was authored.
- v7.x is the actively-maintained Workbox line; v6.x is in security-only mode.
- The `packages/workbox-*/src/` layout is stable across the v6 -> v7 transition (the only rename was internal package version metadata), so the mount table requires no changes to upgrade within v7.

## Layout-stability assumption

This module depends on the upstream `packages/workbox-*/src/` layout staying intact. The layout has been stable since Workbox v6.0 (October 2020) and is preserved at v7.4.1 (verified via direct upstream inspection). If the upstream restructures source directories in a future major version (v8.x), this module's `hugo.toml` mount table will need adjustment.

## Companion modules

`modules/workbox` is a sibling of [`modules/idb`](../idb/README.md), another vendor-mount module that exposes [`github.com/jakearchibald/idb`](https://github.com/jakearchibald/idb) v8.0.3 source files as Hugo assets. The `idb` mount is REQUIRED whenever `modules/workbox` is imported, because two Workbox v7 packages -- `workbox-expiration` and `workbox-background-sync` -- begin their source files with `import {openDB} from 'idb'`. Without the idb mount, esbuild fails the service-worker build with a bare-import resolution error.

`modules/workbox/hugo.toml` declares `[[module.imports]] path = "github.com/alex-feel/hugo-artifacts/modules/idb"` BEFORE the workbox upstream import to ensure idb's mount is established when esbuild walks the workbox source tree. `modules/workbox/go.mod` pins that sibling at a real commit pseudo-version, so external consumers using `modules/pwa` get both mounts from a single `hugo mod get` with no direct requires of their own; see [Consuming modules that wrap non-Go upstreams](../../CLAUDE.md#consuming-modules-that-wrap-non-go-upstreams) in root `CLAUDE.md`. See [`modules/idb/README.md`](../idb/README.md) for idb's vendor-mount mechanics and version-pin rationale.

## Smoke-test recommendation

Run a monthly smoke test (or anytime a new Workbox release lands) to detect upstream layout drift early:

```bash
# 1. Bump the require line in modules/workbox/go.mod to the candidate version.
sed -i 's/v7\.4\.1/v7.5.0/' modules/workbox/go.mod

# 2. Verify the upstream src/ layout still exists at the candidate tag.
git ls-remote --tags https://github.com/GoogleChrome/workbox v7.5.0
# (then on a local clone)
git -C ~/checkouts/workbox checkout v7.5.0
ls ~/checkouts/workbox/packages/workbox-precaching/src/

# 3. Run a fixture build and check for module-not-found and deprecation warnings.
cd modules/pwa/test/fixture
hugo mod graph
hugo --logLevel info | grep -iE "module.*not found|deprecate"

# 4. Run the validation matrix.
cd ../..
./run-matrix.sh
```

If any of these steps fail, document the layout drift, revert the version bump, and pin to last-known-good.

## Upgrade path (future Workbox v8.x)

If upstream ships a major version that preserves the `packages/*/src/` layout, the upgrade is one line:

1. Edit the upstream `require` line in `go.mod` to `v8.X.Y+incompatible`.
2. Run the smoke test above.
3. If it passes, commit, then bump the `modules/pwa` pin at this module with `npm run check:pins -- --fix` in a follow-up commit so consumers actually receive the upgrade.

If upstream changes the layout (for example flattens `packages/*` to `packages/`), update the `hugo.toml` mount tables to match the new layout, test, and note the incompatibility in this README. This repository carries no release tags; every module is consumed at a commit pseudo-version, so a breaking change reaches consumers when they move their own pin forward.

## Local development

Modules in this repo cannot run standalone -- a consumer Hugo site is required. Two mechanisms point a consumer at a local checkout:

### Option A: `hugo.work` (recommended)

In your consuming site root:

```text
go 1.22

use .
use ../hugo-artifacts/modules/pwa
use ../hugo-artifacts/modules/workbox
```

List every module you intend to EDIT. A module left out of the workspace still resolves, from its recorded commit pseudo-version over the module proxy, so a workspace holding only `modules/pwa` gives you a live-edited `pwa` against the published `workbox` and `idb`. Include `modules/workbox` when you are changing the mount table, and `modules/idb` too when you are changing both.

Add `hugo.work` to your site's `.gitignore`; the `use` paths are machine-specific.

### Option B: `[module.replacements]`

In your consuming site's Hugo config:

```toml
[module]
replacements = '''
github.com/alex-feel/hugo-artifacts/modules/pwa -> ../hugo-artifacts/modules/pwa
github.com/alex-feel/hugo-artifacts/modules/workbox -> ../hugo-artifacts/modules/workbox
'''
```

Either way, confirm resolution with `hugo mod graph` before you push.

## External consumer setup

External consumers reach `modules/workbox` transitively through `modules/pwa` and never import or require it directly. Every edge of the chain is a real, fetchable version: `modules/pwa` records `modules/workbox` and `modules/workbox` records `modules/idb` at commit pseudo-versions of this repository, and the `+incompatible` upstream `github.com/GoogleChrome/workbox` fetches normally over the standard Go module proxy -- a plain `go mod download github.com/GoogleChrome/workbox@v7.4.1+incompatible` succeeds with no local checkout, replacement, or vendoring. A consumer therefore runs one `hugo mod get github.com/alex-feel/hugo-artifacts/modules/pwa` and the whole chain resolves, with no direct `require`, no `replace`, no `_vendor/`, and no workspace.

See [`modules/pwa` README -> Installation](../pwa/README.md#installation) for the consumer steps and the [Consuming modules that wrap non-Go upstreams](../../CLAUDE.md#consuming-modules-that-wrap-non-go-upstreams) convention in root `CLAUDE.md`. `[module.replacements]` / `hugo.work` (see "Local development" above) remain options for live-editing the module locally, and `hugo mod vendor` is available for a hermetic, network-free CI build -- none of them is required.
