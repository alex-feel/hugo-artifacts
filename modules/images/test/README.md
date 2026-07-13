# images module validation suite

Build-output assertion tests that validate the images module against the minimal consuming site in [`fixture/`](fixture/). The fixture resolves the module from this repository checkout via `hugo.work` plus a `go.mod` `replace`, so no network module fetch is needed.

The module ships zero JavaScript, so there is no browser behavior to test: every observable output is static HTML produced by `hugo` plus published files under `public/`. The suite therefore uses Node's built-in test runner (`node --test`) parsing the built HTML with `node-html-parser` -- faster than a browser harness, no browser dependency, and it asserts the exact contract at the attribute level.

## What is covered

- `tests/01-defaults.spec.js` -- the default render contract: exact picture/source/img shape under the fixture ladder, ascending WebP and PNG srcsets, generated `sizes` with the lazy `auto,` prefix, CLS `width`/`height`, the lazy loading policy, source-before-img ordering, and the existence of every referenced derivative file.
- `tests/02-no-upscale.spec.js` -- the no-upscale clamp: a 500px source gains exactly one `500w` top candidate and never exceeds it, a source width exactly equal to a ladder rung keeps that rung, and fixed layout emits only the densities the source covers with no `sizes` attribute and 1x display dimensions.
- `tests/03-passthrough.spec.js` -- the passthrough matrix: SVG (no invented dimensions), GIF (intrinsic dimensions, no srcset), warning-free `/static` paths, and untouched remote URLs, each with the `image--static` modifier, the true `data-kind` origin, and the same `data-layout` root attribute processed renders carry.
- `tests/04-hook.spec.js` -- the Markdown render hook: full-pipeline block form for standalone images, below-the-image attribute-block overrides with the module-owned deny-list, phrasing-only inline form, the missing-file raw-src degradation with exactly one warning, and the `#raw` neutral-fallback bypass.
- `tests/05-alt-escaping.spec.js` -- escaping and URL neutralization: hostile alt text appears only attribute-escaped, no raw `<script` anywhere, decorative images carry exactly `alt=""`, hostile captions are stripped under goldmark's default security settings, and `javascript:` URLs neutralize to `#ZgotmplZ`.
- `tests/06-features.spec.js` -- feature surfaces: the three figcaption elements with rendered inline Markdown, the `image__meta` credit/license grouping with its empty separator hook, and zero ARIA; the capped lightbox anchor with intrinsic dimensions; both dark-variant strategies (source ordering, theme tagging, unconditional lazy alternate tree, the `image--swap-block` display modifier on the bare swap span); `root_class` placement on the root element only; art-direction variants with combined dark media queries and per-source dimensions; the media-qualified preload pair without the `auto,` prefix plus the plain-href passthrough preload link; the `images/src.html` value feed; both placeholder modes (including a decodable WebP blur data URI); and the per-page kill switch.
- `tests/07-avif-gate.spec.js` -- the AVIF version gate, certified on BOTH sides: below Hugo 0.163.0 exactly one gate warning, zero published `.avif` files, and WebP-plus-original markup; at 0.163.0+ real `.avif` derivatives with avif sources preceding webp sources.
- `tests/08-gallery.spec.js` -- the gallery contract: `data-count`, gapless 1-based `data-index` zero-padded to the item count's digit width (`01`..`10` on a ten-item gallery), complete image blocks with lightbox anchors, resource-metadata alt/caption/credit, the alt-less degradation (empty alt, suppressed anchor, one deduplicated warning), and `crop="1x1"` square tiles whose lightbox anchors still target uncropped derivatives.
- `tests/09-hardening.spec.js` -- code-review hardening regressions: a hostile pass-through attribute VALUE is entity-escaped so no event handler can break out (stored-XSS fix); non-positive and out-of-range numeric tokens (`widths="0"`, `quality="150"`, `process=fill` without both dimensions) degrade with one warning instead of crashing the build; an unknown named shortcode parameter (`captoin=`, `cropp=`) warns once and is ignored instead of vanishing silently; `layout=fixed` with only a `height` derives its width from the source aspect ratio; a width-only passthrough never fabricates `height="0"`; the two-positional `{{< image "src" "alt" >}}` shorthand renders; the priority/eager/full loading rows emit their exact attribute sets; and `credit_from_meta` surfaces the original image's IPTC credit.

## Running

Prerequisites: Hugo v0.160.0+ (extended), Go 1.22+, Node.js 22+.

```bash
cd modules/images/test
npm ci
./run-tests.sh        # or run-tests.cmd on Windows
```

The run script builds the fixture with `hugo --logLevel info` (a build, not a server -- no port binding), hard-fails if the build log contains any deprecation or error line, exports `FIXTURE_PUBLIC`, `HUGO_BUILD_LOG`, and `HUGO_VERSION` for the specs, and runs `npm test` (`node --test "tests/*.spec.js"`). The build log deliberately CONTAINS the module's deduplicated warnings -- the fixture provokes them on purpose, and the specs assert their exact counts. To re-run the specs against an already-built fixture: `FIXTURE_PUBLIC=fixture/public HUGO_BUILD_LOG=hugo-build.log HUGO_VERSION=0.160.1 npm test`.
