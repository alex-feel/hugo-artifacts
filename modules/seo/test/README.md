# seo module test suite

Node build-output assertions for `modules/seo`, run against the static HTML that eleven Hugo builds of [`fixture/`](fixture/) produce. The module ships zero JavaScript, so there is no browser behavior to test and the suite carries no Playwright dependency.

## Why eleven builds

The suite builds the fixture eleven times, and every build is load-bearing:

| Build | Environment | Destination | What it proves |
| --- | --- | --- | --- |
| baseline | default | `fixture/public/baseline/` | `[seo.alternates]`, `[seo.links]` and `[seo] content_license` are **absent** from the config, so every surface they drive must be absent from the output. This is what proves the additions are inert for consumers who do not opt in. |
| configured | `configured` | `fixture/public/configured/` | All three blocks are set, so every surface must appear, exactly once, on every page shape. |
| subpath | `subpath` | `fixture/public/subpath/` | The same configured surfaces under `baseURL = 'https://seo-fixture.example/docs/'`. Hugo's `absURL` resolves a value that already begins with `/` against the protocol and host **only**, discarding the baseURL path -- and the leading slash is the form this module documents for every `[seo.links]` key, for `canonical`, for `default_image` and for `search_url_template`. At a domain root a correct implementation and a broken one emit byte-identical output, so this is the only build in which the difference exists at all. |
| badtypes | `badtypes` | `fixture/public/badtypes/` | The whole `seo` and legacy `metadata` param namespaces written as bare scalars -- the config shapes that used to stop the build or silently disable a surface. The build must complete, degrade to deduplicated warnings, and keep emitting every untouched surface. |
| offswitch | `offswitch` | `fixture/public/offswitch/` | `[params] seo = false`, the natural falsy shorthand for the documented kill switch. The build must survive and the falsy spelling must be reported rather than swallowed. |
| pagination | `pagination` | `fixture/public/pagination/` | A two-language site whose `posts` section is split across pagers. Hugo re-renders one list `Page` object per pager and `.Permalink` stays pinned to the first pager on all of them, so this is the only build in which a document is served from a URL that is not the page's own permalink -- the only place a canonical, an `og:url`, a JSON-LD `@id` or an hreflang entry can be checked for naming the URL that actually served it. The list template paginates an explicit collection with an explicit pager size that DIFFERS from the site default, so a partial that built the paginator first would publish a visibly different pager set. |
| graph | `graph` | `fixture/public/graph/` | The baseline content published through the OTHER JSON-LD container: `seo.jsonld_container = 'graph'` collapses every page's node list into one `<script>` holding a `@graph` array. `seo/head-jsonld.html` serializes at two separate sites, one per container mode, and this is the only build that reaches the graph one, so without it half of that emitter ships unread by any assertion. |
| sitename | `sitename` | `fixture/public/sitename/` | `[seo.website] name` and `[seo.organization] name` set to DIFFERENT strings, the publisher being a `type = 'Person'`. Four surfaces name the site -- `og:site_name`, the JSON-LD `WebSite.name`, the OpenSearch `<link rel="search">` title and the feed-discovery title -- and this is the only build in which the two ends of their shared fallback chain resolve differently, so it is the only one where an inverted chain is distinguishable from a correct one. It cannot be folded into `configured` or `subpath`: each of those writes one of the two tables as a bare scalar deliberately, which makes that end unreadable and the divergence invisible. |
| generated | `generated` | `fixture/public/generated/` | `[seo] image_partial` wired to `layouts/_partials/fixture/og-card.html` AND a site `default_image`, which is the only shape in which the hook's rank is observable: with no default configured a hook ranked below one would still answer, and every "an `og:image` is present" assertion passes either way. The fixture partial declines the `promo` section so the fall-through to `default_image` is exercised in the same build, and it records the `title` and `description` it was handed in a JSON sidecar beside each card, because the strings it draws end up in pixels no assertion can read. Site-level cascades then reach the shapes one site-wide key cannot: one page gets an `seo.title` different from its `.Title`, so the resolved title and the raw one are distinguishable strings here and nowhere else; the blog section names the generator WITHOUT the `.html` suffix and receives a two-item slice back; the tag taxonomy sets the key to a boolean and the author section to a table, so two differently-shaped mistakes must produce two warnings in one build; and the category taxonomy points at a partial that RENDERS instead of returning, the mistake that would otherwise publish escaped markup as an `og:image`. |
| multilingual | `multilingual` | `fixture/public/multilingual/` | A second language whose **language params** set a noindex robots baseline. `seo/head-meta.html` resolves every entry of `.AllTranslations` through `seo/resolve/robots.html`, so this is the only build that can tell a per-language params read (`$page.Site.Params`) from a rendering-language one (the global `site`): with the global read the default-language page cannot see the other language's baseline and emits an hreflang alternate pointing at a noindexed URL, which the hreflang block promises never happens. |
| hometitle | `hometitle` | `fixture/public/hometitle/` | A home page that declares its own SEO title, under a site-wide `title_suffix`. The home page is the one page whose `<title>` does not follow the page title, and no other build can see that rule: nowhere else is a suffix configured at all, so the branch that appends it renders in no build, and nowhere else does a home page declare a title, so the home `<title>` lands on the site title whether the rule is right, wrong, or absent. The English home makes its cascaded `seo.title`, its own `title` front matter and the site title three DIFFERENT strings, so the published `<title>` names which of the three the rule follows; the Russian home carries the deprecated `meta_title` spelling instead, and it is a second LANGUAGE rather than a second page because a site has exactly one home per language and `seo.title` would mask the alias on a page carrying both. A third language declares nothing at all, which is the ordinary consumer shape and the only one that pins the FALLBACK arm while a suffix is in force: the two declaring homes leave that arm unrendered, so appending the suffix there changes no byte of any build. |

An assertion that only ever saw the configured build could not distinguish "works" from "always on", which is the specific regression that matters here: `seo/head-meta.html` renders on every page of every consuming site. The subpath build guards a second class entirely: output that is well-formed and plausible on every page, and points outside the site.

## Running

```bash
bash modules/seo/test/run-tests.sh
```

or, on Windows:

```text
modules\seo\test\run-tests.cmd
```

Both runners perform the repository's pre-launch Hugo process check, fail hard on any `deprecat` or `ERROR` line in any build log, and then run the Node assertions. Re-run the assertions alone against an existing build with:

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
- **`layouts/_partials/seo/jsonld-extra.html`**, the tier-3 hook, which publishes `$seo.ids.person` into the graph so a spec can observe the value the module hands consumers;
- **a translated page in `content-ru/`**, mounted by the `multilingual` and `hometitle` environments, so the hreflang skip contract has a translation to skip and the legacy title alias has a second home page to sit on;
- **`content-undeclared/`**, a home page with a content title and no SEO title, mounted only by the `hometitle` environment, so the ordinary consumer shape exists in the one build that configures a title suffix;
- **a paginated `posts` section in `content-pgn/` and `content-pgn-de/`**, mounted only by the `pagination` environment, with `layouts/posts/list.html` calling `.Paginate` with its own collection and its own pager size;
- **two serialization-edge pages** whose title, description, tags, categories, `seo.keywords`, `seo.image`, `seo.image_alt` and `seo.video` values carry quotation marks, angle brackets, ampersands, an embedded newline, backslashes, non-ASCII and one long unbroken run -- one resolving to `VideoObject`, one to the article class, so both an HTML attribute and a JSON-LD document have to carry every one of those characters intact;
- **`layouts/_partials/fixture/og-card.html` and `assets/img/card-base.png`**, used only by the `generated` environment: a stand-in generated-image module that draws the resolved title onto a template raster with `images.Text` and publishes the result per page, so the hook is exercised with a real composed Resource rather than a path string, plus **`layouts/_partials/fixture/og-render.html`**, the same hook written the wrong way -- markup rendered, nothing returned -- so the guard against publishing that markup has something to catch.

The `configured` environment also sets one deliberately unregistered `[seo.links]` key, so the warn-and-skip path is proven to emit no tag rather than a bare relation token no client can interpret.

## Specs

| File | Covers |
| --- | --- |
| `tests/01-alternates.spec.js` | Alternate representations and the static link relations, in the baseline, configured and subpath builds. |
| `tests/02-person-id.spec.js` | `$seo.ids.person` constancy across page shapes, its agreement with the `ProfilePage` `mainEntity` anchor, and its separation from the `#organization` anchor. |
| `tests/03-content-rights.spec.js` | The `license` property on `WebPage`, `CollectionPage` and `BlogPosting`, and its absence from `Person`, `Organization`, `WebSite` and `BreadcrumbList`. |
| `tests/04-never-fail.spec.js` | The never-fail contract: scalar-shaped config and front matter, undecodable cover images, map-shaped image candidates and the falsy kill-switch spelling all degrade to deduplicated warnings and safe output, never a broken build or a Go debug string. |
| `tests/05-language-params.spec.js` | Per-language site params in the multilingual build: the translated page carries its own language's noindex robots baseline, and the default-language head emits no hreflang alternate pointing at it. |
| `tests/06-pagination.spec.js` | The URL that served the document: canonical, `og:url`, the `WebPage` `@id` and `url`, the `BreadcrumbList` `@id` and the hreflang cluster all name the pager URL on `/posts/page/2/` and `/de/posts/page/2/`, the first pager is unchanged, a leaf page still emits its permalink, and the published pager set is still the one the list template asked for. |
| `tests/07-serialization.spec.js` | Serialization structure: every JSON-LD block on every page parses as one JSON document and carries no raw angle bracket in BOTH container shapes (one block per node, and one `@graph` block per page), the node values and head attribute values decode back to the strings the fixture front matter authored, and no emitted head tag closes an attribute value early. |
| `tests/08-readme.spec.js` | Documentation locks on the module README: every `[outputs]` example is introduced as a merge into the site's single table, and no line presents a module-side `[outputs]` table as effective. |
| `tests/09-robots-ai-usage.spec.js` | Robots-directive pass-through: the authored token list reaches both the all-bots `<meta name="robots">` and the per-bot `<meta name="bingbot">` intact and in order -- including `noarchive`/`nocache`, which Bing repurposed as AI-usage controls, and a token no engine reads -- with nothing deleted and nothing warned about. |
| `tests/10-site-name.spec.js` | The site-name chain: `og:site_name`, the JSON-LD `WebSite.name`, the OpenSearch title and the feed title all carry `[seo.website] name` in the `sitename` build while the `Person` publisher keeps its own, they agree with each other in every build that emits them, the no-website-name fallbacks are unmoved, and no consumer re-derives the chain inline. |
| `tests/11-generated-image.spec.js` | The generated-image hook: a composed card outranks `default_image` and reaches both `og:image` and JSON-LD with real dimensions, a slice return contributes every resource in order, list and home pages are served and not only regular ones, a page carrying its own image gets no card on any surface, a page the generator declines falls through to the site banner, an author's `Person.image` is never a card, the hook is handed the resolved title rather than the raw one, a card already measuring 1200x630 is served as itself rather than cropped into a byte-identical twin, a suffix-less partial name resolves as `partial` resolves it, and a missing template, a non-scalar value, and a partial that renders instead of returning each warn once and change nothing else. |
| `tests/12-home-title.spec.js` | The home page's `<title>`: a declared `seo.title` (and the `meta_title` alias) becomes the home search headline while `og:title`, `twitter:title` and `WebPage.name` agree with it, no home page takes the suffix and every non-home page does, a home page declaring nothing still publishes the site title rather than its own `title` front matter, the resolver reads the page's own site rather than the rendering language, and a title or suffix written as a table or a list warns once under its own key and falls through while a number publishes as the number. |
| `tests/13-published-images.spec.js` | The output directory rather than the markup: in every one of the eleven trees, each published image the module put there is named by some published document. Reading an image URL is what writes the file, so a candidate that lost the precedence race, a native-aspect variant no node asks for and a no-op crop all reach `public/` invisibly -- correct markup and a heavier site. Files Hugo copies on its own (everything under `static/`, and every file inside a content bundle) are excluded by reading the fixture's own source names, and a second assertion pins that the exclusion does not quietly cover the generated cards. |
