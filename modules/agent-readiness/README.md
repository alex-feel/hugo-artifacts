# agent-readiness

Universal agent-readiness module for Hugo: it publishes the agent-facing representations of a site your HTML already describes -- a generated `robots.txt` carrying an AI-crawler token registry and a `Content-Signal` declaration, per-page Markdown twins, an `llms.txt` link index, an aggregated `/about.md` facts document, and a `/.well-known/agent-skills/` discovery index.

The module ships **no CSS, no JavaScript, and no visual surface at all**. It publishes representations, not markup: nothing it emits is rendered in a browser, so there is nothing to style and nothing to theme. Every surface is driven by a Hugo output format and a shared page-selection filter, so `robots.txt`, the twins, `llms.txt`, and `/about.md` can never disagree about which pages of the site exist.

Every value the module publishes is read from configuration or from front matter that already exists. The module derives no prose from any other prose, infers no facts, and fabricates nothing.

## Installation

Add the module to your site configuration:

```toml
[module]

  [[module.imports]]
    path = 'github.com/alex-feel/hugo-artifacts/modules/agent-readiness'
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/agent-readiness
```

**Delete your site's own `layouts/robots.txt` in the same change.** A site-level `layouts/robots.txt` overrides the module's with no warning and no build error, so leaving it in place silently disables the entire `robots.txt` feature.

A site-level template always overrides the module's, by Hugo's ordinary template lookup order. That applies to every template here: a local `layouts/page.markdown.md`, `layouts/home.llmstxt.txt`, or `layouts/home.agentskills.json` takes precedence over the module's.

## Requirements

- **Hugo v0.160.0+**, any edition. The module uses no extended-edition-exclusive feature.
- **Go 1.22+**, for Hugo module resolution.

## Usage

The site calls **no** `agent-readiness` partial directly. Every surface the module publishes is output-format-driven, so the entire wiring is the module import, the `[outputs]` lists, the `[params.agent]` configuration block, and the deletion of the site's own `layouts/robots.txt`.

Hugo does not merge a module's `[outputs]` configuration into the site's, and a site-level `[outputs]` key **replaces** the default list for that page kind rather than extending it. Every format below must therefore be wired by the consuming site, restating every entry that is already there:

```toml
[outputs]
home = ['HTML', 'RSS', 'markdown', 'llmstxt', 'agentfacts', 'agentskills']
page = ['HTML', 'markdown']
section = ['HTML', 'RSS', 'markdown']
```

`robots.txt` is the single exception: Hugo appends the built-in `robots` output format to the home page whenever `enableRobotsTXT = true`, independently of the `outputs.home` list.

Hugo's defaults for the kinds above are `home = ['html', 'rss']` and `section = ['html', 'rss']`, so restating `HTML` and `RSS` is what keeps every existing feed alive. Dropping `RSS` from the `section` line silently deletes every section feed with no error.

## Parameters

Configuration lives under `[params.agent]`. Data files and partials live under the `agent-readiness` namespace (`index hugo.Data "agent-readiness"`, `partial "agent-readiness/config.html"`). The two namespaces are deliberately different: `params.agent` is short because it is typed at every key, while `hugo.Data` and `layouts/_partials/` are each a single namespace merged across every mounted module plus the consuming site's own tree, where a short generic key would be materially more collision-prone.

Values resolve through a four-tier cascade, highest precedence first:

1. Call-site args
2. Page front matter `agent:` map
3. Site config `[params.agent]`
4. `data/agent-readiness/defaults.toml` (module defaults)

Presence wins at every tier, so an explicit `false` or empty value overrides the tier below it. Nested maps (`robots`, `markdown`, `llms`, `facts`, `skills_index`, `frontmatter`, `license`) merge tier by tier rather than replacing, so overriding one key inside `[params.agent.markdown]` keeps the shipped values for the rest. Slice-valued keys are replaced, never combined.

**SITE-SCOPED keys are honored at the defaults and `[params.agent]` tiers only**, because they shape site-wide artifacts that must select the same page set no matter which page renders them: `enable`, `sections`, `exclude_noindex`, `exclude_search_page`, `search_page_path`, `skills`, and the whole `robots` and `license` tables.

### Top-level keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `enable` | bool | `true` | Master switch (SITE-SCOPED). False emits no agent surface at all. |
| `sections` | list | `[]` | Section allow-list (SITE-SCOPED). Empty admits every regular page. |
| `exclude_noindex` | bool | `true` | Skip pages whose `robots` front matter contains `noindex` (SITE-SCOPED). |
| `exclude_search_page` | bool | `true` | Skip the dedicated search page (SITE-SCOPED). |
| `search_page_path` | string | `"/search"` | Path of that search page (SITE-SCOPED). |

### Section identifiers

Section identifiers are accepted in two authored shapes and both resolve identically. The top-level `sections` allow-list is authored path-shaped, and the per-entry `section` values under `[[llms.sections]]` and `[[facts.sections]]` are authored as bare names:

```toml
[params.agent]
sections = ['/blog', 'projects/']      # path-shaped

[[params.agent.llms.sections]]
name = 'Blog'
section = 'blog'                        # bare name
```

Every one of `blog`, `/blog`, `blog/`, `/blog/`, and `Blog` normalizes to `/blog`, which the shared filter then matches at segment boundaries, so `docs` never matches `/docs-internal/`. Both shapes pass through the same normalization routine in `agent-readiness/config.html`, so a mismatch cannot render an empty section: an unnormalized identifier would produce an empty H2 with no warning, no error, and exit 0.

The sentinel `sections = ['mainSections']` (any case) expands to `site.MainSections`.

### Per-page opt-out

A page opts out of every agent surface at once with the module's own front-matter key:

```yaml
agent: false
```

or, equivalently:

```yaml
agent:
  exclude: true
```

**Do not reach for `outputs: ['HTML']` as a per-page opt-out.** Hugo's front-matter `outputs` field _appends to_ the project's configured outputs for that page kind -- it does not replace them -- so a page-level `outputs` list cannot subtract a format the site config added. The twin is still emitted and the failure is completely silent.

The opt-out is honored by the shared page filter, so an opted-out page disappears from its Markdown twin, from `llms.txt`, and from `/about.md` together.

### Validation

The module never fails a build over its own configuration. Every misconfiguration degrades to a smaller correct document and emits exactly one deduplicated `WARN` per offending value per build, because a build that stops over a `robots.txt` token typo is worse than a `robots.txt` missing one group.

Warnings are emitted for: a missing `data/agent-readiness/defaults.toml` (the module is not mounted correctly); an unknown `bots` key; a non-map `agent:` front-matter value that is not the documented `false` shorthand; a duplicate permalink across two pages; a per-section front-matter key that collides with a key the twin builder emits itself; and a skill whose remote source could not be fetched or whose fields are invalid.

## robots.txt

> **A site-level `layouts/robots.txt` overrides the module's with no warning and no build error.** Hugo's ordinary template lookup order puts the site's own file first, nothing reports the shadowing, and `--printPathWarnings` does not surface it either. A consuming site must delete its own `layouts/robots.txt` in the same change that imports this module, or the generator below is silently disabled forever while every other surface keeps working.

`robots.txt` requires `enableRobotsTXT = true` and needs no `[outputs]` wiring at all: Hugo appends the built-in `robots` output format to the home page whenever that flag is true, independently of the `outputs.home` list. It is the only artifact here with that property.

The generated file carries, in order: a catch-all `User-agent: *` group with the `Content-Signal` declaration inside it, one group per configured AI-crawler token, any verbatim extra lines, and the `Sitemap:` directive.

```toml
[params.agent.robots]
enable = true
allow = ['/']
disallow = []
content_signal = 'search=yes, ai-train=yes, ai-input=yes'
bots = ['gptbot', 'oai_searchbot', 'claudebot', 'google_extended', 'ccbot']
bots_allow = ['/']
bots_disallow = []
extra = []
sitemap = true
```

Defaults are permissive by construction: with no configuration at all the output is `User-agent: *`, `Allow: /`, and the sitemap line. Every restriction is opt-in, because a `Disallow` shipped as a module default would deindex a consumer's site on the build after they imported the module.

### The crawler registry

`bots` entries are **keys into `data/agent-readiness/bots.toml`**, not raw user-agent strings, so a vendor renaming a token is a module update rather than an edit in every consuming site. The registry ships 21 entries: `gptbot`, `oai_searchbot`, `chatgpt_user`, `oai_adsbot`, `claudebot`, `claude_user`, `claude_searchbot`, `google_extended`, `perplexitybot`, `perplexity_user`, `applebot_extended`, `meta_externalagent`, `meta_externalfetcher`, `amazonbot`, `bytespider`, `ccbot`, `diffbot`, `cohere_ai`, `timpibot`, `omgilibot`, `imagesiftbot`.

An unknown key emits one deduplicated warning and is skipped -- never emitted as a literal, because a registry key in a `User-agent:` line matches no crawler and silently does nothing. A site extends the registry by shadowing `data/agent-readiness/bots.toml` in its own `data/` tree.

Two retired Anthropic tokens, `Claude-Web` and `anthropic-ai`, are deliberately absent and must not be added: they match nothing today, so a rule naming them merely looks current. `Google-Extended` is a `robots.txt` **control token only** -- it is never a crawler user-agent and must never be confused with `Googlebot`.

`Content-Signal` is Cloudflare's [contentsignals.org](https://contentsignals.org/) convention -- comma-delimited `category=yes|no` pairs placed inside the relevant `User-agent:` group. **It is not an IETF standard.** The IETF AIPREF working-group documents use different field names and have not shipped. Do not present it as standardized.

The module makes **no claim** about multilingual `robots.txt` behavior: Hugo's handling of the `root = true` robots format across languages is not documented upstream and is not tested here.

## Markdown twins

Each page gets a plain-Markdown representation published beside its HTML, at `<page>/index.md`, through Hugo's **built-in `markdown` output format**. The module deliberately does not declare that format or the `text/markdown` media type -- both are built in, and redefining either is a defect.

```toml
[outputs]
page = ['HTML', 'markdown']
section = ['HTML', 'RSS', 'markdown']
```

A site-level `[outputs] <kind>` key **replaces** Hugo's default list for that kind rather than extending it, so `HTML` and `RSS` must be restated to keep every existing feed. The module ships `home.markdown.md` and `section.markdown.md` alongside `page.markdown.md` precisely so a consumer who wires `markdown` into those kinds does not get Hugo's `WARN found no layout file` on every build.

Twins never enter `sitemap.xml`: Hugo's sitemap enumerates pages and emits one `<loc>` per page from `.Permalink`, so no secondary output format can appear in it.

### Body source

The body is `.RenderShortcodes` -- shortcodes expanded to their output, the surrounding Markdown left as Markdown. It is the only one of Hugo's four content accessors that yields a document that is both valid Markdown prose and complete: `.RawContent` leaves every shortcode call as unexpanded literal text, `.Content` renders the surrounding Markdown to HTML as well (an HTML document with a `.md` extension), and `.Plain` strips every tag and destroys headings, lists, links, and code fences. Hugo has no HTML-to-Markdown template function, so this is not the best of four options -- it is the only correct one.

**The documented consequence:** a twin of a shortcode-heavy page contains raw HTML blocks inline. That is valid CommonMark -- raw HTML is a first-class block type that every conformant parser passes through -- and for a page whose entire value is a rendered widget, the widget markup _is_ the content. Smoke-test one such page rather than discovering it later.

Relative links inside the body need no rewriting: `index.md` sits in the same published directory as `index.html`, so every relative reference resolves identically from either.

### Front matter

Every value is emitted through `jsonify`. JSON is a strict subset of YAML 1.2, so this produces a valid mapping entry for every possible value -- a title containing a colon, a description containing a `#`, a list of tags -- with no quoting logic and no escaping hazard. Consumers should expect quoted scalars, including dates: `period_from: "2025-02-01"`.

Fields are emitted in a fixed order:

| Order | Key                  | Emitted when                                                      |
| ----- | -------------------- | ----------------------------------------------------------------- |
| 1     | `title`              | always                                                            |
| 2     | `description`        | non-empty                                                         |
| 3     | `date`               | set (RFC 3339)                                                    |
| 4     | `last_updated`       | `markdown.last_updated` and `.Lastmod` differs from `.Date`       |
| 5     | the per-section keys | declared in `[params.agent.frontmatter.<section>]`, in that order |
| 6     | `license`            | `markdown.license` and `license.url` is set                       |
| 7     | `canonical`          | `markdown.canonical` -- **always last**                           |

`canonical` carries the page's HTML URL, which is free and correct because the built-in `markdown` format sets `permalinkable = false`, so `.Permalink` inside the twin's own template already returns the HTML URL.

Declare the per-section vocabulary the site actually uses:

```toml
[params.agent.frontmatter.projects]
keys = ['project_name', 'status', 'period_from', 'period_to', 'repository']
```

**A section map must not repeat `title`, `description`, `date`, `last_updated`, `license`, or `canonical`.** The builder emits those itself, skips any per-section key that repeats one, and warns once per `<section>/<key>` pair. This is not politeness: YAML 1.2 makes two equal keys in one mapping node an error, so strict parsers reject the whole document and lenient ones silently keep one value -- a single duplicated `title` would make every twin in that section unreadable to exactly the tooling twins exist for.

A key absent from a page is omitted, never emitted as an empty string or `null`. A key whose value is the string sentinel `present` is also omitted: it is a display convention for an open-ended range, and the literal string is not a date and must never reach a machine surface.

### `last_updated` accuracy precondition

`last_updated` is `.Lastmod`, which is a real per-file git date only when the consuming site sets `enableGitInfo = true` **and its build environment has full per-file commit history**. A CI runner that performs a shallow clone gives Hugo no history, so every `.Lastmod` collapses to the build timestamp and every twin claims the same modification date.

The fix belongs in the CI build command -- fetch the full history before building, as `git fetch --unshallow && <build>` does. A front-matter `lastmod` fallback and suppressing the field are both rejected: the fallback would discard a working signal everywhere the history _is_ present.

### Per-page opt-out

Use `agent: false`, never `outputs: ['HTML']`. See [Per-page opt-out](#per-page-opt-out) above for why the `outputs` route silently does nothing.

## i18n

The module authors exactly four user-facing strings, all of them headings in generated documents. English and Russian ship with the module; every lookup carries an English fallback, so a site whose language ships no translation still renders a real heading rather than an empty string.

| Key                            | English    |
| ------------------------------ | ---------- |
| `agent_sitemap_heading`        | `Sitemap`  |
| `agent_facts_title`            | `About`    |
| `agent_facts_identity_heading` | `Identity` |
| `agent_facts_contact_heading`  | `Contact`  |

`## Optional` in `llms.txt` is deliberately not a translation key: it is fixed by the llmstxt.org convention and is a protocol token, not prose.

## Non-goals

The module deliberately owns **no identity record, resolver, or validator**. A person record's contract is a list of the consuming site's own config paths, which no second site shares, and the module's only would-be consumer of such a record is the `agentfacts` document. A consuming site that wants build-time identity coherence implements it site-side; the module's `[facts.identity]` rows read a real content page and remain the module's own mechanism.

The module ships no `llms-full.txt`, no taxonomy or term twins, no `Accept`-header content negotiation, no CSS, and no JavaScript.

## Module Structure

```text
modules/agent-readiness/
├── data/
│   └── agent-readiness/
│       ├── defaults.toml
│       └── bots.toml
├── i18n/
│   ├── en.toml
│   └── ru.toml
├── layouts/
│   ├── robots.txt
│   ├── home.markdown.md
│   ├── page.markdown.md
│   ├── section.markdown.md
│   └── _partials/
│       └── agent-readiness/
│           ├── config.html
│           ├── page-list.html
│           ├── robots.html
│           ├── markdown-front-matter.html
│           ├── markdown-page.html
│           └── lib/
│               ├── page-excluded.html
│               ├── section.html
│               └── warn.html
├── go.mod
├── hugo.toml
└── README.md
```
