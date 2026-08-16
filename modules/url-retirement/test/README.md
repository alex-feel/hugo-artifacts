# url-retirement module test suite

Build-output assertions over the two documents this module publishes. The runner builds `./fixture` eight times and the specs read the published bytes; nothing is mocked, and no assertion is made against a template.

## Prerequisites

Hugo (extended not required) and Node.js v22 or newer on `PATH`. The suite has no dependencies of its own -- `node --test` and `node:assert` are enough -- so there is nothing to install.

## Running

```bash
bash run-tests.sh          # macOS, Linux, Git Bash
run-tests.cmd              # Windows
```

Either script refuses to start while a `hugo` process is running, removes `fixture/public`, builds every environment, and fails on any deprecation or error in any build log. Every build except `degraded` must also be silent: a warning there is a failure.

## The eight builds

| Environment | Why it cannot be merged into another |
| --- | --- |
| `baseline` (default) | `[params.url_retirement]` is absent entirely, so this is the only build that shows what a site that configured nothing gets. A TOML overlay can add a table but never delete one, which is why the unconfigured state has to be `config/_default`. |
| `configured` | Every knob at once: hand-written rules, status `308`, a single trailing-slash spelling, extra manifest URLs. Every positive assertion about configuration is made here. |
| `degraded` | Every fault class at once, each on its own key. "N faults produce N diagnostics and none masks another" is provable only when they are present together, and it cannot live in `configured`, which has to stay silent. |
| `off` | `enable = false`. The only build that shows the module writing nothing at all while the site builds normally. |
| `multilingual` | The only shape in which one `_redirects` file is written by two languages and each manifest has a sibling to name. |
| `subpath` | A baseURL carrying a path: the only shape in which a rule that keeps the base segment and one that drops it are different bytes. |
| `canonify` | The same baseURL with `canonifyURLs`, under which `.RelPermalink` stops carrying that segment on its own. Paired with `subpath`, which it must match byte for byte. |
| `hostile` | The only build that MUST FAIL: its content carries an alias containing whitespace, which would silently corrupt the file format. |

## What the specs cover

| Spec | Covers |
| --- | --- |
| `01-redirects.spec.js` | The generated rule set exactly: one rule per alias per spelling, sorted, each pointing at the page that carries it. A mixed-case alias keeps its case, a page without aliases contributes nothing, and no rule points at the home page -- the shape the documented `$.RelPermalink` mistake produces. |
| `02-hand-rules.spec.js` | The site's own rules survive verbatim and come first, an authored rule is copied rather than rewritten, and `status` and `trailing_slash` reach the generated ones. |
| `03-manifest.spec.js` | The manifest lists exactly the URLs the build wrote to disk, derived by WALKING the tree rather than from a maintained list. Header count, sorting, uniqueness, secondary output formats, and the absence of a timestamp. |
| `04-no-stubs.spec.js` | No meta-refresh stub anywhere in the build, no alias path published as a file, and no `/page/1/` -- the three states in which a generated rule would exist and never fire. |
| `05-pagers.spec.js` | Paginated URLs are published, are in no sitemap, and are in the manifest. The premise is asserted, not assumed: if a future Hugo starts sitemapping them, the spec says so. |
| `06-degraded.spec.js` | One diagnostic per fault, each exactly once, no diagnostic nobody asked for, and every rejected value leaving the shipped default standing. |
| `07-off-and-hostile.spec.js` | A disabled module writes nothing while the site builds; a whitespace alias fails the build with a message naming both the alias and the page. |
| `08-multilingual.spec.js` | One redirect map carrying every language's aliases, each pointing at its own translation; one manifest per language, naming its siblings, listing its own language only, with pager registration scoped per language. |
| `09-subpath.spec.js` | Both sides of every rule carry the base segment, every manifest URL carries it, and the subpath and canonified builds are byte-identical. |
| `10-readme.spec.js` | Every key the data file ships is documented in the module README, derived from the data file so a new key cannot arrive undocumented. |

## Re-running one spec

The runner exports one `FIXTURE_PUBLIC_*` directory and one `HUGO_BUILD_LOG_*` file per environment, and the logs are kept after a successful run, so a single spec can be re-run against the trees already built:

```bash
node --test tests/03-manifest.spec.js
```
