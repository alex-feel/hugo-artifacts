# modules/pwa validation matrix

A nine-row Playwright validation matrix that exercises the full v1.0 surface of `modules/pwa` against a minimal Hugo consuming site. The fixture site lives in [`fixture/`](fixture/) and imports `modules/pwa` + `modules/workbox` via `hugo.work`.

## Coverage

| Row | Scenario              | Spec file                                                    |
|-----|-----------------------|--------------------------------------------------------------|
| 1   | SW registration       | [`tests/01-sw-registration.spec.js`](tests/01-sw-registration.spec.js)         |
| 2   | Manifest correctness  | [`tests/02-manifest-correctness.spec.js`](tests/02-manifest-correctness.spec.js) |
| 3   | RFG modern mode head  | [`tests/03-rfg-modern.spec.js`](tests/03-rfg-modern.spec.js)                   |
| 4   | RFG legacy mode head  | [`tests/04-rfg-legacy.spec.js`](tests/04-rfg-legacy.spec.js)                   |
| 5   | Install prompt gating | [`tests/05-install-prompt.spec.js`](tests/05-install-prompt.spec.js)           |
| 6   | Push subscription     | [`tests/06-push-subscription.spec.js`](tests/06-push-subscription.spec.js)     |
| 7   | Offline rendering     | [`tests/07-offline-rendering.spec.js`](tests/07-offline-rendering.spec.js)     |
| 8   | Update flow banner    | [`tests/08-update-flow.spec.js`](tests/08-update-flow.spec.js) (orchestrator-driven Pass 3) |
| 9   | PWA installability    | [`tests/09-lighthouse-pwa.spec.js`](tests/09-lighthouse-pwa.spec.js)           |

Row 4 is gated by `LEGACY_FIXTURE=1` (orchestrator's Pass 2) because it requires a fixture rebuild with `mode = "legacy"`. Row 8 is gated by `MATRIX_PASS3_PERSISTENT=1` (orchestrator's Pass 3) because it requires a per-test persistent userDataDir plus a v1->v2 fixture transition mediated by sentinel files. The orchestrator scripts handle both automatically.

## Prerequisites

| Tool                  | Minimum                                                                       |
|-----------------------|-------------------------------------------------------------------------------|
| Hugo (any edition)    | v0.160.0+ on PATH                                                             |
| Go                    | 1.22+                                                                         |
| Node                  | 18+ (for Playwright + the test scripts)                                       |
| Playwright Chromium   | Installed via `npx playwright install chromium` (one-time setup)              |

## One-time setup

```bash
cd modules/pwa/test
npm install
npx playwright install chromium
```

## Build-level checks (no browser, no ports)

Two checks assert on Hugo's build output rather than on a running browser. Each runs one-shot `hugo` builds into temporary directories, so neither binds a port, holds a `public/` lock, or needs Playwright installed -- they are safe to run alongside anything else, and they need no `npm install` (no dependencies beyond Node and Hugo on PATH).

| Script | Command | What it builds | What it asserts |
|--------|---------|----------------|-----------------|
| [`scripts/offline-gating-check.js`](scripts/offline-gating-check.js) | `npm run test:offline-gating` | The fixture twice: offline enabled (default) and offline disabled | The `/offline/` page, its precache entry, and the SW catch handler appear ONLY when `params.pwa.sw.offline.enabled` is true, and the page never reaches `sitemap.xml` |
| [`scripts/subpath-check.js`](scripts/subpath-check.js) | `npm run test:subpath` | The fixture six times: its own config at `baseURL = https://example.org/docs/` and at `https://example.org/`, the [`subpath.toml`](subpath.toml) feature overlay at both, and the [`canonify.toml`](canonify.toml) and [`offline-off.toml`](offline-off.toml) overlays at the path-carrying one | Under a path-carrying baseURL, the registered service-worker URL and scope, the manifest `scope` / `start_url` / `id`, every manifest icon `src`, every `<link>` href, the `msapplication-config` meta, every precache URL, and every URL handed to the SW and push bundles carry `/docs` AND resolve to a file the build published; under the root baseURL the same values stay un-prefixed; off-site values (scheme-carrying and protocol-relative) pass through untouched in both |

`subpath-check.js` is the regression barrier for Hugo's leading-slash URL rule: `relURL` and `absURL` resolve a value that already starts with `/` against the protocol and host only, DISCARDING the baseURL's path, so every path this module ships (`sw_path`, `sw_scope`, the manifest `scope` / `start_url` / `id`, every favicon and icon path) must be normalized through `pwa/lib/absolute-url.html` before it is emitted. A root-level baseURL cannot tell a correct implementation from a broken one -- both emit `/sw.js` -- which is why the path-carrying builds are the load-bearing half of the check.

Three overlay configs make the rest of the surface reachable, and each carries its rationale in its own header comment. [`subpath.toml`](subpath.toml) turns on the keys the fixture's own config leaves at their defaults -- legacy favicons and `favicon.prefix`, the `rfg-static` manifest href, an explicit `manifest.icons.list` including off-site entries and one with no `src`, `sw.precache.extra_urls`, `sw.bypass.urls`, the offline fallback image, the push badge, and a push click target -- because a call site that never runs cannot regress visibly. [`canonify.toml`](canonify.toml) sets `canonifyURLs = true`, the one setting under which `relURL` and `.RelPermalink` both stop carrying the baseURL's path, so it is the only build that can prove the module derives that path itself rather than delegating to them. [`offline-off.toml`](offline-off.toml) disables the offline fallback so the module's content adapter skips `/offline/` and `site.GetPage` misses it, which is the only configuration that reaches the FIRST of the two offline-URL resolutions in `service-worker.html` -- in every other build the Page-derived resolution overwrites it, so reverting its normalization changes no published byte and a mutation test on it passes while the code is broken.

Two traps this check has had to be written around, worth knowing before adding an assertion to it. A value whose normalized spelling ALREADY appears in the artifact for another reason cannot be asserted by containment: the homepage precache entry puts `url:"/docs/"` in `sw.js`, so a containment check on the default push click URL of `/` passes whether or not that URL was normalized. And a value emitted by TWO call sites -- the offline fallback image is both precached and handed to the catch handler -- still satisfies a presence check when only one of them regresses. So every asserted value is configured to a spelling nothing else in the build emits, and every presence check in a path-carrying pass is paired with an assertion that the un-prefixed spelling is ABSENT.

## Running the matrix

Invoke `./run-matrix.sh` (Linux/macOS) or `run-matrix.cmd` (Windows) from `modules/pwa/test/`. The orchestrator runs Playwright THREE times automatically: Pass 1 against the default fixture (rows 1-3, 5-7, 9), Pass 2 against a legacy-mode fixture rebuild for row 4, and Pass 3 against a v1-fixture-then-v2-fixture transition for row 8 (the orchestrator runs a concurrent watcher that mutates the fixture in-place when the spec writes the trigger sentinel). Each pass starts from a known-good fixture state; the orchestrator restores `hugo.toml` and `content/blog/post-1.md` from `.bak` files between passes and removes sentinel files (`.matrix-v2-trigger`, `.matrix-v2-ready`) on EXIT. Hugo Process Lifecycle Management (R3) is enforced: pre-launch process+port check, and `pkill hugo` / `taskkill /F /IM hugo.exe` between passes. Total runtime is approximately 60-180 seconds (3 hugo restarts in Passes 1+2 plus 2 hugo restarts in Pass 3 + 3 Playwright passes including a 30-60s SW + manifest audit in row 9). Set `MATRIX_PASS=default|legacy|v2` to run only one of the three passes (useful for diagnostics; the default `MATRIX_PASS=all` runs all three). Aggregate target: 9 PASS / 0 SKIPPED / 0 FAIL.

### Linux / macOS

```bash
./run-matrix.sh
```

### Windows

```cmd
run-matrix.cmd
```

### Custom port

```bash
HUGO_PORT=4000 ./run-matrix.sh
```

The orchestrator passes the chosen port to all three passes.

### Run a single pass

```bash
MATRIX_PASS=default ./run-matrix.sh   # rows 1-3, 5-7, 9
MATRIX_PASS=legacy ./run-matrix.sh    # row 4
MATRIX_PASS=v2 ./run-matrix.sh        # row 8
```

### Row 8: Update flow (orchestrator-driven persistent context)

Row 8 verifies Workbox's update lifecycle (`pwa:waiting` then `pwa:controlling`) by driving a v1 SW install followed by a v2 SW activation within a single test. The matrix orchestrator's Pass 3 starts Hugo on the v1 fixture state and runs the spec with `MATRIX_PASS3_PERSISTENT=1`. The spec uses `chromium.launchPersistentContext()` with a per-test mktemp `userDataDir` so the v1 SW registration persists across the v1->v2 fixture swap. The spec writes a sentinel file (`.matrix-v2-trigger`); the orchestrator's concurrent watcher detects it, swaps the fixture to v2 (`version = "v2"` and `date: 2026-05-10` so the SW source bytes diverge), restarts Hugo on the same port, and writes the response sentinel (`.matrix-v2-ready`). The spec calls `r.update()`, the browser detects the byte-different SW source, and the W3C lifecycle (`installing -> installed/waiting`) drives `pwa:waiting`. After `SKIP_WAITING` postMessage, `pwa:controlling` fires and the spec asserts both events.

### Run a single row

```bash
cd tests
FIXTURE_URL=http://127.0.0.1:1313 npx playwright test 05-install-prompt.spec.js
```

Requires the fixture server already running (start it manually with `cd fixture && hugo server --port 1313`).

## Reports

Playwright HTML reports land in `playwright-report/` (gitignored). View the latest run:

```bash
npx playwright show-report
```

Failure runs also retain screenshots, traces, and videos under `test-results/`.

## Updating fixture content

The fixture site in `fixture/` is a minimal Hugo project. Edit the content files (`fixture/content/*.md`) or layouts (`fixture/layouts/`) as needed. The fixture is deliberately minimal -- only what is needed to exercise the PWA module surface.

The fixture's `hugo.toml` declares both `modules/pwa` and `modules/workbox` imports and a `hugo.work` workspace pointing at the local checkouts. If you move the fixture or the modules, update the relative paths in `hugo.work` and `go.mod`.

## RFG favicon-checker (optional)

`scripts/rfg-checker.js` integrates with the [RealFaviconGenerator favicon-checker API](https://realfavicongenerator.net/favicon-checker) to assert zero errors against the fixture site's favicon set. The checker requires a publicly-reachable HTTPS URL, so it cannot run against `http://127.0.0.1:1313` directly.

### Running with a public tunnel

Expose the fixture via a tunnel (`localtunnel`, `ngrok`, etc.) and point the checker at the public URL:

```bash
# Terminal 1: start the fixture server
cd fixture
hugo server --port 1313

# Terminal 2: open a public tunnel
npx localtunnel --port 1313

# Terminal 3: run the checker against the tunnel URL
FIXTURE_URL=https://<your-tunnel>.loca.lt npm run rfg-check
```

### Skipping when no tunnel is available

Set `RFG_CHECKER_SKIP=1` to bypass the check; the script exits 0 with a notice and the matrix orchestrator treats the row as deferred:

```bash
RFG_CHECKER_SKIP=1 npm run rfg-check
```

This is acceptable for local development environments where exposing a public HTTPS URL is not feasible. Run the checker manually before production deployment.

### Switching between modern and legacy mode

The checker is mode-agnostic -- it inspects the live `<head>` content that the fixture server renders. To check both modes, run the orchestrator once with the default modern mode and once with `LEGACY_FIXTURE=1`, running the RFG checker between the two.

## Row 9: PWA installability audit

Row 9 asserts the same PWA installability properties Lighthouse's PWA category audited before its removal in Lighthouse v12.0. Direct Playwright assertions replace the Lighthouse CLI invocation. The spec fetches `manifest.webmanifest`, validates required fields (`name` or `short_name` non-empty, `start_url` reachable, `display` in {standalone, fullscreen, minimal-ui, browser} or `display_override` containing one of those, icons covering >=192x192 and >=512x512), asserts the `<link rel="manifest">` is correctly linked from `<head>`, and asserts `navigator.serviceWorker.ready` resolves with an active SW that controls the page. No external CLI dependency is required; Lighthouse is no longer a devDependency.

## Troubleshooting

### "Hugo build fails"

Run from `fixture/`:

```bash
hugo mod graph
```

This shows the dependency tree. If `modules/workbox` does not appear, check `hugo.work` and the `replace` lines in `go.mod`.

### "Playwright timeout on /sw.js"

Verify `params.pwa.sw.enabled` is not set to `false` in the fixture's `hugo.toml`. The default is `true`; tests assume that.

### "Mock subscribe_url not intercepted"

Tests use `page.route('**__mock_subscribe**', ...)` to intercept the POST. Make sure the fixture's `params.pwa.push.subscribe_url` still contains the literal substring `__mock_subscribe`.

### "Pre-launch process check failed: port in use"

Another `hugo` process is already running. Find and stop it:

```bash
# Linux/macOS
pgrep -af hugo
pkill hugo

# Windows
tasklist /FI "IMAGENAME eq hugo.exe"
taskkill /F /IM hugo.exe
```

Or run on a different port: `HUGO_PORT=4000 ./run-matrix.sh`.

### Tests fail with "browser not installed"

```bash
npx playwright install chromium
```

## iOS Safari coverage

iOS Safari install + push cannot be automated -- the Add to Home Screen flow runs entirely in the iOS Safari chrome. A manual test checklist is in [`IOS_MANUAL_MATRIX.md`](IOS_MANUAL_MATRIX.md).

## See also

- [`modules/pwa/README.md`](../README.md) -- the module under test.
- [`modules/workbox/README.md`](../../workbox/README.md) -- the vendor-mount companion module.
- [`IOS_MANUAL_MATRIX.md`](IOS_MANUAL_MATRIX.md) -- iOS Safari manual install-before-push checklist.
- [Playwright documentation](https://playwright.dev/)
- [W3C Web App Manifest](https://w3c.github.io/manifest/)
- [Chrome installability criteria](https://web.dev/articles/install-criteria)
