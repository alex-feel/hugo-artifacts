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

**Do not reach for `outputs: ['HTML']` as a per-page opt-out.** Hugo's front-matter `outputs` field *appends to* the project's configured outputs for that page kind -- it does not replace them -- so a page-level `outputs` list cannot subtract a format the site config added. The twin is still emitted and the failure is completely silent.

The opt-out is honored by the shared page filter, so an opted-out page disappears from its Markdown twin, from `llms.txt`, and from `/about.md` together.

### Validation

The module never fails a build over its own configuration. Every misconfiguration degrades to a smaller correct document and emits exactly one deduplicated `WARN` per offending value per build, because a build that stops over a `robots.txt` token typo is worse than a `robots.txt` missing one group.

Warnings are emitted for: a missing `data/agent-readiness/defaults.toml` (the module is not mounted correctly); an unknown `bots` key; a non-map `agent:` front-matter value that is not the documented `false` shorthand; a duplicate permalink across two pages; a per-section front-matter key that collides with a key the twin builder emits itself; and a skill whose remote source could not be fetched or whose fields are invalid.

## i18n

The module authors exactly four user-facing strings, all of them headings in generated documents. English and Russian ship with the module; every lookup carries an English fallback, so a site whose language ships no translation still renders a real heading rather than an empty string.

| Key | English |
| --- | --- |
| `agent_sitemap_heading` | `Sitemap` |
| `agent_facts_title` | `About` |
| `agent_facts_identity_heading` | `Identity` |
| `agent_facts_contact_heading` | `Contact` |

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
│   └── _partials/
│       └── agent-readiness/
│           ├── config.html
│           ├── page-list.html
│           └── lib/
│               ├── section.html
│               └── warn.html
├── go.mod
├── hugo.toml
└── README.md
```
