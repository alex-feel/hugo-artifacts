# url-retirement module test suite

Build-output assertions over the two documents this module publishes. The runner builds `./fixture` fourteen times and the specs read the published bytes; nothing is mocked, and no assertion is made against a template.

## Prerequisites

Hugo (extended not required) and Node.js v22 or newer on `PATH`. The suite has no dependencies of its own -- `node --test` and `node:assert` are enough -- so there is nothing to install.

## Running

```bash
bash run-tests.sh          # macOS, Linux, Git Bash
run-tests.cmd              # Windows
```

Either script refuses to start while a `hugo` process is running, removes `fixture/public`, builds every environment, and fails on any deprecation or error in any build log. Every build except `degraded`, `degraded-shapes` and `conflict` must also be silent: a warning there is a failure, and those three exist to produce the diagnostics the specs read.

## The fourteen builds

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
| `subpath` | A baseURL carrying a path: the only shape in which a rule that keeps the base segment and one that drops it are different bytes. |
| `canonify` | The same baseURL with `canonifyURLs`, under which `.RelPermalink` stops carrying that segment on its own. Paired with `subpath`, which it must match byte for byte. |
| `pagerpath` | `[pagination] path` renamed with nothing telling the module about it. Everywhere else the segment the module derives and the one it ships as a default are the same word, so this is the only build in which a rule proves the derivation happened -- and the only one where a single-pager list can be shown taking the segment another list in its language named. |
| `ugly` | `uglyURLs`, the only mode in which the URL Hugo reports for a page and the URL it serves that page at come apart: a list reports `/posts/index.html` while its first-pager stub is still published at the directory `/posts/page/1/`. A rule built by concatenation is visibly wrong here and nowhere else. |
| `hostile` | The only build that MUST FAIL: its content carries an alias containing whitespace, which would silently corrupt the file format. |

## What the specs cover

| Spec | Covers |
| --- | --- |
| `01-redirects.spec.js` | The generated rule set exactly: one rule per alias and one per registered first pager, per spelling, merged into one sorted set, each pointing at the page that owns it. A mixed-case alias keeps its case, a page without aliases contributes nothing, and the only rules pointing at the home page are its own pager's -- an alias among them is the shape the documented `$.RelPermalink` mistake produces. |
| `02-hand-rules.spec.js` | The site's own rules survive verbatim and come first, an authored rule is copied rather than rewritten, and `status` and `trailing_slash` reach the generated ones. |
| `03-manifest.spec.js` | The manifest lists exactly the URLs the build wrote to disk, derived by WALKING the tree rather than from a maintained list. Header count, sorting, uniqueness, secondary output formats, and the absence of a timestamp. |
| `04-no-stubs.spec.js` | No meta-refresh stub anywhere in the build, no alias path published as a file, and no `/page/1/` -- the three states in which a generated rule would exist and never fire. |
| `05-pagers.spec.js` | Paginated URLs are published, are in no sitemap, and are in the manifest. The premise is asserted, not assumed: if a future Hugo starts sitemapping them, the spec says so. Then the first pager of every registered paginator: a rule to its list page in both spellings, including the site root and a list that fits on one pager, with no rule for a list page that never paginated and no published file at any of those URLs to make the rule inert. |
| `06-degraded.spec.js` | One diagnostic per fault, each exactly once, no diagnostic nobody asked for, and every rejected value leaving the shipped default standing. |
| `07-off-and-hostile.spec.js` | A disabled module writes nothing while the site builds; a whitespace alias fails the build with a message naming both the alias and the page. |
| `08-multilingual.spec.js` | One redirect map carrying every language's aliases and first pagers, each pointing at its own translation and using its own pagination segment; one manifest per language, naming its siblings, listing its own language only, with pager registration scoped per language. |
| `09-subpath.spec.js` | Both sides of every rule carry the base segment, every manifest URL carries it, and the subpath and canonified builds are byte-identical. |
| `10-readme.spec.js` | Every key the data file ships is documented in the module README, derived from the data file so a new key cannot arrive undocumented. |
| `11-validation.spec.js` | The validation surface the README promises: a misspelled boolean, a table where a path belongs and an `extra` entry that is not server-relative are each reported once and each leaves the default standing; one document switches off without taking the other; three pages claiming one alias produce one diagnostic naming all three; and a language publishing no manifest is not named as a sibling. |

## Re-running one spec

The runner exports one `FIXTURE_PUBLIC_*` directory and one `HUGO_BUILD_LOG_*` file per environment, and the logs are kept after a successful run, so a single spec can be re-run against the trees already built:

```bash
node --test tests/03-manifest.spec.js
```
