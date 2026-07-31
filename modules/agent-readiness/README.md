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

**SITE-SCOPED keys are honored at the defaults and `[params.agent]` tiers only**, because they shape site-wide artifacts that must select the same page set no matter which page renders them: `enable`, `sections`, `exclude_noindex`, `exclude_search_page`, `search_page_path`, `skills`, every surface's own `enable` (`markdown.enable`, `llms.enable`, `facts.enable`, `skills_index.enable`), and the whole `robots` and `license` tables. Setting one of them lower down is a no-op and warns once; each surface's `enable` is site-scoped for the same reason as the master switch: these keys govern whether an artifact EXISTS, and a lower tier that switched one document off would leave every other surface still linking it with a URL that 404s. To remove a single page from every agent surface at once, use `agent: false` in its front matter.

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

Warnings are emitted for:

- a missing `data/agent-readiness/defaults.toml` -- the module is not mounted correctly;
- an unknown `robots.bots` key, which is skipped rather than emitted as a literal `User-agent` token that matches no crawler;
- a SITE-SCOPED key set in page front matter or at a call site, where it is discarded -- including `agent: {enable: false}`, which is **not** the per-page opt-out and does nothing (use `agent: false`);
- a non-map `agent:` front-matter value that is not the documented `false` shorthand;
- a duplicate permalink across two pages;
- a per-section front-matter key that collides with a key the twin builder emits itself;
- an `[[llms.sections]]` or `[[facts.sections]]` entry with an empty `section`, with no `name`, or matching no page -- each is skipped rather than published, because all three otherwise produce a plausible-looking document with the wrong contents;
- a bare value where a table belongs, in ANY array-of-tables key (`skills`, `llms.sections`, `llms.optional`, `facts.sections`, `facts.identity.rows`, and a contact page's channels) -- skipped rather than dropped, because a dropped entry publishes a surface indistinguishable from one the consumer never configured;
- a scalar written for a consumer sub-table (`facts.identity`, `facts.contact`) -- the whole block is ignored, because `[params.agent.facts] contact = '/contact'` is the natural mis-write of `[params.agent.facts.contact] page = '/contact'`;
- a `markdown.sitemap_section_target` that is not `llms`, `sitemap`, or `none`, and a `sitemap_section_target = 'llms'` whose `llmstxt` format is not wired to the home page;
- a `[params.agent.license]` with a `url` but no `name`, where the `llms.txt` line would render an empty link label;
- a skill whose remote source could not be fetched, whose fields are invalid, or whose `name` repeats another entry's;
- a scalar written where a list belongs (`robots.allow`, `robots.disallow`, `robots.bots`, `robots.bots_allow`, `robots.bots_disallow`, `robots.extra`, `llms.sections`, `llms.optional`, `facts.sections`, `frontmatter.<section>.keys`), which is read as a one-item list; and the two array-of-tables keys `skills` and `facts.identity.rows`, which are ignored;
- a non-numeric `[[llms.sections]] limit`, which is read as `0` (complete).

**Type mistakes are absorbed too, not raised.** A scalar written where a list belongs -- `bots = 'gptbot'` instead of `bots = ['gptbot']`, or `keys = 'title'` instead of `keys = ['title']` -- is read as a one-item list, and a non-numeric `limit` is read as `0`, meaning complete. Each emits one deduplicated warning naming the key and the offending value. This is not politeness: Go's `range` accepts no string, so an uncoerced scalar aborts template execution and **stops the consuming site's build** -- which is exactly what the contract above promises never to happen over this module's own configuration. A warning that names the key is strictly more useful than a template error that names a line in someone else's module.

**Values cannot restructure the line-oriented documents.** `robots.txt`, `llms.txt`, `about.md` and the twins' pointer section carry their meaning in how the text divides into lines, so every interpolated value has any embedded line break collapsed to a space before it joins its line -- a description authored as a multi-line YAML block scalar stays text of its own entry instead of becoming list entries or headings of the generated document, and a robots path value cannot inject a directive line. Inside a Markdown link, the text additionally gets its backslashes and brackets backslash-escaped and the destination gets its spaces and parentheses percent-encoded, so a title containing `]` or a URL containing `(...)` cannot end the link's own syntax early. Neither treatment changes a byte of a value that carries none of those characters. Two slots are deliberately verbatim, embedded line breaks included: `llms.notes`, the document's free-prose block, and `robots.extra`, the escape hatch for whole `robots.txt` lines.

## robots.txt

> **A site-level `layouts/robots.txt` overrides the module's with no warning and no build error.** Hugo's ordinary template lookup order puts the site's own file first, nothing reports the shadowing, and `--printPathWarnings` does not surface it either. A consuming site must delete its own `layouts/robots.txt` in the same change that imports this module, or the generator below is silently disabled forever while every other surface keeps working.

`robots.txt` requires `enableRobotsTXT = true` and needs no `[outputs]` wiring at all: Hugo appends the built-in `robots` output format to the home page whenever that flag is true, independently of the `outputs.home` list. It is the only artifact here with that property.

The generated file carries, in order: a catch-all `User-agent: *` group with the `Content-Signal` declaration inside it, one group per configured AI-crawler token, any verbatim extra lines, and the `Sitemap:` directive.

```toml
[params.agent.robots]
enable = true
allow = []
disallow = []
content_signal = 'search=yes, ai-train=yes, ai-input=yes'
bots = ['gptbot', 'oai_searchbot', 'claudebot', 'google_extended', 'ccbot']
bots_allow = []
bots_disallow = []
extra = []
sitemap = true
```

Defaults are permissive by construction: with no configuration at all the output is a directive-free `User-agent: *` group and the sitemap line, which RFC 9309 reads as fully permissive. No `Allow: /` ships either: an `Allow` and a `Disallow` of equal path length tie, and RFC 9309 (section 2.2.2) resolves the tie in favor of `Allow` -- Google's parser does the same -- so a shipped `Allow: /` would sit in every group and silently neutralize exactly the `bots_disallow = ['/']` a consumer writes to block a crawler. Every restriction is opt-in, because a `Disallow` shipped as a module default would deindex a consumer's site on the build after they imported the module.

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

```toml
[params.agent.markdown]
enable                = true    # SITE-SCOPED. False emits no twin at all, and both listings fall back to HTML URLs.
front_matter          = true    # Emit the leading YAML front-matter block.
canonical             = true    # Emit `canonical:` pointing at the page's HTML URL. Always the last key.
last_updated          = true    # Emit `last_updated:` when .Lastmod differs from .Date. See the precondition below.
license               = false   # Emit `license:` -- requires [params.agent.license] url.
sitemap_section       = true    # Append the trailing pointer section.
sitemap_section_target = 'llms' # 'llms' | 'sitemap' | 'none'. Case-folded; an unrecognized value warns.
```

Twins never enter `sitemap.xml`: Hugo's sitemap enumerates pages and emits one `<loc>` per page from `.Permalink`, so no secondary output format can appear in it.

### Body source

The body is `.RenderShortcodes` -- shortcodes expanded to their output, the surrounding Markdown left as Markdown. It is the only one of Hugo's four content accessors that yields a document that is both valid Markdown prose and complete: `.RawContent` leaves every shortcode call as unexpanded literal text, `.Content` renders the surrounding Markdown to HTML as well (an HTML document with a `.md` extension), and `.Plain` strips every tag and destroys headings, lists, links, and code fences.

Reconstructing Markdown from `.Content` is possible -- `transform.HTMLToMarkdown` exists as of Hugo v0.151.0 -- but it is the wrong tool here: it is still flagged experimental with an API that may change, and it would put the twin through a lossy Markdown to HTML to Markdown round trip whose output is a converter's opinion of the source rather than the source. `.RenderShortcodes` never leaves Markdown in the first place, so no round trip and no experimental dependency is needed.

**The documented consequence:** a twin of a shortcode-heavy page contains raw HTML blocks inline. That is valid CommonMark -- raw HTML is a first-class block type that every conformant parser passes through -- and for a page whose entire value is a rendered widget, the widget markup _is_ the content. Smoke-test one such page rather than discovering it later.

Relative links inside the body need no rewriting: `index.md` sits in the same published directory as `index.html`, so every relative reference resolves identically from either.

### Front matter

Every value is emitted through `jsonify`. JSON is a strict subset of YAML 1.2, so this produces a valid mapping entry for every possible value -- a title containing a colon, a description containing a `#`, a list of tags -- with no quoting logic and no escaping hazard. Consumers should expect quoted scalars, including dates: `period_from: "2025-02-01"`. A per-section key that is not a plain token of lowercase alphanumerics, `_` and `-` is emitted through the same `jsonify`, so a key carrying a line break or a colon becomes a double-quoted YAML key on one mapping line instead of restructuring the block.

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

### Twins are withheld per page, which a `rel="alternate"` emitter cannot see

The twin is withheld for a page carrying `agent: false`, for a `robots: noindex` page under the default `exclude_noindex = true`, for the search page, and for any page outside a configured `sections` allow-list. A withheld twin means **no file at all**, not an empty one.

The module's own surfaces all agree about this, because they share one filter. Anything outside the module cannot: Hugo's `.OutputFormats.Get "markdown"` answers "is this format wired for this page kind", which is a fact about your `[outputs]` lists, and there is no template API for "did that format publish bytes". So a generic `<link rel="alternate" type="text/markdown">` emitter -- including the `seo` module's `[seo.alternates]` allow-list -- will advertise a twin on pages that have none. If you run both modules, keep `[seo.alternates] formats` and `[params.agent] sections` describing the same page set, or leave `formats` unset and let `llms.txt` be the discovery surface for twins.

## llms.txt

Publishes `/llms.txt` through the module's `llmstxt` output format, wired by adding `llmstxt` to `[outputs] home`.

> **What this file is worth, stated plainly.** [llmstxt.org](https://llmstxt.org/) is a **community convention with no registration authority and no confirmed major-crawler consumer**. Independent analyses have found no measurable citation benefit. It must not be presented as an SEO, AEO, or citation lever, and this module does not present it as one.

Its real value here is narrower and real: the file is build-generated from the **same page collection** as `robots.txt`, the twins, and `/about.md`, through the one shared filter, so it cannot drift stale and cannot advertise a URL the twins never emit. It is a link index that points at the machine-readable forms; it carries no facts of its own -- the facts document does that.

```toml
[params.agent.llms]
enable = true
title = ''             # falls back to site.Title
summary = ''           # the one-line blockquote
notes = ''             # optional free prose
link_markdown = true   # link the twin rather than the HTML page
license = false

[[params.agent.llms.sections]]
name = 'Blog'
section = 'blog'
limit = 0              # 0 = complete

[[params.agent.llms.optional]]
name = 'Sitemap'
url = '/sitemap.xml'
note = 'Every published URL.'
```

The document is: exactly one H1 line, a blockquote summary, an optional blockquote license line, optional prose, one H2 per configured section listing `- [name](url): note` items, and a final `## Optional` heading. `Optional` is a protocol token fixed by the convention and is deliberately not translated.

**Every URL is absolute**, including the ones you write in `[[params.agent.llms.optional]]`: a site-relative value there is resolved against the full `baseURL` **including its path**, whether or not you write the leading slash, while anything carrying a scheme (`https:`, `mailto:`, `tel:`) or a protocol-relative `//` prefix passes through untouched. This file is routinely ingested detached from the URL it was fetched from, where a bare `/sitemap.xml` has no origin to resolve against. `/about.md` follows the same rule, and so does the `href` on each `[params.agent.facts.contact]` channel.

The "including its path" is load-bearing and is why the module normalizes rather than calling `absURL` directly: Hugo resolves a value that already begins with `/` against the protocol and host **only**, discarding the `baseURL` path. On a site at `https://example.org/docs/`, a naive `absURL "/sitemap.xml"` yields `https://example.org/sitemap.xml` -- a 404 -- while the correct result is `https://example.org/docs/sitemap.xml`.

**A section entry needs both `section` and `name`, and is skipped with a warning without them.** Both omissions fail invisibly otherwise. An empty `section` matches _every_ page, because the prefix test degenerates to "starts with `/`" -- so a single `sections =` for `section =` typo would publish the whole site under one heading and look deliberate. An entry with no `name` has no H2 to open, so its bullets land under the previous entry's heading, where every Markdown parser reads them as that section's links.

The `mediaType` is `text/plain`, not `text/markdown`, and that is deliberate: `text/markdown`'s suffixes are `md, mdown, markdown`, so it would publish `llms.md`. `root` is deliberately unset, so a multilingual site gets `/llms.txt` and `/ru/llms.txt` rather than one path every language overwrites.

The module ships **no `llms-full.txt`**: it duplicates page bodies the twins already publish at stable URLs, and carries real drift cost with no confirmed consumer.

## The facts document (`/about.md`)

Publishes `/about.md` through the `agentfacts` output format, wired by adding `agentfacts` to `[outputs] home`.

This is the one-fetch answer to "who is this, what can they do, what have they built, and how do I reach them". The twins answer "what does this page say"; `llms.txt` is a link index carrying no facts; and a home-page twin inherits whatever truncation the home template applies, because a typical home page renders first-N previews. None of the three answers the question in one fetch, complete.

**Facts sections have no `limit` key, by design.** A truncated facts index answers the question wrongly while appearing to answer it. Every page the shared filter admits for a section is listed.

The document **fabricates nothing**. Every value originates in front matter or config that already exists; there is no default text for an absent field and no inferred value anywhere. The identity rows and contact channels are read from **real content pages** named in config rather than retyped into config, so the document cannot drift away from the site it describes. A row whose key is absent from its page is omitted silently -- a missing optional fact is not an error.

```toml
[params.agent.facts]
enable = true
title = ''
summary = ''
link_markdown = true
sitemap_section = true

[[params.agent.facts.sections]]
name = 'Projects'
section = 'projects'          # no limit key: complete by design

[params.agent.facts.identity]
page = '/'

[[params.agent.facts.identity.rows]]
label = 'Role'
key = 'main_subtitle'

[params.agent.facts.contact]
page = '/contact'
key = 'channels'
label_field = 'label'
value_field = 'value'
url_field = 'href'
```

Each section entry emits one **top-level** bullet per page carrying its title, HTML URL, and twin URL, then one indented bullet per key in the same `[params.agent.frontmatter.<section>]` map the twins use -- so both surfaces describe a page with one vocabulary. The `present` sentinel is rendered here as the prose it is, deliberately unlike the twin front matter, which omits it: this document is read as prose, and "present" is a true and useful thing to say about an open-ended range.

### Exactly one producer of `/about.md` per site

A consuming site that ships its own facts document at `/about.md` must **not** also list `agentfacts` in `outputs.home`. The two would collide on one published path, with the last writer winning and **no build error**.

The module's renderer is deliberately simpler than a site-specific one: it groups nothing, applies no sentinel-omission rules, and links no external artifacts. A consumer whose vocabulary needs grouping or sentinel handling should write its own output format and leave `agentfacts` unwired.

The published path collides with a consumer's own content only if that consumer publishes a page to exactly `about.md` at the site root, which requires `uglyURLs` plus a root-level `about` page; a conventional `content/about.md` publishes to `about/index.html` and does not collide.

## Agent Skills index

Publishes `/.well-known/agent-skills/index.json`, plus one republished `/.well-known/agent-skills/<name>/SKILL.md` per indexed skill, through the `agentskills` output format.

> **Draft status.** The Agent Skills **discovery layer** (v0.2.0) is a Cloudflare-authored **draft RFC that may change incompatibly**. The `SKILL.md` format underneath it is the mature layer and is unaffected. This module is released on a `v0.x` line for exactly that reason, and `skills_index.schema` is a config key so a consumer can point at a newer schema without a module change.

```toml
[params.agent.skills_index]
enable = true
schema = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'

[[params.agent.skills]]
name = 'my-skill'
description = '<verbatim from the SKILL.md description front matter>'
source = 'https://raw.githubusercontent.com/owner/repo/<commit SHA>/skills/my-skill/SKILL.md'
```

### The digest contract

Each `source` is fetched at build time and **republished same-origin**, and the `sha256` digest is computed from the bytes of that published copy -- not from an upstream snapshot. There is no separate hashing step to fall out of sync, so the advertised hash and the served bytes can never disagree.

Three consequences a consumer must understand:

- **Pin `source` to a commit SHA, never a branch ref.** A branch moves, and a moved branch means the digest published last build describes bytes that have since changed.
- **A build-time remote fetch runs inside the consuming site's render clock** and counts against its build timeout budget.
- **An entry whose digest does not match the served bytes fails closed** for any agent that verifies it, which is strictly worse than publishing nothing. Every failure path therefore omits the entry: a fetch error, an HTTP 404 (which `resources.GetRemote` reports as a nil resource rather than an error), or a field-validation failure each emit one deduplicated warning and drop that skill.

**With zero valid skills, no file is emitted at all.** An empty JSON shell at a `.well-known` path is a claim of a capability that does not exist.

The index also gates on `site.Language.IsDefault`, because this format sets `root = true`, which pins one path for every language; a multilingual site emits the index once, from the default language.

Field rules, validated before the fetch so a malformed entry costs no round trip: `name` is 1-64 characters of lowercase alphanumerics and hyphens with no leading, trailing, or consecutive hyphen (it becomes a published path segment) and must be **unique** across the array; `description` is 1-1024 characters and should be copied verbatim from the skill's own `description` front matter rather than paraphrased; `source` must be absolute.

Uniqueness is enforced for the same reason the digest is: the name is the sole path segment a skill is republished under, so two entries sharing one would resolve to a single published file carrying whichever bytes were copied last, while the index advertised two entries with two different digests for it. At least one of those digests could not match the bytes served at its own URL -- which a verifying agent is entitled to read as tampering. The duplicate is skipped with a warning rather than published.

### Index length is a curation decision, not a completeness metric

The module accepts any number of entries and imposes no minimum. A consuming site should publish only the skills a fetching agent can **actually use on its own**: a repository holding several `SKILL.md` artifacts may correctly publish exactly one, and an artifact that is a component of a larger environment configuration is meaningless standalone and belongs out of the index. Record the exclusion and its reason in your own documentation, so the gap between the repository's artifact count and the index length reads as a decision rather than a defect.

## Content license

One statement of the license covering the site's editorial content, read by the twins' `license:` front-matter key and by the `llms.txt` license line. It is SITE-SCOPED and **ships inert**: every value is empty, so nothing is emitted until a consumer fills it in, and the two switches that consume it default to `false`.

```toml
[params.agent.license]
name = 'CC BY 4.0'                                        # human label
url  = 'https://creativecommons.org/licenses/by/4.0/'     # absolute deed or legal-code URL
spdx = 'CC-BY-4.0'                                        # SPDX identifier; reserved for consumers, emitted nowhere today

[params.agent.markdown]
license = true    # emit `license:` in twin front matter

[params.agent.llms]
license = true    # emit the license blockquote line in llms.txt
```

`url` is required by both surfaces: with it empty nothing is emitted at all, whatever the switches say. `name` is required by the `llms.txt` line specifically, which renders as `> Content licensed under [name](url).` -- guarding on the URL alone would publish a Markdown link with an empty label, so a missing `name` warns once and the line is withheld. `spdx` is carried for consumers that want a machine identifier; this module emits it nowhere.

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
│   ├── home.llmstxt.txt
│   ├── home.agentfacts.md
│   ├── home.agentskills.json
│   └── _partials/
│       └── agent-readiness/
│           ├── config.html
│           ├── page-list.html
│           ├── robots.html
│           ├── markdown-front-matter.html
│           ├── markdown-page.html
│           ├── llms.html
│           ├── facts.html
│           ├── skills.html
│           └── lib/
│               ├── absolute-url.html
│               ├── flatten-value.html
│               ├── inline.html
│               ├── map-list.html
│               ├── markdown-link.html
│               ├── page-excluded.html
│               ├── section.html
│               └── warn.html
├── test/                       # Validation suite: twelve Hugo fixture builds plus Node build-output assertions. See test/README.md.
├── go.mod
├── hugo.toml
└── README.md
```

`test/` ships inside the module, as it does for every other module in this repository. Run it with `bash modules/agent-readiness/test/run-tests.sh` (or `run-tests.cmd` on Windows).
