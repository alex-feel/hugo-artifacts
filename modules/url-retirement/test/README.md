# url-retirement module test suite

Build-output assertions over the two documents this module publishes. The runner builds `./fixture` eighteen times and the specs read the published bytes; nothing is mocked, and no assertion is made against a template.

## Prerequisites

Hugo (extended not required) and Node.js v22 or newer on `PATH`. The suite has no dependencies of its own -- `node --test` and `node:assert` are enough -- so there is nothing to install.

## Running

```bash
bash run-tests.sh          # macOS, Linux, Git Bash
run-tests.cmd              # Windows
```

Either script refuses to start while a `hugo` process is running, removes `fixture/public`, builds every environment, and fails on any deprecation or error in any build log. Every build except `degraded`, `degraded-shapes` and `conflict` must also be silent: a warning there is a failure, and those three exist to produce the diagnostics the specs read.

## The eighteen builds

| Environment | Why it cannot be merged into another |
| --- | --- |
| `baseline` (default) | `[params.url_retirement]` is absent entirely, so this is the only build that shows what a site that configured nothing gets. A TOML overlay can add a table but never delete one, which is why the unconfigured state has to be `config/_default`. |
| `configured` | Every knob at once: hand-written rules, status `308`, a single trailing-slash spelling, extra manifest URLs. Every positive assertion about configuration is made here. |
| `degraded` | Every fault class at once, each on its own key. "N faults produce N diagnostics and none masks another" is provable only when they are present together, and it cannot live in `configured`, which has to stay silent. |
| `degraded-shapes` | The faults that cannot share a key with those: a key holds ONE value, so an unknown status and a table-shaped status are two builds. Misspelled booleans, a table given to the rules path, and `extra` entries that are not server-relative paths. |
| `conflict` | Its own content directory, in which THREE pages claim the same retired URL. Three rather than two: with a per-alias deduplication key, a second colliding pair would be suppressed as a duplicate of the first and one page would never be named. |
| `partial` | One document switched off while the other keeps publishing. The master switch turns both off together, so nothing else can tell the per-document switches from it. |
| `off` | `enable = false`. The only build that shows the module writing nothing at all while the site builds normally. |
| `multilingual` | The only shape in which one `_redirects` file is written by two languages and each manifest has a sibling to name. German also localizes `pagination.path` and paginates nothing past one pager, which is the only case where the first-pager segment comes from configuration rather than from a pager URL -- English, in the same build, derives its own. |
| `multilingual-partial` | The second language wires the format but switches its manifest off, so the sibling the first language's header would name is never written. Only a per-language read of the configuration can see this; the format wiring is identical in both. |
| `multilingual-subdir` | The default language moved into its own directory, which reverses the redirect Hugo runs between the site root and that language: `/` -> `/en/` instead of `/en/` -> `/`. It is the only build in which the retired URL is the site root, and therefore the only one that exercises the single-spelling case -- the bare form of `/` is the empty string, which no host matches. |
| `multihost` | A baseURL per language, so Hugo gives each one its own publish root and `root = true` resolves to a different path per language. The only build in which `/_redirects` is written once per HOST rather than once for the deployment, and therefore the only one in which a rule can be right for the file it landed in and wrong for the host serving it. It is also the only build where two languages legitimately resolve different `redirects` settings, and the only one carrying both a baseURL path and the language publish directory Hugo prefixes onto every alias -- German serves from `/docs`, so the two are different strings and a rule has to drop one while keeping the other. German keeps weight 1 and renders first, which is what makes the build check completeness rather than luck. |
| `subpath` | A baseURL carrying a path: the only shape in which a rule that keeps the base segment and one that drops it are different bytes. Two languages, because the default site's redirect is the one generated rule whose source path is built rather than read off a page, and this is the only build where it has a base segment to carry. |
| `canonify` | The same baseURL and the same two languages with `canonifyURLs`, under which `.RelPermalink` stops carrying that segment on its own. Paired with `subpath`, which it must match byte for byte. |
| `pagerpath` | `[pagination] path` renamed with nothing telling the module about it. Everywhere else the segment the module derives and the one it ships as a default are the same word, so this is the only build in which a rule proves the derivation happened -- and the only one where a single-pager list can be shown taking the segment another list in its language named. |
| `ugly` | `uglyURLs`, the only mode in which the URL Hugo reports for a page and the URL it serves that page at come apart: a list reports `/posts/index.html` while its first-pager stub is still published at the directory `/posts/page/1/`. A rule built by concatenation is visibly wrong here and nowhere else. |
| `html-last` | The home page's `[outputs]` list with html LAST instead of first. Two things are visible only here. Hugo's documentation calls the first entry the page's primary output format and the source of `.Permalink`, and this build shows html supplying the URL from the end of the list instead. And the manifest format's `weight`, which every other build reveals only through the pager URLs the html pass registers, reaches a URL in this one: below html's 10 the sitemap here offers `/url-manifest.txt` as the home page while `baseline`'s sitemap still reads `/`. Everything else about the tree is identical to `baseline`, which is exactly why nothing else can stand in for it. |
| `html-missing` | The same list with html dropped altogether, which is what Hugo's replace-not-append list semantics invite. The only build in which the home page has no html output at all, so every URL for it moves rather than the sitemap entry alone: the first format left supplies it and every link to the home page names `/url-manifest.txt`. It is the state the module README tells a consumer to avoid, and it is what makes the assertions on the other two builds capable of failing. |
| `hostile` | The only build that MUST FAIL: its content carries an alias containing whitespace, which would silently corrupt the file format. |

## What the specs cover

| Spec | Covers |
| --- | --- |
| `01-redirects.spec.js` | The generated rule set exactly: one rule per alias and one per registered first pager, per spelling, merged into one sorted set, each pointing at the page that owns it. A mixed-case alias keeps its case, a page without aliases contributes nothing, and the only rules pointing at the home page are its own pager's -- an alias among them is the shape the documented `$.RelPermalink` mistake produces. |
| `02-hand-rules.spec.js` | The site's own rules survive verbatim and come first, an authored rule is copied rather than rewritten, and `status` and `trailing_slash` reach the generated ones. |
| `03-manifest.spec.js` | The manifest lists exactly the URLs the build wrote to disk, derived by WALKING the tree rather than from a maintained list. Header count, sorting, uniqueness, secondary output formats, and the absence of a timestamp. |
| `04-no-stubs.spec.js` | No meta-refresh stub anywhere in the build, no rule source path published as a file, no `/page/1/`, and neither shape of the default site's redirect -- the states in which a generated rule would exist and never fire. Run against every multilingual build as well as the baseline, because the language stub cannot appear in a single-language tree. |
| `05-pagers.spec.js` | Paginated URLs are published, are in no sitemap, and are in the manifest. The premise is asserted, not assumed: if a future Hugo starts sitemapping them, the spec says so. Then the first pager of every registered paginator: a rule to its list page in both spellings, including the site root and a list that fits on one pager, with no rule for a list page that never paginated and no published file at any of those URLs to make the rule inert. |
| `06-degraded.spec.js` | One diagnostic per fault, each exactly once, no diagnostic nobody asked for, and every rejected value leaving the shipped default standing. |
| `07-off-and-hostile.spec.js` | A disabled module writes nothing while the site builds; a whitespace alias fails the build with a message naming both the alias and the page. |
| `08-multilingual.spec.js` | One redirect map carrying every language's aliases and first pagers, each pointing at its own translation and using its own pagination segment; one manifest per language, naming its siblings, listing its own language only, with pager registration scoped per language. Then the default site's redirect in both directions, named against the DEFAULT language rather than the first one by weight, absent from a single-language build, and emitted once when the retired URL is the root. |
| `09-subpath.spec.js` | Both sides of every rule carry the base segment -- including the default site's redirect, whose source path the module builds rather than reads -- every manifest URL carries it, and the subpath and canonified builds are byte-identical. |
| `10-readme.spec.js` | Every key the data file ships is documented in the module README, derived from the data file so a new key cannot arrive undocumented. |
| `11-validation.spec.js` | The validation surface the README promises: a misspelled boolean, a table where a path belongs and an `extra` entry that is not server-relative are each reported once and each leaves the default standing; one document switches off without taking the other; three pages claiming one alias produce one diagnostic naming all three; and a language publishing no manifest is not named as a sibling. |
| `12-multihost.spec.js` | One redirect map per host, each carrying its own language's aliases and pagers and none of the other's, with the publish directory Hugo prefixes onto an alias dropped from both languages -- the default one included -- and a baseURL path kept on both sides of every rule. Then the first-rendering host being complete, each host's own pagination segment and redirect status, no divergence diagnostic, no default-site redirect, no rule made inert by a published file, and per-host manifests naming their siblings by full URL and listing exactly what their own host wrote. |
| `13-primary-output-format.spec.js` | Which output format supplies the home page's URL, over the three builds whose `[outputs]` lists differ: the canonical, the link every regular page carries to the home page and the sitemap's entry for it are the html URL both where html leads the list and where it ends it, the reordering leaves the render passes alone, and a list with no html at all leaves no page at the site root while the link and the sitemap entry move onto the manifest. |

## What a future output format inherits from this

`13-primary-output-format.spec.js` answers a question no other spec here asks, and the answer belongs to Hugo rather than to this module: which of a page's output formats supplies the URL every other page, every canonical and every sitemap entry uses for it. Measured at v0.164.0, the html format does whenever the page has one -- unless a format is BOTH ahead of html in the site's `[outputs]` list and weighted to render before the html pass, which moves the sitemap's entry for that page and nothing else. A page with no html output takes its URL from the first entry left, and then all three surfaces move together.

So a new output format anywhere in this repository inherits two obligations, and a weight is only half of one of them. A non-zero weight below html's 10 is what makes a format capable of taking over a page's sitemap entry, so a format that takes one asserts the sitemap for the page kinds it is wired onto, in a build where html does not lead the list -- `baseline` cannot see it and `html-last` is what that build looks like. The other obligation is the shape of the list itself: a module that tells consumers to wire a format onto a page kind owes them what happens when html leaves that list, which is `html-missing`.

## Re-running one spec

The runner exports one `FIXTURE_PUBLIC_*` directory and one `HUGO_BUILD_LOG_*` file per environment, and the logs are kept after a successful run, so a single spec can be re-run against the trees already built:

```bash
node --test tests/03-manifest.spec.js
```
