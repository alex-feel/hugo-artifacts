# seo module test suite

Node build-output assertions for `modules/seo`, run against the static HTML that two Hugo builds of [`fixture/`](fixture/) produce. The module ships zero JavaScript, so there is no browser behavior to test and the suite carries no Playwright dependency.

## Why two builds

The suite builds the fixture twice, and both halves are load-bearing:

| Build | Environment | Destination | What it proves |
| --- | --- | --- | --- |
| baseline | default | `fixture/public/baseline/` | `[seo.alternates]`, `[seo.links]` and `[seo] content_license` are **absent** from the config, so every surface they drive must be absent from the output. This is what proves the additions are inert for consumers who do not opt in. |
| configured | `configured` | `fixture/public/configured/` | All three blocks are set, so every surface must appear, exactly once, on every page shape. |

An assertion that only ever saw the configured build could not distinguish "works" from "always on", which is the specific regression that matters here: `seo/head-meta.html` renders on every page of every consuming site.

## Running

```bash
bash modules/seo/test/run-tests.sh
```

or, on Windows:

```text
modules\seo\test\run-tests.cmd
```

Both runners perform the repository's pre-launch Hugo process check, fail hard on any `deprecat` or `ERROR` line in either build log, and then run the Node assertions. Re-run the assertions alone against an existing build with:

```bash
FIXTURE_PUBLIC=fixture/public/baseline \
FIXTURE_PUBLIC_CONFIGURED=fixture/public/configured \
HUGO_BUILD_LOG=hugo-build.log \
HUGO_BUILD_LOG_CONFIGURED=hugo-build-configured.log \
npm test
```

## What the fixture covers

The fixture exists to exercise the page shapes where a head regression would otherwise be invisible:

- **a regular page carrying a `markdown` output**, so the alternates allow-list has a real representation to advertise and the RSS alternate can be proven to survive alongside it;
- **a blog page** typed `BlogPosting`, and its section, typed `CollectionPage`, for the license property;
- **the site-owner author page**, whose `ProfilePage` `mainEntity` anchor must equal the resolver's;
- **a promo-shaped page with its own root `baseof`** that calls `seo/head.html` itself, mirroring a consuming site shape where a regression on that path would appear on no other page;
- **`layouts/_partials/seo/jsonld-extra.html`**, the tier-3 hook, which publishes `$seo.ids.person` into the graph so a spec can observe the value the module hands consumers.

The `configured` environment also sets one deliberately unregistered `[seo.links]` key, so the warn-and-skip path is proven to emit no tag rather than a bare relation token no client can interpret.

## Specs

| File | Covers |
| --- | --- |
| `tests/01-alternates.spec.js` | Alternate representations and the static link relations, in both builds. |
| `tests/02-person-id.spec.js` | `$seo.ids.person` constancy across page shapes, its agreement with the `ProfilePage` `mainEntity` anchor, and its separation from the `#organization` anchor. |
| `tests/03-content-rights.spec.js` | The `license` property on `WebPage`, `CollectionPage` and `BlogPosting`, and its absence from `Person`, `Organization`, `WebSite` and `BreadcrumbList`. |
