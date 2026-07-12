# search module validation suite

Playwright specs that validate the search module end to end against the multilingual (en + ru) fixture site in [`fixture/`](fixture/), served by `hugo server`.

## Coverage

| Spec | Validates |
| --- | --- |
| `01-index.spec.js` | Envelope shape (`schemaVersion`, `lang`, 16-hex `digest`, `docCount`), section and per-page exclusion filters, nested-section reachability, hostile payloads present as literal text with no entity leaks or double encoding, heading sub-records. |
| `02-markup.spec.js` | The no-JavaScript baseline: form action contracts per surface and language, dual-hidden JS-only controls, live regions in server HTML, resolved-defaults attributes, and a Cyrillic GET round-trip. |
| `03-enhancement.spec.js` | No index fetch before intent, focus-triggered fetch, the module worker, and the `search:ready` payload. |
| `04-query.spec.js` | English and Russian recall (stemming, `ё` folding), title-over-body ranking, prefix and fuzzy matching, heading anchor deep links plus parent matches, grouped rendering, and the full `?q=` round-trip (deep link, replaceState, immediate clear, popstate). |
| `05-modal.spec.js` | Hotkey and slash opening (with in-field suppression), native dialog semantics, the activedescendant keyboard model, Enter on both branches (active option and see-all with a Cyrillic query intact), and the two-stage Escape with focus return. |
| `06-inline.spec.js` | The combobox attribute walk: `aria-expanded`, `aria-controls`, unique option ids, activedescendant tracking, collapse/re-expand/clear semantics. |
| `07-a11y-xss.spec.js` | Debounced pluralized status counts, zero-results alerts, hostile payloads rendered as text with nothing executing, the `javascript:` image scheme filter, taxonomy and thumbnail slot delivery, and metacharacter queries. |
| `08-cache-events.spec.js` | Serialized-index caching (network then cache, the query-string compound key, mutated-discriminator misses) and the full CustomEvent contract including `search:rescan`. |

## Prerequisites

- [Hugo](https://gohugo.io/) v0.160.0+ (extended edition)
- [Go](https://go.dev/) 1.22+ (module resolution for the fixture)
- [Node.js](https://nodejs.org/) 22+
- Playwright's Chromium: `npx playwright install chromium`

Install dependencies once:

```bash
npm ci
```

## Running

```bash
./run-tests.sh        # Linux / macOS
run-tests.cmd         # Windows
```

The run script performs the repository's hugo lifecycle steps: it refuses to start when a hugo process is already running, serves the fixture on port 1515 (override with `PORT=1516 ./run-tests.sh`), fails hard when the server log contains deprecation output, runs the suite, and kills the server plus the log file afterward. Extra arguments pass through to `npx playwright test` (for example `./run-tests.sh tests/04-query.spec.js`).

To point the suite at an already-running fixture server instead, set `FIXTURE_URL`:

```bash
FIXTURE_URL=http://localhost:1516 npx playwright test
```

The fixture resolves the module from this repository checkout via the `replace` directive in `fixture/go.mod` (a `hugo.work` is also provided), so no network fetch of the module itself is needed; the vendored MiniSearch upstream is fetched once over the Go module proxy.
