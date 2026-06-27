# modules/idb

Hugo module that vendor-mounts the [`idb`](https://github.com/jakearchibald/idb) TypeScript sources at `assets/idb/`. Companion of `modules/workbox`: Workbox v7+ packages `workbox-expiration` and `workbox-background-sync` import from `'idb'`, and Hugo's `js.Build` (esbuild) needs the source files to be resolvable through the unified asset filesystem.

## How it works

The upstream [`github.com/jakearchibald/idb`](https://github.com/jakearchibald/idb) repository ships TypeScript sources under `src/`. This module mounts that directory at `assets/idb/`, so a bare `import {openDB} from 'idb'` in a service-worker source resolves through esbuild's standard module-resolution algorithm to `assets/idb/index.ts`.

Mount table:

| Source | Target       |
| ------ | ------------ |
| `src`  | `assets/idb` |

The single-mount layout is sufficient because `src/index.ts` re-exports the public API surface (`openDB`, `deleteDB`, `wrap`, `unwrap`, `IDBPDatabase`, `IDBPTransaction`, `DBSchema`) and pulls in `database-extras.ts` and `async-iterators.ts` via side-effect imports.

## Bare-import usage

```typescript
// Inside a service-worker source bundled by Hugo's js.Build.
import {openDB} from 'idb';

const db = await openDB('my-db', 1, {
  upgrade(database) {
    database.createObjectStore('items');
  },
});
```

## Version pinning

`go.mod` requires `github.com/jakearchibald/idb v8.0.3+incompatible`. The upstream repo has no `go.mod`, so Go's `+incompatible` modifier is required: the version tag is treated as opaque metadata, and Hugo (via its module system) clones the repository at that tag and applies the mounts declared in this module's `hugo.toml`.

The `+incompatible` modifier is exclusively a Go module mechanism for declaring a v2.0.0+ tag on a non-Go-module repository; it does not change Hugo behavior.

## Why vendor-mount instead of npm?

1. Hugo's asset pipeline is single-stage: `hugo` produces the final site directly. Adding npm to the build graph would require a separate `npm install` step and a wrapper around the Hugo invocation.
2. esbuild (used by `js.Build` since Hugo 0.74.0) compiles TypeScript natively, so the upstream `src/` is consumed without a transpile step.
3. Bare imports against the mounted filesystem work the same way they do against `node_modules/` -- esbuild does not distinguish between the two when resolving from its filesystem hooks.

## Layout-stability assumption

The upstream `src/` layout (the single `index.ts` plus its sibling helpers) has been stable across all v8.x releases. If a future v9 release reorganizes `src/`, this module's `hugo.toml` may need a new mount table. Recommend a monthly smoke-test (rebuild the consumer fixture site against this module; verify `hugo --logLevel info | grep -E "module.*not found|JSBUILD.*Could not resolve"` returns zero matches).

## External consumers

External consumers reach `modules/idb` transitively through `modules/pwa` -> `modules/workbox` and never import it directly. The `+incompatible` upstream `github.com/jakearchibald/idb` fetches normally over the standard Go module proxy (a plain `go mod download github.com/jakearchibald/idb@v8.0.3+incompatible` succeeds with no local checkout, replacement, or vendoring). To resolve the chain's placeholder pseudo-versions, add `modules/idb` -- alongside `modules/pwa` and `modules/workbox` -- as a direct `require` in the consumer `go.mod` pinned to a real commit pseudo-version; Go's minimal-version selection outranks the placeholder, so no `replace`, `_vendor/`, or workspace is required. See [`modules/pwa` README -> Installation](../pwa/README.md#installation) and the [Consuming modules that wrap non-Go upstreams](../../CLAUDE.md#consuming-modules-that-wrap-non-go-upstreams) convention in root `CLAUDE.md`.

## Status

v1.0.0 -- companion of `modules/workbox` v1.0.0. Ships as a Hugo module under `github.com/alex-feel/hugo-artifacts/modules/idb`. The vendored upstream `idb` library is MIT-licensed; see its [upstream LICENSE](https://github.com/jakearchibald/idb/blob/main/LICENSE).
