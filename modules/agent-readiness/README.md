# agent-readiness

Universal agent-readiness module for Hugo: it publishes the agent-facing representations of a site your HTML already describes -- a generated `robots.txt` carrying an AI-crawler token registry and a `Content-Signal` declaration, per-page Markdown twins, a compact `llms.txt` link index beside a complete `/llms-index.txt` one, an aggregated `/about.md` facts document, and a `/.well-known/agent-skills/` discovery index.

The module ships **no CSS, no JavaScript, and no visual surface at all**. It publishes representations, not markup: nothing it emits is rendered in a browser, so there is nothing to style and nothing to theme. Every surface is driven by a Hugo output format and a shared page-selection filter, so `robots.txt`, the twins, both link indexes, and `/about.md` can never disagree about which pages of the site exist.

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

**Publishing an Agent Skill as an archive needs one line of site-level security configuration**, because Hugo refuses to fetch a media type it was not told to accept and **a module cannot ship that setting on your behalf** -- Hugo ignores `security` configuration coming from a module. See [The `[security.http]` allow-list an archive needs](#the-securityhttp-allow-list-an-archive-needs). Nothing else in this module requires it.

A site-level template always overrides the module's, by Hugo's ordinary template lookup order. That applies to every template here: a local `layouts/page.markdown.md`, `layouts/home.llmstxt.txt`, or `layouts/home.agentskills.json` takes precedence over the module's.

### Combining this module with other modules that wire output formats

Your site configuration holds exactly ONE `[outputs]` table, and its lists are the union of every module's needs. A second `[outputs]` table in the same file fails the configuration load outright (`unmarshal failed: toml: table outputs already exists`); pasting one module README's `[outputs]` block over another's leaves a single table that loads cleanly, exits 0, warns about nothing -- and silently stops publishing every document the replaced list asked for. So do not copy the block above into a site that already has one: MERGE the names into the list already there.

A site importing this module together with [`search`](../search/README.md), [`seo`](../seo/README.md), [`pwa`](../pwa/README.md) and [`url-retirement`](../url-retirement/README.md) wires all of them at once:

```toml
[outputs]
  home = ['html', 'rss', 'markdown', 'llmstxt', 'llmsindex', 'agentfacts', 'agentskills', 'searchindex', 'opensearch', 'webappmanifest', 'redirects', 'urlmanifest']
  section = ['html', 'rss', 'markdown']
  page = ['html', 'markdown']
```

Only `[outputs]` needs this care. `[outputFormats]` and `[mediaTypes]` DO merge additively from module configuration, which is why `llmstxt`, `llmsindex`, `agentfacts`, `agentskills`, `searchindex` and `opensearch` are usable by name in the list above although the site defines none of them. Two names in that list stay INERT until their own parameters are set -- `agentskills` publishes nothing without `[[params.agent.skills]]` entries, and `opensearch` nothing without `params.search.opensearch.enable` -- so listing them early is harmless. The [`seo`](../seo/README.md) module defines no output format of its own, but it READS this list: `[seo.alternates] formats` advertises exactly the formats your `[outputs]` lists wire for that page kind. The combination is covered by the cross-module suite in [`modules/test-composition/`](../test-composition/README.md).

## Requirements

- **Hugo v0.160.0+**, any edition. The module uses no extended-edition-exclusive feature.
- **Go 1.22+**, for Hugo module resolution.

## Usage

Every surface the module publishes is output-format-driven, so the wiring that makes the documents exist is the module import, the `[outputs]` lists, the `[params.agent]` configuration block, and the deletion of the site's own `layouts/robots.txt` -- no surface requires calling a partial. On top of that, the module exposes exactly four partials as public API, [`twin-url.html`](#twin-urlhtml), [`llms-url.html`](#llms-urlhtml), [`surfaces.html`](#surfaceshtml) and [`build-time.html`](#build-timehtml), for the site templates that want to LINK what the module publishes or to STAMP their own surfaces with the same build time: a copy-page widget, a `rel="alternate"` or `rel="describedby"` link, a footer block, a human-visible discovery page, a `build-time` meta tag. Every other partial under the `agent-readiness` namespace is internal.

Hugo does not merge a module's `[outputs]` configuration into the site's, and a site-level `[outputs]` key **replaces** the default list for that page kind rather than extending it. Every format below must therefore be wired by the consuming site, restating every entry that is already there:

```toml
[outputs]
home = ['HTML', 'RSS', 'markdown', 'llmstxt', 'llmsindex', 'agentfacts', 'agentskills']
page = ['HTML', 'markdown']
section = ['HTML', 'RSS', 'markdown']
```

`robots.txt` is the single exception: Hugo appends the built-in `robots` output format to the home page whenever `enableRobotsTXT = true`, independently of the `outputs.home` list.

Hugo's defaults for the kinds above are `home = ['html', 'rss']` and `section = ['html', 'rss']`, so restating `HTML` and `RSS` is what keeps every existing feed alive. Dropping `RSS` from the `section` line silently deletes every section feed with no error.

## Public partials

The module exposes exactly four partials as public API: `agent-readiness/twin-url.html`, `agent-readiness/llms-url.html`, `agent-readiness/surfaces.html` and `agent-readiness/build-time.html`. Every other partial under `layouts/_partials/agent-readiness/` is an internal implementation detail.

`twin-url.html`, `llms-url.html` and `surfaces.html` accept the same two call shapes -- the current Page as the context, or a dict whose `page` key is the current Page plus an optional `args` map of call-site config overrides, the top tier of the [four-tier cascade](#parameters) -- and calling any of them with anything else fails the build, because a missing Page is a wiring mistake in a template, not a content problem to degrade over. `build-time.html` reads no context at all: its value is a property of the build rather than of any page, so pass the conventional `.` or anything else. All four contracts are locked by the suite, which dumps every page's results through a fixture-only output format and asserts them against the files each of its builds actually publishes -- `test/tests/09-public-partials.spec.js` for the three page-shaped partials, in both directions, and `test/tests/11-build-stamp.spec.js` for the build stamp.

### `twin-url.html`

```go-html-template
{{ partial "agent-readiness/twin-url.html" . }}
{{ partial "agent-readiness/twin-url.html" (dict "page" . "args" (dict ...)) }}
```

Returns the page's published Markdown twin as an absolute URL (string), or the empty string when the page publishes no twin. The empty-string cases, exhaustively: the master switch off (`enable = false`); the twin surface off (`markdown.enable = false`); the page excluded by the per-page rules (front matter `agent: false` or `agent: {exclude: true}`, the dedicated search page, a `robots` value containing `noindex` -- each honoring the explicit `agent: {exclude: false}` include override); a regular page absent from the shared page enumeration; a **section** page outside a non-empty `sections` allow-list (the allow-list applies to section kind only, never to home); the built-in `markdown` output format not wired for the page's kind in `[outputs]`; and any kind that never gets a twin (taxonomy, term, or anything else beyond home, section, and page -- the module ships twin templates for exactly those three kinds).

The partial exists because wired is not published. `.OutputFormats.Get "markdown"` cannot answer whether a twin exists, and the module's own comment in `llms.html` states why, verbatim:

> The twin URL is substituted only when the twin will actually EXIST. `.OutputFormats.Get "markdown"` answers "is the format wired for this page kind", which is a question about the consumer's [outputs] lists, NOT about whether this module rendered anything into it -- markdown-page.html is the sole producer and it emits nothing when the switch is off, which makes Hugo publish no file. Consulting the format alone would therefore list a URL that 404s for every page on a site that turned the twins off but left `markdown` wired, which is exactly the configuration the module tells consumers to use.

Inside the module, the twin renderer (`markdown-page.html`) and this partial read ONE membership implementation (`lib/page-included.html`), so the URL a consumer receives and the file the renderer writes can never drift apart. Duplicating that decision is precisely how a URL resolver ends up linking a file that does not exist.

The intended pairing is a widget that needs the twin URL only when the twin exists, such as a copy-page widget:

```go-html-template
{{ with partial "agent-readiness/twin-url.html" . }}
  {{ partial "copy-page/menu.html" (dict "page" $ "url" .) }}
{{ end }}
```

The widget renders on exactly the pages whose twin publishes and receives the source-of-truth URL, instead of deriving a URL from the wired format and pointing at a file that does not exist on every excluded page.

### `llms-url.html`

```go-html-template
{{ partial "agent-readiness/llms-url.html" . }}
{{ partial "agent-readiness/llms-url.html" (dict "page" . "args" (dict ...)) }}
```

Returns the absolute URL of the `llms.txt` that covers the page (string), or the empty string when no compact index publishes for that page's language. The empty-string cases, exhaustively: the master switch off (`enable = false`); the compact index surface off (`llms.enable = false`); and the `llmstxt` output format not wired on the page's own language home. On a multilingual site the answer follows the calling page's language, because the document publishes per language (`/llms.txt`, `/ru/llms.txt`).

This is the second half of what [llmstxt.org](https://llmstxt.org/) v2 recommends for discovery, and `twin-url.html` is the first: "we recommend using standard link relations: `rel="alternate" type="text/markdown"` points to the markdown version of a page, and `rel="describedby"` points to the llms.txt file that covers it". The module supplies both values and emits neither tag -- what a consuming site puts in its `<head>`, and whether it prefers the HTTP `Link:` header form, stays the site's decision:

```go-html-template
{{ with partial "agent-readiness/twin-url.html" . }}
  <link rel="alternate" type="text/markdown" href="{{ . }}">
{{ end }}
{{ with partial "agent-readiness/llms-url.html" . }}
  <link rel="describedby" href="{{ . }}">
{{ end }}
```

**Coverage is by path, not by membership, which is the one place this contract deliberately parts from `twin-url.html`.** A twin is a file the module either writes for a page or does not, so `twin-url.html` answers empty for a page the membership rules withhold. Coverage is a different relation: v2 has an `llms.txt` describe "all pages under its path", so a page excluded from the twins and from the link indexes -- `agent: false`, a `noindex` robots value, the search page -- is still covered by the same document and still receives its URL here. A `describedby` link therefore appears on pages that carry no `alternate` link, which is correct: the page has no Markdown twin, and the site's index still describes the path it sits under.

The value is also reachable through the `llms` entry of [`surfaces.html`](#surfaceshtml), and both answer identically because both read one shared implementation (`lib/llms-url.html`). This partial exists so the common case -- one page, one URL, emitted into a head or a header -- is a call rather than a range with an equality test inside it.

### `surfaces.html`

```go-html-template
{{ range partial "agent-readiness/surfaces.html" . }}
  <a href="{{ .url }}">{{ .label }}</a>
{{ end }}
```

Returns an ordered slice of dicts, each `{key, url, label}`, enumerating the site-level agent surfaces the module actually publishes under the resolved config: `llms` (the compact `llms.txt` link index), then `llms_index` (the complete `/llms-index.txt` one), then `facts` (the `/about.md` facts document), then `skills` (the Agent Skills index at `/.well-known/agent-skills/index.json`). Every `url` is absolute. Every `label` is the module's i18n-resolved display string (`agent_surface_llms`, `agent_surface_llms_index`, `agent_surface_facts`, `agent_surface_skills`), so a consumer renders the list without authoring labels. An entry is present only when its document publishes, and the slice may be empty.

Each entry reproduces its producer's own publish gates rather than merely checking the wired format. `llms` requires the master switch, `llms.enable`, and the `llmstxt` format wired on the page's own language home -- an enabled `llms.txt` always emits at least its H1 line, so enabled-and-wired is published; that gate set is shared with [`llms-url.html`](#llms-urlhtml), so the enumeration and the public partial can never disagree about whether the compact index exists. `llms_index` requires those three plus `llms_index.enable`, on the `llmsindex` format. `facts` requires the master switch, `facts.enable`, and the `agentfacts` format wired on the page's own language home, by the same reasoning. `skills` reproduces all four gates of the index file itself -- the master switch, `skills_index.enable`, the `agentskills` format wired on the default site's home, and at least one skill surviving validation and fetch -- through the same shared implementation that feeds the [derived `llms.txt` entry](#llmstxt), so the two callers can never disagree about whether the index exists. The `llms_index` gate set is shared the same way, with the [derived complete-index route](#the--start-here-section) in `llms.txt` and with every twin's [trailing pointer section](#the-trailing-pointer-section) -- three callers, one answer.

On a multilingual site the `llms`, `llms_index` and `facts` entries follow the calling page's language, because those documents publish per language (`/llms.txt`, `/ru/llms.txt`). The `skills` entry is evaluated against the default language's site whatever language calls, because the index's format sets `root = true` and publishes once for the whole site, so every language must answer with the one file that actually exists.

The intended consumer is a site-side discovery surface -- an `/agents/` page or a footer block presenting the machine-readable entry points to human visitors -- built with zero hand-typed surface lists, so a surface switched off in configuration disappears from that page in the same build instead of lingering as a hand-authored link that 404s.

### `build-time.html`

```go-html-template
<meta name="build-time" content="{{ partial "agent-readiness/build-time.html" . }}">
```

Returns the build's timestamp as an RFC 3339 string with the offset (`2026-08-03T03:05:13+03:00`). The value is **constant for the whole build and identical in every document the build publishes, in every language**, and it is the same string the module writes into every twin's `build_time` front-matter key, into the `> Build time:` line of `llms.txt` and `/about.md`, and into the `generated` key of the Agent Skills index. It is not persisted between builds: two consecutive builds return two different values, which is the point.

This partial is public API for consuming sites AND for sibling modules: the [`search`](../search/README.md) module reads it -- through `templates.Exists`, so it stays optional -- to stamp `/searchindex.json`, which is why a site running both publishes one string across every dated document of a deploy.

The partial exists so a consuming site can stamp its own surfaces -- an HTML `<meta>` tag, a generated JSON document, anything -- with the value the module's surfaces already carry. Feeding a separately-computed `now` into those would make two documents of one deploy disagree by seconds and report drift that is not there, which is worse than no stamp at all. It reads no context; pass the conventional `.`.

See [The two time fields](#the-two-time-fields) for what this answers that `last_updated` cannot, and for the per-surface switches that decide which of the module's own documents carry it.

## Parameters

Configuration lives under `[params.agent]`. Data files and partials live under the `agent-readiness` namespace (`index hugo.Data "agent-readiness"`, `partial "agent-readiness/config.html"`). The two namespaces are deliberately different: `params.agent` is short because it is typed at every key, while `hugo.Data` and `layouts/_partials/` are each a single namespace merged across every mounted module plus the consuming site's own tree, where a short generic key would be materially more collision-prone.

Values resolve through a four-tier cascade, highest precedence first:

1. Call-site args
2. Page front matter `agent:` map
3. Site config `[params.agent]`
4. `data/agent-readiness/defaults.toml` (module defaults)

Presence wins at every tier, so an explicit `false` or empty value overrides the tier below it. Nested maps (`robots`, `markdown`, `llms`, `llms_index`, `facts`, `skills_index`, `frontmatter`, `license`) merge tier by tier rather than replacing, so overriding one key inside `[params.agent.markdown]` keeps the shipped values for the rest. Slice-valued keys are replaced, never combined.

**SITE-SCOPED keys are honored at the defaults and `[params.agent]` tiers only**, because they shape site-wide artifacts that must select the same page set no matter which page renders them: `enable`, `sections`, `exclude_noindex`, `exclude_search_page`, `search_page_path`, `skills`, every surface's own `enable` (`markdown.enable`, `llms.enable`, `llms_index.enable`, `facts.enable`, `skills_index.enable`), and the whole `robots` and `license` tables. Setting one of them lower down is a no-op and warns once; each surface's `enable` is site-scoped for the same reason as the master switch: these keys govern whether an artifact EXISTS, and a lower tier that switched one document off would leave every other surface still linking it with a URL that 404s. To remove a single page from every agent surface at once, use `agent: false` in its front matter.

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
- an `[[llms.sections]]` entry whose `select` or `order` names a value outside its vocabulary, which falls back to `'first'` and to the site's own page order respectively -- the `order` guard is the one that would otherwise be fatal, because the value would reach `sort`'s field argument and abort template execution;
- an `[[llms.sections]]` entry selecting flagged pages where no page under the section carries the flag, whose heading is omitted with a message naming the flag, distinct from the section-matches-nothing message because the remedies differ;
- an `[[llms.sections]]` entry setting `select = 'all'` together with a positive `limit`, where `select` wins and the section is listed complete;
- a complete link index that is enabled while the `llmsindex` output format is not wired to the home page, so `/llms-index.txt` cannot publish and `llms.txt` withholds the route rather than naming a URL that 404s;
- a bare value where a table belongs, in ANY array-of-tables key (`skills`, `llms.sections`, `llms.optional`, `facts.sections`, `facts.identity.rows`, and a contact page's channels) -- skipped rather than dropped, because a dropped entry publishes a surface indistinguishable from one the consumer never configured;
- a scalar written for a consumer sub-table (`facts.identity`, `facts.contact`) -- the whole block is ignored, because `[params.agent.facts] contact = '/contact'` is the natural mis-write of `[params.agent.facts.contact] page = '/contact'`;
- a `markdown.sitemap_section_target` that is not `llms`, `sitemap`, or `none`, and a `sitemap_section_target = 'llms'` on a site where NEITHER link-index format is wired to the home page, leaving the section nothing to name;
- a `[params.agent.license]` with a `url` but no `name`, where the `llms.txt` line would render an empty link label;
- a `skills_index.schema` that is not an absolute URI, or an `on_supporting_files` outside its two-value vocabulary -- each falls back to the shipped default;
- a skill whose remote source could not be fetched, whose fields are invalid, whose `type` is neither of the convention's two values, or whose `name` repeats another entry's;
- a skill whose fetched artifact is not what its `type` says: an entry declared `archive` whose bytes carry neither the gzip nor the zip signature, an entry left as `skill-md` whose bytes are an archive, a zip with no members, or a zip whose only `SKILL.md` sits inside a wrapper directory;
- a `source` that is a code forge's whole-repository archive endpoint, refused on its URL shape before any fetch, because such an archive always nests its contents in a directory named for the repository and the ref;
- a fetched `SKILL.md` that is not one: no YAML front matter, TOML front matter, a block that is not valid YAML or not a mapping, or one declaring no `name` or no `description`;
- a fetched `SKILL.md` whose front-matter `name` differs from the configured one, which the format specification does not allow, since the name it is published under is its directory name;
- a `description` that differs from the one in the skill's own front matter, which the convention says it SHOULD match -- published, but named;
- a skill PROVEN to ship supporting files, whose references cannot resolve under a republished single file; a skill referencing files outside its own directory, which no archive may carry; a sibling check the origin answered with an error rather than with the file or a 404; a source URL whose shape makes that check impossible at all; a body naming more candidate files than one build will check; and a zip whose root-level `SKILL.md` cannot be confirmed from its raw bytes;
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
build_time            = true    # Emit `build_time:` -- when the BUILD ran. See "The two time fields" below.
license               = false   # Emit `license:` -- requires [params.agent.license] url.
section_pages         = true    # Emit the member roster in a SECTION twin. See "The member roster" below.
sitemap_section       = true    # Append the trailing pointer section. See "The trailing pointer section" below.
sitemap_section_target = 'llms' # 'llms' | 'sitemap' | 'none'. Case-folded; an unrecognized value warns. The default heading follows the resolved target ('Site index' for llms, 'Sitemap' for sitemap); the agent_sitemap_heading i18n key overrides both.
```

Twins never enter `sitemap.xml`: Hugo's sitemap enumerates pages and emits one `<loc>` per page from `.Permalink`, so no secondary output format can appear in it.

### Body source

The body is `.RenderShortcodes` -- shortcodes expanded to their output, the surrounding Markdown left as Markdown. It is the only one of Hugo's four content accessors that yields a document that is both valid Markdown prose and complete: `.RawContent` leaves every shortcode call as unexpanded literal text, `.Content` renders the surrounding Markdown to HTML as well (an HTML document with a `.md` extension), and `.Plain` strips every tag and destroys headings, lists, links, and code fences.

Reconstructing Markdown from `.Content` is possible -- `transform.HTMLToMarkdown` exists as of Hugo v0.151.0 -- but it is the wrong tool here: it is still flagged experimental with an API that may change, and it would put the twin through a lossy Markdown to HTML to Markdown round trip whose output is a converter's opinion of the source rather than the source. `.RenderShortcodes` never leaves Markdown in the first place, so no round trip and no experimental dependency is needed.

**The documented consequence:** a twin of a shortcode-heavy page contains raw HTML blocks inline. That is valid CommonMark -- raw HTML is a first-class block type that every conformant parser passes through -- and for a page whose entire value is a rendered widget, the widget markup _is_ the content. Smoke-test one such page rather than discovering it later.

Relative links inside the body need no rewriting: `index.md` sits in the same published directory as `index.html`, so every relative reference resolves identically from either.

### The twin-extra hook

Some pages carry their substance outside the page body: a contact page whose channels live in front matter and are rendered by a layout, a home page whose hero prose is assembled from site data. Their twins publish a front-matter block over an empty body, because `.RenderShortcodes` faithfully returns the nothing the content file holds. The twin-extra hook is the supported way to put that substance into the twin: author `layouts/_partials/agent-readiness/twin-extra.html` in your site, and the twin renderer calls it immediately after the page body -- before the member roster and the trailing pointer section -- behind a `templates.Exists` guard. The module intentionally ships no such file, so the hook is zero-cost until you create it, mirroring the [`seo`](../seo/README.md) module's `head-extra`/`jsonld-extra` hooks.

The hook receives the same `{page, cfg}` dict as every internal renderer: `page` is the page whose twin is rendering, and `cfg` is the resolved configuration from the four-tier cascade. Membership gating is inherited from the renderer, so an excluded page's twin stays entirely unpublished, hook or no hook -- but within the published set the hook runs on EVERY twin, so the hook itself decides which pages it adds content to. Its output is trimmed with `strings.TrimSpace` and prefixed with one blank line: a hook that emits nothing (or only whitespace) for a page adds zero bytes to that page's twin, and a non-empty emission is separated from the body above and from any section below by exactly one blank line, whatever newline discipline the hook's own template uses. Emit Markdown, not HTML -- the twin is a plain-Markdown document. A failure inside the hook is your own template error and fails the build like any other site template; the module adds no guard around it.

A worked example for a contact page whose channels live in front matter. The content file:

```yaml
---
title: Contact
channels:
  - label: Email
    value: team@example.org
    href: mailto:team@example.org
  - label: GitHub
    value: example
    href: https://github.com/example
---
```

And the hook, `layouts/_partials/agent-readiness/twin-extra.html`:

```go-html-template
{{- $page := .page -}}
{{- if eq $page.Path "/contact" -}}
  {{- $lines := slice "## Channels" "" -}}
  {{- range $page.Params.channels -}}
    {{- $lines = $lines | append (printf "- [%s](%s): %s" .label .href .value) -}}
  {{- end -}}
  {{- delimit $lines "\n" | safeHTML -}}
{{- end -}}
```

The `safeHTML` matters for the same reason it does inside the module's own renderers: the partial lives in the `.html` template namespace while the twin is a plain-text document, so without it an ampersand in a value would be HTML-escaped into an entity.

### The member roster

A **section** twin carries a complete roster of the section's member pages between its body and the trailing pointer section: a `## Pages` heading (the `agent_section_pages_heading` i18n key) followed by one `- [title](url): description` line per member, the `: description` suffix omitted when a page has none. A site whose section `_index.md` files are front-matter-only would otherwise publish section twins with empty bodies -- no roster at all -- and the section twin is the surface that answers "what pages does this section hold" in one fetch.

Membership is the same shared filter every other surface resolves through, narrowed to pages under the section's path at a segment boundary, so the roster is the identical set `llms.txt` and `/about.md` list for that section and is complete by definition -- never a first-N window, including for a section Hugo splits across pagers. Each item links the member's Markdown twin when the built-in `markdown` format is wired for the page kind, else its HTML permalink, and every URL is absolute, because a twin is routinely read detached from the site it came from. A section whose admitted member set is empty emits no heading and no list.

The home twin never carries a roster: every regular page sits under `/`, so a home roster would enumerate the whole site, and that site-level enumeration is `llms.txt`'s job. Switch rosters off with `section_pages = false`, which restores the section twin to exactly its body plus the pointer section.

### The trailing pointer section

Every twin ends with one pointer block -- a `## Site index` heading and the routes out of the page into the site's own enumeration. Twins are the surface an agent lands on most, and this block is the cheapest route it has, so what the block names decides what a reader can find.

Under the default `sitemap_section_target = 'llms'` it names **every link index the site publishes**, the compact `/llms.txt` first and the complete [`/llms-index.txt`](#the-complete-index-llms-indextxt) second:

```markdown
## Site index

- [llms.txt](https://example.com/llms.txt)
- [Complete index](https://example.com/llms-index.txt)
```

The plural is the point. The compact document is capped by construction on any site large enough to configure a cap, so a pointer naming it alone sends an agent asking "does this site have a page about X" to the one enumeration allowed to omit X -- where an absence reads as a fact about the site. That is the same false negative the [narrowed-section disclosure](#a-narrowed-section-says-so-in-the-section) exists to prevent one level down: the disclosure tells a reader already inside `llms.txt` to go further, and this block is where "further" is the first stop instead of a second hop. Naming both costs one line and needs no configuration, which matters because the site that most needs the complete index is the one large enough to be capped, and its author has no signal that the twins are under-pointing.

Each link is emitted only when its own document actually publishes, never merely when its output format is wired, so the four wirings degrade into each other rather than into a dead link:

| Wired in `[outputs] home` | The section names                                                   |
| ------------------------- | ------------------------------------------------------------------- |
| `llmstxt` and `llmsindex` | both, complete second                                               |
| `llmstxt` only            | `llms.txt` alone                                                    |
| `llmsindex` only          | the complete index alone                                            |
| neither                   | nothing -- the section is omitted, with one warning naming the edit |

`[params.agent.llms] enable = false` takes both documents down together and the section with them, in silence: the surface was switched off deliberately. `[params.agent.llms_index] enable = false` drops the second link the same way. Both link texts are the surface display labels (`agent_surface_llms`, `agent_surface_llms_index`), so a document carries one name wherever the module names it -- here, and in what [`surfaces.html`](#surfaceshtml) returns.

`sitemap_section_target = 'sitemap'` points the block at `sitemap.xml` under the `Sitemap` heading instead, and `'none'` omits it. Every URL is absolute: a twin is routinely read detached from the site it came from, where a relative path has no base to resolve against.

### Front matter

Every value is emitted through `jsonify`. JSON is a strict subset of YAML 1.2, so this produces a valid mapping entry for every possible value -- a title containing a colon, a description containing a `#`, a list of tags -- with no quoting logic and no escaping hazard. Consumers should expect quoted scalars, including dates: `period_from: "2025-02-01"`. A per-section key that is not a plain token of lowercase alphanumerics, `_` and `-` is emitted through the same `jsonify`, so a key carrying a line break or a colon becomes a double-quoted YAML key on one mapping line instead of restructuring the block.

Fields are emitted in a fixed order:

| Order | Key                  | Emitted when                                                      |
| ----- | -------------------- | ----------------------------------------------------------------- |
| 1     | `title`              | always                                                            |
| 2     | `description`        | non-empty                                                         |
| 3     | `date`               | set (RFC 3339)                                                    |
| 4     | `last_updated`       | `markdown.last_updated` and `.Lastmod` differs from `.Date`       |
| 5     | `build_time`         | `markdown.build_time` (RFC 3339 with offset)                      |
| 6     | the per-section keys | declared in `[params.agent.frontmatter.<section>]`, in that order |
| 7     | `license`            | `markdown.license` and `license.url` is set                       |
| 8     | `canonical`          | `markdown.canonical` -- **always last**                           |

`canonical` carries the page's HTML URL, which is free and correct because the built-in `markdown` format sets `permalinkable = false`, so `.Permalink` inside the twin's own template already returns the HTML URL.

Declare the per-section vocabulary the site actually uses:

```toml
[params.agent.frontmatter.projects]
keys = ['project_name', 'status', 'period_from', 'period_to', 'repository']
```

**A section map must not repeat `title`, `description`, `date`, `last_updated`, `build_time`, `license`, or `canonical`.** The builder emits those itself, skips any per-section key that repeats one, and warns once per `<section>/<key>` pair. All seven are reserved unconditionally, whatever their own switches say: a key reserved only while it is being emitted would let `build_time = false` publish a consumer's front-matter value under the module's own name. This is not politeness: YAML 1.2 makes two equal keys in one mapping node an error, so strict parsers reject the whole document and lenient ones silently keep one value -- a single duplicated `title` would make every twin in that section unreadable to exactly the tooling twins exist for.

A key absent from a page is omitted, never emitted as an empty string or `null`. A key whose value is the string sentinel `present` is also omitted: it is a display convention for an open-ended range, and the literal string is not a date and must never reach a machine surface.

### The two time fields

A twin carries two timestamps, and they answer **different questions**. Conflating them is the failure this design exists to avoid: a reader that has learned a key means content time on one surface and build time on another cannot use either.

| Key            | Answers                      | Source                | Shape                  |
| -------------- | ---------------------------- | --------------------- | ---------------------- |
| `last_updated` | When did the CONTENT change? | the page's `.Lastmod` | ISO date, `2026-06-15` |
| `build_time`   | When did this BUILD run?     | one value per build   | RFC 3339 with offset   |

`last_updated` is emitted only when it names a DIFFERENT CALENDAR DAY from `date`, because the calendar day is the precision it is published at: a lastmod later the same day says nothing the date does not already say, and read as timestamps a bare date is midnight, so publishing it beside a same-day `date` reports the page as updated hours BEFORE it went out. `last_updated` also cannot answer "am I holding a cached copy". A site that rebuilds on a schedule refreshes generated figures without touching a content file, so `last_updated` sits still while the published document changes. `build_time` is the field that moves, and its full RFC 3339 form is deliberate: a date alone cannot distinguish this morning's build from last night's.

**The value is one string per build**, identical in every twin, in the `> Build time:` line of `llms.txt` and `/about.md`, in the `generated` key of the Agent Skills index, in every language, and identical to what the [`build-time.html`](#build-timehtml) public partial returns -- so a site that stamps its own `<meta name="build-time">` from that partial publishes a value a reader can compare byte for byte against any of the module's documents. A site that also runs the [`search`](../search/README.md) module gets the same string in `/searchindex.json`'s `generated` field, because that module reads this partial when it is present. It is not persisted between builds, so a rebuild always produces a new one.

Four independent switches decide which of the module's own documents carry it, mirroring the two independent `license` switches over one underlying fact:

```toml
[params.agent.markdown]
build_time = true    # the `build_time:` front-matter key in every twin

[params.agent.llms]
build_time = true    # the `> Build time: <stamp>` line in llms.txt and llms-index.txt

[params.agent.facts]
build_time = true    # the same line in /about.md

[params.agent.skills_index]
build_time = true    # the `generated` key in the Agent Skills index
```

**Consumer-visible consequence of leaving them on, stated plainly:** every twin, both link indexes, `/about.md` and the skills index change bytes on **every** build, even when no content changed. That is harmless for an ordinary deploy and it is exactly what a staleness detector requires -- but a consumer that diffs published output to decide whether to deploy, invalidates a CDN from a changed-file list, or commits `public/` to version control will now see the whole set change every build. Those consumers set the switches false. The default is on, because a stamp shipped off by default fixes the problem only for consumers who read this paragraph.

### `last_updated` accuracy precondition

`last_updated` is `.Lastmod`, which is a real per-file git date only when the consuming site sets `enableGitInfo = true` **and its build environment has full per-file commit history**. A CI runner that performs a shallow clone gives Hugo no history, so every `.Lastmod` collapses to the build timestamp and every twin claims the same modification date.

The fix belongs in the CI build command -- fetch the full history before building, as `git fetch --unshallow && <build>` does. A front-matter `lastmod` fallback and suppressing the field are both rejected: the fallback would discard a working signal everywhere the history _is_ present.

### Per-page opt-out

Use `agent: false`, never `outputs: ['HTML']`. See [Per-page opt-out](#per-page-opt-out) above for why the `outputs` route silently does nothing.

### Twins are withheld per page, which a `rel="alternate"` emitter cannot see

The twin is withheld for a page carrying `agent: false`, for a `robots: noindex` page under the default `exclude_noindex = true`, for the search page, and for any page outside a configured `sections` allow-list. A withheld twin means **no file at all**, not an empty one.

The module's own surfaces all agree about this, because they share one filter, and a site template joins the agreement by calling [`twin-url.html`](#twin-urlhtml), which answers from that same filter. Anything that does not call it cannot see the withholding: Hugo's `.OutputFormats.Get "markdown"` answers "is this format wired for this page kind", which is a fact about your `[outputs]` lists, and there is no template API for "did that format publish bytes". So a generic `<link rel="alternate" type="text/markdown">` emitter that consults only the format -- including the `seo` module's `[seo.alternates]` allow-list -- will advertise a twin on pages that have none. If you run both modules, keep `[seo.alternates] formats` and `[params.agent] sections` describing the same page set, or leave `formats` unset and let `llms.txt` be the discovery surface for twins.

The companion `rel="describedby"` link carries no such hazard, and the asymmetry is deliberate rather than an omission. [`llms-url.html`](#llms-urlhtml) answers for a document that publishes once per language, not once per page, so there is nothing per-page to withhold: every page of a language gets the same URL or, when no compact index publishes at all, the empty string. A `describedby` emitter can therefore be unconditional in a way an `alternate` emitter cannot.

## llms.txt

Publishes TWO link indexes from ONE page walk: the compact `/llms.txt` through the module's `llmstxt` output format, and the complete `/llms-index.txt` through `llmsindex` beside it. Both are wired by adding their format names to `[outputs] home`.

> **What this file is worth, stated plainly.** [llmstxt.org](https://llmstxt.org/) is a **community convention with no registration authority and no confirmed major-crawler consumer**. Independent analyses have found no measurable citation benefit. It must not be presented as an SEO, AEO, or citation lever, and this module does not present it as one.

Their real value here is narrower and real: both files are build-generated from the **same page collection** as `robots.txt`, the twins, and `/about.md`, through the one shared filter and the one section-membership test, so they cannot drift stale, cannot advertise a URL the twins never emit, and cannot disagree with each other about what a section holds. They are link indexes pointing at the machine-readable forms; they carry no facts of their own -- the facts document does that.

```toml
[params.agent.llms]
enable = true          # SITE-SCOPED. False switches off BOTH documents.
title = ''             # falls back to site.Title
summary = ''           # the one-line blockquote
notes = ''             # optional free prose
link_markdown = true   # link the twin rather than the HTML page
license = false
build_time = true      # emit the `> Build time: <stamp>` line
flag = 'llms_featured' # front-matter key that `select = 'flagged'` reads

[params.agent.llms_index]
enable = true          # SITE-SCOPED. False switches off the COMPLETE index alone.

[[params.agent.llms.sections]]
name = 'Blog'
section = 'blog'
select = 'first'       # 'first' | 'flagged' | 'all'
order = 'weight'       # 'weight' | 'date' | 'title'
limit = 0              # 0 = complete
flag = 'llms_featured' # overrides [params.agent.llms] flag for this entry

[[params.agent.llms.optional]]
name = 'Sitemap'
url = '/sitemap.xml'
note = 'Every published URL.'
```

Both documents have the same shape: exactly one H1 line, a blockquote summary, an optional blockquote license line, an optional blockquote `> Build time: <stamp>` line, optional prose, a `## Start here` section carrying the derived routes, one H2 per configured section listing `- [name](url): note` items -- opened, in the compact file only, by [one disclosure item when that section's selection dropped pages](#a-narrowed-section-says-so-in-the-section) -- and a final `## Optional` section collecting the `[[params.agent.llms.optional]]` entries plus the module's own derived Agent Skills entry described below. `Optional`'s heading is emitted only when at least one entry of either kind survived, and `Start here`'s likewise, because an empty H2 claims a section that is not there. `Optional` is a protocol token fixed by the convention and is deliberately not translated; `Start here` is ordinary prose and is translated, through the `agent_llms_start_heading` key.

They differ in exactly three places, and the third follows from the first: the compact file applies each section's selection principle while the complete one lists every section whole; a compact section that dropped pages opens with one line saying so, which the complete file has no occasion for; and the compact file names the complete index while the complete one does not name itself.

### Which file to start with, and why this beats one file with a longer `## Optional`

**Start with `/llms.txt`.** It is the file the convention names, it is the one an agent finds without being told, and its `## Start here` section names the complete index -- so a narrower selection costs REACH, not ACCESS, and nothing is more than one further fetch away. Fetch `/llms-index.txt` when you want the whole catalog.

The one-file alternative -- keep everything, and let the overflow live under a longer `## Optional` -- loses on the convention's own terms. Verbatim from [llmstxt.org](https://llmstxt.org/): "The \"Optional\" section is used, by convention, for secondary information: links an agent can skip when a shorter context is needed." An agent following that convention has been told it may drop those URLs, which is exactly backwards for pages a cap removed: they are the ones a reader who wants MORE goes looking for. Filing the overflow under the heading that means "safe to drop" defeats the point of having it.

The argument survived a change in the source it quotes, and the distinction is worth keeping straight. v2 of the proposal retired the section's MECHANICAL semantics along with the `llms_txt2ctx` context-expansion tool that consumed them -- "Optional sections are still allowed, and remain a useful convention for secondary links, but they no longer carry mechanical semantics" -- so no tool is contractually entitled to strip those URLs any more. What v2 kept is the reader-facing convention quoted above, and that is the whole basis of this argument: a section whose name tells an agent the links are skippable is the wrong place to file the links a cap made most worth fetching.

Two other things the split buys. The compact file's size stays bounded by configuration rather than growing with the content forever, which is the problem it exists to solve -- the document an agent reads FIRST is otherwise the one that gets most expensive as a site succeeds. And the route to everything is ONE link in the section an agent is told to keep, rather than a tail of links in the section it is told it may discard.

A second file is not a second source. Both come from the same page walk and the same section-membership test, so a page added to the content tree appears in both or in neither, and neither file can name a page the twins do not publish.

### The selection principle, per section

**A cap tells a consumer nothing unless they know what it keeps**, so start with the default order. With no `order` key the module emits no sort at all and lists the section in Hugo's own page order: **weight ascending with unweighted pages LAST, then date descending, then title**. A section whose pages carry authored weights therefore keeps its most important entries, and a section with none degrades to newest-first. Both are usually what a compact index wants, which is why the shipped default leaves the order alone -- and why `order = 'weight'` is spelled for the principle rather than as `'default'`: a value named for its status would silently change meaning if the default ever moved.

Sections differ in kind rather than only in size -- a blog's useful short list is its newest posts, a projects roster's is the ones the author ranked highest, a certifications list may want the ones still valid -- so the principle is configuration, per section, beside the cap:

| Key | Values | Default | What it does |
| --- | --- | --- | --- |
| `select` | `'first'`, `'flagged'`, `'all'` | `'first'` | Which pages earn a place: the leading ones, the ones an author flagged, or every one of them. |
| `order` | `'weight'`, `'date'`, `'title'` | `'weight'` | The axis that decides which pages survive the cap. `'weight'` emits no sort and keeps the site's own order (weight ascending with unweighted pages last, then date descending, then title); `'date'` sorts **newest first**; `'title'` sorts **alphabetically ascending**. |
| `limit` | non-negative whole number | `0` | The cap. `0` means complete. Ignored under `select = 'all'`. |
| `flag` | a front-matter key name | `[params.agent.llms] flag` | Which key `select = 'flagged'` reads. Shipped as `llms_featured`. |

The pipeline is uniform for every principle: **filter, then order, then cap.** So `limit` caps a flagged selection too -- an author who flags forty pages would otherwise get a forty-entry "compact" section, reintroducing exactly the unbounded growth the split exists to fix -- and `order` decides which entries survive that cap whichever principle chose them. `select = 'all'` is the one uncapped shape, because naming everything is the whole content of that principle.

`select = 'flagged'` reads the flag from the page's own front matter, never from site params, so a site that happens to carry a same-named `[params]` key does not flag every page. The truthy spellings are `true`, `1`, `yes` and `on`, matching every other boolean the module accepts. Letter case folds, because Hugo lowercases front-matter keys -- but underscores and hyphens do not, so `llms-featured` will not find `llms_featured`.

```toml
[[params.agent.llms.sections]]
name = 'Recent posts'
section = 'blog'
limit = 5              # the newest five, since these pages carry no weights

[[params.agent.llms.sections]]
name = 'Featured projects'
section = 'projects'
select = 'flagged'     # whatever the author marked, however many

[[params.agent.llms.sections]]
name = 'Certifications'
section = 'certifications'
select = 'all'         # a small section is complete in both files
```

**These four keys govern the compact file only.** No value of any of them can reach `/llms-index.txt`, which is what "never truncated" means here: it is a property of the renderer rather than a claim about how a consumer configured it.

#### A narrowed section says so, in the section

A section whose selection dropped pages the shared filter admitted opens with one disclosure item naming the counts and the complete index:

```text
## Skills

- [Complete index](https://example.org/llms-index.txt): This section lists 19 of 47 pages; a page missing here may still exist on the site.
- [Terraform](https://example.org/skills/terraform/index.md): ...
```

**Why the module emits this rather than leaving it to you.** A capped section reads exactly like a complete one -- an H2 and a list of pages, with nothing in either to mark the difference. An agent that reads such a section, does not find a topic in it, and answers "no experience with that" has produced a confident FALSE NEGATIVE from the document the convention tells it to read first. That is worse than "I do not know": it is a wrong factual claim, and the reader cannot detect it, because absence is indistinguishable from omission unless the omission is stated.

**Why a page of your own cannot substitute for it.** Prose you write elsewhere -- an `/agents/` page, a README, the `notes` slot's preamble -- is on a surface the affected reader did not fetch: an agent that walked straight into `/llms.txt` and read one section never saw it. The statement has to be where the omission is. And only the generator holds the two numbers, for free, at the moment it writes the H2; a `notes` string that hard-codes "these sections are partial" is a claim that goes stale the day a cap moves or a section grows past it.

**When it appears, exactly.** Only where the entry's `select` or `limit` dropped at least one admitted page -- so a `flagged` section discloses too, and an uncapped `select = 'first'` or a `select = 'all'` renders byte-for-byte what it rendered before this existed. A notice on every section would teach a reader to discount all of them, including the honest ones. `/llms-index.txt` never carries it, and neither does a section the shared page filter emptied for other reasons: a page `agent: false` excludes is absent from every surface, which is a different fact and not this one's to report.

**It degrades rather than disappearing.** With no complete index to point at -- `[params.agent.llms_index] enable = false`, or `llmsindex` never wired -- the item is still emitted, without the link. The remedy is gone; the honesty is not. That linkless shape is the one thing here the [llmstxt.org](https://llmstxt.org/) grammar does not describe: an H2 section is a list of `[name](url)` items, which the linked form satisfies exactly, and which is why the disclosure is a list item rather than a prose line between the heading and the list.

**There is no switch for it, deliberately.** The cap and its disclosure are one decision: a document that omits pages silently is the failure this exists to prevent, so the way to have no notice is to have nothing dropped -- `limit = 0`, or `select = 'all'`. The wording is yours through the `agent_llms_partial_note` i18n key, which is the module's one format string: it carries exactly two `%d` verbs, the kept count then the admitted one, in that order.

**Every wrong value degrades and warns once**, per the module's contract. An unrecognized `select` falls back to `'first'` and keeps your `limit`, because a typo in a new key must not delete content. An unrecognized `order` falls back to the site's own page order -- and that guard is the one that matters most: `sort` takes a FIELD NAME, and a name no page carries aborts template execution, so a consumer string is validated against the closed vocabulary and never interpolated into it. A `flag` that no page under the section carries omits the heading with a message naming the flag, distinct from the section-matches-nothing message because the remedies differ. `select = 'all'` beside a positive `limit` is a contradiction, and `select` wins, because it names the principle while `limit` parameterizes a different one.

### The complete index (`/llms-index.txt`)

Every page of every configured section, in the shared page walk's own order, with no cap and no selection. It is the route the compact file names, and it is the reason a narrower compact file is a curation decision rather than a loss.

**It is still subject to the module's shared page filter**, and the distinction is worth stating precisely. A page a cap dropped is OMITTED from the compact file and present here. A page the module EXCLUDES -- `agent: false` or `agent: {exclude: true}` in its front matter, a `robots: noindex` page under the default `exclude_noindex`, the dedicated search page, or a page outside a configured `sections` allow-list -- is absent from every surface this module publishes, and the complete index is one of them. "Complete" means complete with respect to the cap, not with respect to the filter; a page whose twin was never written must not be advertised here any more than anywhere else.

**Why `llms-index.txt` and not `llms-full.txt`.** That name is taken and means something else. `llms-full.txt` is a de-facto convention of the documentation PLATFORMS that publish it, never part of llmstxt.org's proposal in either version, and it combines an entire site's page CONTENT into one document; sites that publish `llms-small.txt` / `llms-medium.txt` / `llms-full.txt` beside each other are publishing content documents that differ only in volume. The proposal did once carry expansion files of its own -- FastHTML's `llms-ctx.txt` and `llms-ctx-full.txt`, generated by the `llms_txt2ctx` tool -- but v2 removed that tooling from the proposal, so the only expansion names still in circulation are the platforms'. So the `llms-<qualifier>.txt` slot is already owned by size words, and a link index published there would promise an agent that knows the convention the wrong thing. `index` distinguishes by KIND instead -- links, not bodies -- and it is the module's own vocabulary for these files. `llms-sitemap.txt` was rejected for a related reason: sitemaps.org already defines a plain-text sitemap format of one URL per line, so that name would promise a different syntax.

**The module still ships no `llms-full.txt`, and the complete index is not it.** That file is the platforms' full-CONTENT document: it duplicates page bodies the twins already publish at stable URLs, and carries real drift cost with no confirmed consumer. `/llms-index.txt` duplicates nothing -- it is a complete LINK index generated from the same page walk as the compact file, so there are no two copies of anything to fall out of step. That is the whole reason the drift objection which rules out the content file does not reach this one.

Both formats set `mediaType = 'text/plain'`, not `text/markdown`, and that is deliberate: `text/markdown`'s suffixes are `md, mdown, markdown`, so `baseName = 'llms'` would publish `llms.md`. `root` is deliberately unset on both, so a multilingual site gets `/llms.txt` and `/ru/llms.txt` beside `/llms-index.txt` and `/ru/llms-index.txt`, rather than one path every language overwrites -- two documents of one page walk publish per language together or not at all.

The complete index carries the same H1, summary, license line, build-time line and free prose as the compact file, from the same `[params.agent.llms]` keys. That is deliberate rather than lazy: a second `title` or `summary` to maintain is exactly the drift a shared page walk exists to prevent, so `[params.agent.llms_index]` holds nothing but `enable`.

`[params.agent.llms_index] enable = false` withholds the complete index alone, in silence; `[params.agent.llms] enable = false` withholds both documents, because they share one renderer. Either way `llms.txt` stops naming the file rather than pointing at a URL that 404s.

**Three surfaces name it, and all three resolve through one shared gate**: `llms.txt`'s [`## Start here`](#the--start-here-section) section, every twin's [trailing pointer section](#the-trailing-pointer-section), and the entry [`surfaces.html`](#surfaceshtml) returns. Each asks whether the document PUBLISHES rather than whether its format is wired, from one implementation, so no surface can name a file another one knows was never written.

**`llmsindex` must be added to your `[outputs] home` list**, and the module cannot do it for you: Hugo does not merge a module's `[outputs]` configuration into the site's, and a site-level `[outputs]` key replaces the default list for that kind rather than extending it. A site that enables the complete index and does not wire the format gets one warning per build naming the edit and the replacement hazard, and both `llms.txt` and the twins withhold the route rather than publishing a dead link.

### The `## Start here` section

This heading collects the derived ROUTES -- the links an agent must not drop -- and emits itself only when at least one of them survived. There are two, in this order.

**The home page's own Markdown twin, derived, with no consumer action.** Pages otherwise reach this file only through `[[params.agent.llms.sections]]`, and section membership is a content-path prefix test that the home page's path of `/` can never satisfy: `section = '/'` normalizes to the empty string, which the empty-section guard refuses, and any real section value fails the prefix test. So the front door -- the twin an agent is most likely to fetch first, carrying whatever the home page says about the site -- was the one twin this index could never list, on every site that enables twins, with no configuration able to fix it short of hand-writing an `[[llms.optional]]` entry whose URL the module already knows how to compute.

The entry resolves through [`twin-url.html`](#twin-urlhtml), so it carries every publish gate the twin renderer applies: the master switch, `markdown.enable`, a home page opted out in front matter, and the `markdown` format not being wired for the home kind. When any of them withholds the file, this entry is not emitted -- no URL, no warning. `link_markdown = false` suppresses it too, so a site that told `llms.txt` not to link twins gets no twin link here either, keeping the slot consistent with the section bullets rather than making the home page the one exception. The link text is the home page's own `title` and the note its own `description`, so the entry restates nothing you would have to maintain in two places.

**The complete index, in the compact file only** -- a document does not link itself. This is the entry that makes a narrower selection cost reach rather than access. It is gated on the complete index actually publishing, through the same shared implementation [`surfaces.html`](#surfaceshtml) reads, so the two callers can never disagree; it is named and annotated through the `agent_llms_index_entry_name` and `agent_llms_index_entry_note` i18n keys. Each narrowed section names the same URL again under the same label, so the disclosure and the route arrive together where the omission happened.

**Why neither is in `## Optional`,** where the derived Agent Skills entry lives and where the derivation machinery already existed. The convention defines that heading as "secondary information: links an agent can skip when a shorter context is needed" -- and neither a site's front door nor the only route to what a cap dropped is something an agent should drop. The convention reserves no name for an entry point and constrains no H2 name other than `Optional`, and among the generated `llms.txt` files surveyed for this decision the only one that links its own overview at all places it first, ahead of the ordinary sections. So these get their own heading in first position. Preamble prose was rejected for the reason the rest of the document is a link list: an agent parses `- [name](url)`, not a sentence. The contrast with the Agent Skills entry is the point -- that index genuinely is secondary and an agent can drop it without losing the site.

A consumer who already lists either URL in `[[params.agent.llms.optional]]` keeps their own name and note: URLs are compared after absolutization, and a match suppresses the derived entry rather than doubling the link under two headings. Suppressing one leaves the other in place; suppressing both removes the heading with them.

**Every URL is absolute**, including the ones you write in `[[params.agent.llms.optional]]`: a site-relative value there is resolved against the full `baseURL` **including its path**, whether or not you write the leading slash, while anything carrying a scheme (`https:`, `mailto:`, `tel:`) or a protocol-relative `//` prefix passes through untouched. This file is routinely ingested detached from the URL it was fetched from, where a bare `/sitemap.xml` has no origin to resolve against. `/about.md` follows the same rule, and so does the `href` on each `[params.agent.facts.contact]` channel.

The "including its path" is load-bearing and is why the module normalizes rather than calling `absURL` directly: Hugo resolves a value that already begins with `/` against the protocol and host **only**, discarding the `baseURL` path. On a site at `https://example.org/docs/`, a naive `absURL "/sitemap.xml"` yields `https://example.org/sitemap.xml` -- a 404 -- while the correct result is `https://example.org/docs/sitemap.xml`.

**The Optional section also advertises the module's own Agent Skills index, derived, with no consumer action.** When the index actually publishes -- the same four gates as the file itself: the master switch, `skills_index.enable`, the `agentskills` format wired on the default site's home, and at least one skill surviving validation and fetch -- `llms.txt` appends one entry linking the index's absolute URL, named and annotated through the `agent_skills_entry_name` and `agent_skills_entry_note` i18n keys. The index is otherwise reachable only by the `.well-known` path convention, so `llms.txt` is where an agent actually discovers it. A zero-skills or unwired build appends nothing: no entry, no warning, and -- absent any other Optional entry -- no `## Optional` heading. A consumer who already lists the index in `[[params.agent.llms.optional]]` keeps their own wording: URLs are compared after absolutization, and a match suppresses the derived entry rather than doubling it.

**A section entry needs both `section` and `name`, and is skipped with a warning without them.** Both omissions fail invisibly otherwise. An empty `section` matches _every_ page, because the prefix test degenerates to "starts with `/`" -- so a single `sections =` for `section =` typo would publish the whole site under one heading and look deliberate. An entry with no `name` has no H2 to open, so its bullets land under the previous entry's heading, where every Markdown parser reads them as that section's links.

### The build-time line

With `[params.agent.llms] build_time = true` (the default) both documents carry one `> Build time: 2026-08-03T03:05:13+03:00` line, immediately after the license line and before the first section heading. The convention allows it: after the H1 and the blockquote summary come "zero or more markdown sections... of any type except headings" before the H2 file lists, which is the same slot the license line already occupies. A `#`-prefixed comment was rejected -- the convention defines no comment syntax and a leading `#` is an H1, which would break the exactly-one-H1 rule.

These documents get the stamp because `llms.txt` is the first one an agent reads and the complete index is the one most likely to be cached, and both are routinely ingested detached from their origin, where no HTTP `Date` header survives. The value is byte-identical between them, to every twin's `build_time` key, to `/about.md`'s own line, and to what [`build-time.html`](#build-timehtml) returns. The label is untranslated and carries no trailing period, both for the same reason: the value exists to be extracted and compared, and a translated label or a swallowed period breaks that. See [The two time fields](#the-two-time-fields) for what it answers and for the byte-churn consequence of leaving it on.

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
build_time = true             # the `> Build time: <stamp>` line, under the H1 and summary
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

It carries the same `> Build time: <stamp>` line `llms.txt` does, in the same slot under the H1 and summary and in the same label-colon form, so one extraction rule reads both documents and a reader comparing them compares like with like. Switch it off with `[params.agent.facts] build_time = false`; see [The two time fields](#the-two-time-fields).

Each section entry emits one **top-level** bullet per page carrying its title, HTML URL, and twin URL, then one indented bullet per key in the same `[params.agent.frontmatter.<section>]` map the twins use -- so both surfaces describe a page with one vocabulary. The `present` sentinel is rendered here as the prose it is, deliberately unlike the twin front matter, which omits it: this document is read as prose, and "present" is a true and useful thing to say about an open-ended range.

### Exactly one producer of `/about.md` per site

A consuming site that ships its own facts document at `/about.md` must **not** also list `agentfacts` in `outputs.home`. The two would collide on one published path, with the last writer winning and **no build error**.

The module's renderer is deliberately simpler than a site-specific one: it groups nothing, applies no sentinel-omission rules, and links no external artifacts. A consumer whose vocabulary needs grouping or sentinel handling should write its own output format and leave `agentfacts` unwired.

The published path collides with a consumer's own content only if that consumer publishes a page to exactly `about.md` at the site root, which requires `uglyURLs` plus a root-level `about` page; a conventional `content/about.md` publishes to `about/index.html` and does not collide.

## Agent Skills index

Publishes `/.well-known/agent-skills/index.json` through the `agentskills` output format, plus one republished artifact per indexed skill: `/.well-known/agent-skills/<name>/SKILL.md` for a skill distributed as a single file, `/.well-known/agent-skills/<name>.tar.gz` or `<name>.zip` for one distributed as an archive.

> **Draft status.** The Agent Skills **discovery layer** (v0.2.0) is a Cloudflare-authored **draft RFC that may change incompatibly**. The `SKILL.md` format underneath it is the mature layer and is unaffected. This module is released on a `v0.x` line for exactly that reason, and `skills_index.schema` is a config key so a consumer can point at a newer schema without a module change.

```toml
[params.agent.skills_index]
enable = true
schema = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'
build_time = true              # emit the top-level `generated` stamp
on_supporting_files = 'warn'   # or 'omit'; see "Supporting files are detected, not assumed"

# A skill that is one file. Omit `description` and the module publishes the one
# in the skill's own front matter, which is the value the convention says the
# index SHOULD carry anyway.
[[params.agent.skills]]
name = 'my-skill'
source = 'https://raw.githubusercontent.com/owner/repo/<commit SHA>/skills/my-skill/SKILL.md'

# A skill that ships scripts, references or assets. `description` is required
# here, because the module cannot read the SKILL.md inside an archive.
[[params.agent.skills]]
name = 'my-big-skill'
type = 'archive'
description = '<verbatim from the SKILL.md description front matter>'
source = 'https://github.com/owner/repo/releases/download/v1.2.0/my-big-skill.tar.gz'
```

```json
{
  "$schema": "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  "generated": "2026-08-04T03:05:13+03:00",
  "skills": [
    {
      "description": "...",
      "digest": "sha256:3567d32c...",
      "name": "my-skill",
      "type": "skill-md",
      "url": "/.well-known/agent-skills/my-skill/SKILL.md"
    },
    {
      "description": "...",
      "digest": "sha256:9b1f04ae...",
      "name": "my-big-skill",
      "type": "archive",
      "url": "/.well-known/agent-skills/my-big-skill.tar.gz"
    }
  ]
}
```

The keys WITHIN an entry are alphabetical, as shown, because each entry is serialized as a Go map and `jsonify` orders a map's keys that way. Read them by name; the order of the entries themselves follows your configuration, and the order of the document's own three members is a deliberate choice described below.

### Member order is part of the format: metadata first, payload last

**The members are emitted in the order shown above, and `skills` is always last.** Everything that DESCRIBES the document precedes the thing that IS it, so a reader sampling the file from the front -- a `curl` piped to `head`, a truncated preview, a streaming parser, an agent working to a context budget -- learns the schema identifier and the build time from the first hundred-odd bytes, whatever the skill list weighs. The metadata block is a fixed size regardless of how many skills the index carries.

That is a deliberate property rather than a lucky one. Serialized as a single Go map, `jsonify` orders keys ALPHABETICALLY, and this document came out right only because `$` sorts ahead of letters and no key yet sorts after `skills` -- one future key named `updated`, `version` or `warnings` would move the metadata behind the payload with nothing to announce it. That is not hypothetical: the sibling [`search`](../search/README.md) module's index carried its build stamp sixty-five bytes from the end of a quarter-megabyte document for exactly this reason, where capable readers concluded three times over that the field was absent. So the members are emitted one at a time here, the payload is appended after the conditional stamp rather than beside its siblings, and the test suite pins the published order.

What you may rely on is the guarantee, not the sequence: **every metadata member precedes `skills`, and nothing follows it.** JSON member order carries no semantics, so a conforming client cannot observe any of this and none can be broken by it; the order exists entirely for readers that never reach the end. Read fields by name, as you would from any JSON.

### `generated` answers what `digest` cannot

A digest says **"is this different"**. It cannot say **"which one is newer"**, and for a client holding a cached index the direction is the whole question: is MY copy the stale one. Two opaque hashes that disagree cannot answer it; a timestamp can.

The gap bites harder here than on any other surface this module publishes, because of what the index is FOR. A stale index points an agent at a skill body it believes is current -- and the digest beside it **verifies**, against the old bytes the client also cached. Index and body stay perfectly self-consistent, both out of date, every check green.

The value is [the build stamp](#the-build-time-line): the same string from the same [`build-time.html`](#build-timehtml) that every twin's `build_time`, both link indexes' and `/about.md`'s `> Build time:` line, and a consuming site's own `<meta>` carry. It is **top level, not per skill** -- the document is published as a unit and its entries never come from different builds, so a field per entry would be N copies of one fact. `skills_index.build_time = false` withholds the key entirely rather than emitting it empty, matching the three other per-surface stamp switches.

### The `$schema` decision: the key is added, the identifier is not touched

The discovery draft settles this in the module's favor, explicitly rather than by omission. Verbatim from the [RFC](https://github.com/cloudflare/agent-skills-discovery-rfc): **"Clients MUST ignore unrecognized fields."** A conforming client is therefore required to tolerate `generated`, and the forward-compatibility rule is the spec's own, not an assumption about what happens to validate today.

The declared `$schema` URI does not resolve (`schemas.agentskills.io` is NXDOMAIN, verified), and that is also by design rather than a defect: the RFC states the URI **"does not need to be resolvable, though it MAY point to a JSON Schema document"** and that it is an **"opaque identifier"** clients **"MUST match it against known schema URIs to determine how to process the index"**. So the value stays EXACTLY as configured. Minting a new one to signal the extra key would be the one genuinely unsafe move available: clients "encountering an unrecognized `$schema` URI SHOULD warn the user and SHOULD NOT process the index" -- the index would be refused wholesale in exchange for advertising an addition the spec already permits.

The residual risk is future-only and is worth naming: if a published schema ever appears with `additionalProperties: false`, the key becomes invalid the day validation arrives. The alternative that avoids it -- an HTTP `Last-Modified` header on the index -- is not something a Hugo module can guarantee, because it lives in the consuming site's edge configuration, not in the generated document. A field the module can guarantee beats a header it cannot. The long-term home for this is the RFC repository itself, where the shape is defined.

### The digest contract

Each `source` is fetched at build time and **republished same-origin**, and the `sha256` digest is computed from the bytes of that published copy -- not from an upstream snapshot. There is no separate hashing step to fall out of sync, so the advertised hash and the served bytes can never disagree.

Three consequences a consumer must understand:

- **Pin `source` to a commit SHA, never a branch ref.** A branch moves, and a moved branch means the digest published last build describes bytes that have since changed.
- **A build-time remote fetch runs inside the consuming site's render clock** and counts against its build timeout budget. One fetch per entry, plus up to four short-timeout checks for a `skill-md` entry whose body names candidate sibling files -- a skill that names none costs nothing extra, and a skill whose first candidate answers stops there.
- **An entry whose digest does not match the served bytes fails closed** for any agent that verifies it, which is strictly worse than publishing nothing. Every failure path therefore omits the entry: a fetch error, an HTTP 404 (which `resources.GetRemote` reports as a nil resource rather than an error), or a field-validation failure each emit one deduplicated warning and drop that skill.

**With zero valid skills, no file is emitted at all.** An empty JSON shell at a `.well-known` path is a claim of a capability that does not exist.

The index also gates on `site.Language.IsDefault`, because this format sets `root = true`, which pins one path for every language; a multilingual site emits the index once, from the default language.

Field rules, validated before the fetch wherever they can be, so a malformed entry costs no round trip:

- **`name`** -- 1-64 characters of lowercase alphanumerics and hyphens with no leading, trailing, or consecutive hyphen (it becomes a published path segment), **unique** across the array, and, for a `skill-md` entry, equal to the `name` in the fetched front matter.
- **`type`** -- `'skill-md'` (the default, omit it) or `'archive'`. These are the convention's own two values; anything else is skipped.
- **`description`** -- 1-1024 characters. Optional for a `skill-md` entry, where omitting it publishes the skill's own front-matter description verbatim; required for an `archive`, which the module cannot read inside. Supplying one that differs from the front matter publishes yours and warns.
- **`source`** -- an absolute `http(s)` URL, and for a `skill-md` entry one ending in `.md`. Nothing validates the extension; two things depend on it. Hugo must be able to resolve SOME media type for the response, from a URL extension it knows or from a `Content-Type` it knows, and on v0.164.0 a `text/markdown` header alone does not resolve while a `.md` suffix always does -- so an extensionless source fails the fetch on many hosts. And the supporting-file check declines to run on a source that is not shaped like a file inside a directory, so an extensionless URL silently disables it.

Uniqueness is enforced for the same reason the digest is. The name is the sole path segment a skill is republished under, so two entries sharing one resolve to a single published artifact: Hugo's `resources.Copy` returns whichever resource reached that path first, so the second entry advertises its own description and digest over the FIRST entry's bytes. Both entries then verify, and one of them describes a skill this site never published. The name is also the index key a client caches by and the URL your readers bookmark, so the duplicate is skipped with a warning rather than published.

The name rule is not pedantry either: the format specification requires a skill's declared `name` to "match the parent directory name", and the parent directory here IS the configured name, so a mismatch would publish an artifact that is invalid the moment a client validates it. That entry is refused, deterministically and with no network involved, naming both values.

### A skill with supporting files is an archive, and the module republishes rather than builds one

The convention defines two distribution types and the module implements both. A skill that is one file is `skill-md`. A skill that ships anything beside its `SKILL.md` -- `scripts/`, `references/`, `assets/`, a bundled `LICENSE.txt` -- is an `archive`: its body addresses those files by relative path, and those paths resolve to nothing at all under a republished single file.

**The module fetches an archive already built; it cannot build one.** Hugo has no build-time archive writer, and no bitwise primitives with which to hand-assemble even an uncompressed zip, so the only shape it can support is the one it already uses for a `SKILL.md`: one URL in, one artifact republished same-origin, one digest computed from the bytes served. Point `source` at an archive your own release pipeline produced -- a release asset, or a file committed beside the skill -- and the module treats it exactly as it treats a `SKILL.md`.

**Do not point `source` at a code forge's source-archive endpoint.** `codeload.github.com/<owner>/<repo>/tar.gz/<sha>`, `github.com/<owner>/<repo>/archive/...`, GitLab's `/-/archive/`, Gitea and Forgejo's `/archive/`, Bitbucket's `/get/` and `api.github.com/repos/<owner>/<repo>/tarball` all wrap their contents in one directory named for the repository and the ref, so `SKILL.md` is not at the archive root and the convention requires a client to reject it. Those URL shapes are refused before the fetch with a warning naming the remedy. The check is a heuristic over URL shape: it cannot recognize a forge it has not been told about, and it deliberately does not fire on `releases/download/`, which is the supported way to publish a purpose-built archive.

**What the module verifies, and what it cannot.** The published extension is chosen from the artifact's magic number rather than from your URL or the response header, because `resources.Copy` keeps the source's media type whatever the target is named -- so a `.zip` that is really a gzip stream cannot ship mislabeled, and a `type` your bytes contradict is refused in both directions. A zip gets one further check, because it stores its member NAMES uncompressed: a root-level `SKILL.md` leaves two traces in the raw bytes that no separator precedes, one per name table, and an archive showing none of them is refused. Read that as a filter rather than a guarantee -- a member called `SUBSKILL.md`, an uncompressed member whose text mentions the name, or an archive comment leaves the same trace, and Hugo cannot parse a zip index to tell them apart, so a count that comes out at exactly one is published with a warning rather than trusted. A `.tar.gz` stores its names compressed and is opaque end to end.

Everything the module cannot see is **yours to guarantee**: that `SKILL.md` really sits at the root of a `.tar.gz`, that the archive contains no `..` path or absolute path, that a gzip stream really wraps a tar rather than a single compressed file, and that its `SKILL.md` front matter says what your index entry says.

### The `[security.http]` allow-list an archive needs

Hugo refuses to fetch a media type it was not told to accept, and reports it as `failed to resolve media type for remote resource`, which reads like a problem with the source rather than with your configuration. Add this to the consuming **site's** configuration:

```toml
[security.http]
  mediaTypes = ['^application/gzip$', '^application/x-gzip$', '^application/zip$', '^application/octet-stream$']
```

Four regular expressions rather than one, because the same archive arrives as `application/gzip` from one host and `application/x-gzip` from another, and because release-asset and object-storage hosts -- GitHub's `releases/download/` among them, which is what the example above recommends -- serve archives as `application/octet-stream`. Understand what that last entry widens: it admits any binary body from any URL the policy already allows. It costs no fidelity here, because the magic-number check runs on every archive whatever the header claimed, but it is a broader door than the other three, and a site whose archives all arrive correctly typed can leave it out. **A module cannot ship this**: Hugo ignores `security` configuration coming from a module, deliberately, so the decision to widen a fetch policy stays with the site that owns it. The list is ADDITIVE -- ordinary `text/markdown` fetches keep working with only these three entries present -- and it is matched against the RESPONSE header, not against the file extension.

### What your host must serve

The convention places requirements on the SERVER, and a static site's server is your host rather than Hugo. Verify with `curl -I` against your deployed site:

| Artifact                               | Required `Content-Type`         |
| -------------------------------------- | ------------------------------- |
| `/.well-known/agent-skills/index.json` | `application/json`              |
| a republished `SKILL.md`               | `text/markdown` or `text/plain` |
| a republished `.tar.gz`                | `application/gzip`              |
| a republished `.zip`                   | `application/zip`               |

Most hosts derive these from the file extension and need no help; where yours does not, the fix is a `_headers` file on Cloudflare Pages or Netlify, object metadata on S3 or R2, or a `types { }` block on nginx. `GET` and `HEAD` must both work, a missing skill must answer `404`, and CORS headers are worth setting if browser-based clients are meant to read the index.

**A `.tar.gz` must NOT be served with `Content-Encoding: gzip`.** That header tells every client to decompress the body in transit, so what the client hashes is not what you published and the digest can never match -- the feature fails closed at precisely the guarantee it exists to provide. The same trap catches the module on the way in, and it refuses such an entry rather than republishing a bare tar under a `.tar.gz` name.

One local check is worth distrusting: `hugo server` reports a republished archive with the media type of the source it was fetched from, so a preview showing `application/x-gzip` says nothing about what your host will serve.

### Supporting files are detected, not assumed

Pointing `source` at the `SKILL.md` of a multi-file skill used to publish a body whose every relative link 404s, silently, with every gate green: the fetch succeeded, the digest matched the bytes served, and a verifying agent got an intact, correctly-hashed document promising material this site never published. The module now looks for that case, and what it does about it is a decision you own.

It works by nominating file names out of the fetched body -- relative Markdown links, slash-bearing paths, capitalized file names -- and then RESOLVING each one against the skill's own `source` URL and asking the origin whether that file is really there. Nothing is concluded from the body alone, so a paragraph that merely mentions a file name proves nothing and says nothing.

**This is best-effort by construction, and you should not read it as a guarantee.** The module cannot enumerate a remote directory; no forge-independent way to do so exists. It can only check names the body itself supplies, so a skill whose supporting files are never named in its own text passes undetected.

Three further limits, each reported rather than hidden. A `source` carrying a query string, or one not shaped like a file inside a directory, makes a sibling request impossible -- the module says so and publishes, rather than pretending it checked. A `source` that REDIRECTS is checked against the URL you configured rather than the one that answered, because Hugo exposes no final URL; siblings then look absent when they exist, which is one more reason to configure the URL that actually serves the file. And a probe answered with an error rather than with the file or a `404` reads as "cannot tell" and is reported as such -- never as "absent", which would let a rate-limited origin quietly clear every multi-file skill. Nominating is deliberately generous and the probe supplies the precision, which is why the budget is capped at four requests per skill and a body naming more than that says so rather than reporting a clean bill of health it did not earn.

When a supporting file IS proven to exist, the default is to publish the skill and warn, naming the file and the remedy:

```toml
[params.agent.skills_index]
on_supporting_files = 'omit'    # default: 'warn'
```

`'omit'` refuses the entry instead, which is the stricter and arguably more honest reading -- an incomplete skill is worse than an absent one. It is not the default for one reason: **this index publishes no file at all when no entry survives**, so on a site with a single skill a detector that can only see what a body mentions would be able to delete the whole `/.well-known/agent-skills/` surface, and Hugo's remote-fetch cache never expires, so the same commit can reach a different verdict on a warm developer machine than on cold CI. A warning cannot do either of those things. Set `'omit'` when you would rather publish nothing than publish a skill whose supporting files your site does not serve.

**Publishing the supporting files loose, beside the `SKILL.md`, is deliberately not offered.** It would keep relative links working over HTTP, but the convention specifies sibling loading only for archives -- "For archive-based skills, the `SKILL.md` body references additional files via relative links. Agents load these from the unpacked archive on demand" -- so no conforming client is specified to look for them, and none could learn what the file set even is. It would mean publishing an unbounded, unknowable, undigested file tree that nothing is required to read.

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

The module authors exactly sixteen user-facing strings: seven headings in generated documents, four display labels for the module's site-level surfaces -- returned by the [`surfaces.html`](#surfaceshtml) public partial, and, for the two link indexes, also naming them in a twin's [trailing pointer section](#the-trailing-pointer-section) -- the name and note of two derived `llms.txt` entries (the complete link index in `## Start here` and the Agent Skills index in `## Optional`), and the disclosure a narrowed section of the compact `llms.txt` opens with. English and Russian ship with the module; every lookup carries an English fallback, so a site whose language ships no translation still renders a real string rather than an empty one.

| Key | English |
| --- | --- |
| `agent_sitemap_heading_sitemap` | `Sitemap` |
| `agent_sitemap_heading_llms` | `Site index` |
| `agent_section_pages_heading` | `Pages` |
| `agent_facts_title` | `About` |
| `agent_facts_identity_heading` | `Identity` |
| `agent_facts_contact_heading` | `Contact` |
| `agent_llms_start_heading` | `Start here` |
| `agent_surface_llms` | `llms.txt` |
| `agent_surface_llms_index` | `Complete index` |
| `agent_surface_facts` | `Site facts` |
| `agent_surface_skills` | `Agent Skills index` |
| `agent_llms_index_entry_name` | `Complete index` |
| `agent_llms_index_entry_note` | `Every page of every section, complete.` |
| `agent_llms_partial_note` | `This section lists %d of %d pages; a page missing here may still exist on the site.` |
| `agent_skills_entry_name` | `Agent Skills index` |
| `agent_skills_entry_note` | `Machine-readable index of this site's published agent skills` |

The twin's trailing pointer heading follows the resolved `sitemap_section_target`: `agent_sitemap_heading_llms` heads the section when it points at the link indexes, and `agent_sitemap_heading_sitemap` when it points at `sitemap.xml` -- the latter also heads `/about.md`'s dual-pointer block, which always includes `sitemap.xml`. The links the section heads carry their own labels, `agent_surface_llms` and `agent_surface_llms_index`, which are the same two keys the surface enumeration uses; overriding the heading leaves them untouched. The `agent_sitemap_heading` key is deliberately NOT shipped: it is the consumer-side override key. Hugo merges i18n files per key with the site's own value winning over a module's, so a site that defines `agent_sitemap_heading` forces that one heading over both target-derived defaults, while an undefined key resolves to the empty string and each lookup falls through to its shipped per-target default.

`agent_llms_partial_note` is the module's one FORMAT STRING: it carries exactly two `%d` verbs, filled with the number of pages the section kept and then the number the shared filter admitted. A translation may place them anywhere in its sentence, but must keep both, keep that order, and keep them spelled `%d` -- a dropped or renamed verb publishes a Go formatting error into the document instead of a number.

`## Optional` in `llms.txt` is deliberately not a translation key: it is fixed by the llmstxt.org convention and is a protocol token, not prose. Inside the translated values, `llms.txt` and `Agent Skills` stay untranslated in every language for the same reason: the former is the llmstxt.org protocol token and the latter is the agentskills.io convention's proper name.

## Non-goals

The module deliberately owns **no identity record, resolver, or validator**. A person record's contract is a list of the consuming site's own config paths, which no second site shares, and the module's only would-be consumer of such a record is the `agentfacts` document. A consuming site that wants build-time identity coherence implements it site-side; the module's `[facts.identity]` rows read a real content page and remain the module's own mechanism.

The module ships no `llms-full.txt` -- the documentation platforms' full-CONTENT document, which duplicates page bodies the twins already publish at stable URLs and carries real drift cost with no confirmed consumer. The [complete LINK index](#the-complete-index-llms-indextxt) it does ship is a different artifact and the drift objection does not reach it: it comes from the same page walk as the compact file, so there are no two copies of anything to fall out of step. The module also ships no taxonomy or term twins, no `Accept`-header content negotiation, no CSS, and no JavaScript.

## Publication answers

Every surface this module ships is deliberately allowed to publish NOTHING: a twin is withheld for an excluded page, `/llms-index.txt` and `/about.md` follow their own switches, and the Agent Skills index is withheld outright when no skill resolves, because an empty index at a `.well-known` path claims a capability that does not exist. Hugo publishes no file for a template that renders no bytes, and it reports that nowhere -- the output format stays listed on the page with a resolving `.RelPermalink`, at every log level.

So a site that also imports [`url-retirement`](../url-retirement/README.md) gets an answer rather than a guess. This module ships one small partial per format it owns, under `layouts/_partials/url-retirement/publishes/`, and that module's `/url-manifest.txt` asks them instead of trusting `.OutputFormats`: `markdown`, `llmstxt`, `llmsindex`, `agentfacts` and `agentskills`. Each answer delegates to `agent-readiness/surfaces.html` or `agent-readiness/twin-url.html` -- the same public resolvers a consumer would call -- so it can never drift from what the renderers actually do.

A site importing this module WITHOUT `url-retirement` pays nothing: no template calls those partials and Hugo never renders them. A site that replaces one of the twin or surface templates with a template of its own owns the answer too, and overrides the matching file the same way, because project layouts win over a module's.

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
│   ├── home.llmsindex.txt
│   ├── home.agentfacts.md
│   ├── home.agentskills.json
│   └── _partials/
│       ├── url-retirement/
│       │   └── publishes/      # answers the url-retirement manifest. See "Publication answers".
│       │       ├── markdown.html
│       │       ├── llmstxt.html
│       │       ├── llmsindex.html
│       │       ├── agentfacts.html
│       │       └── agentskills.html
│       └── agent-readiness/
│           ├── config.html
│           ├── page-list.html
│           ├── robots.html
│           ├── markdown-front-matter.html
│           ├── markdown-page.html
│           ├── llms.html
│           ├── facts.html
│           ├── skills.html
│           ├── twin-url.html       # PUBLIC API. See "Public partials".
│           ├── llms-url.html       # PUBLIC API. See "Public partials".
│           ├── surfaces.html       # PUBLIC API. See "Public partials".
│           ├── build-time.html     # PUBLIC API. See "Public partials".
│           └── lib/
│               ├── absolute-url.html
│               ├── build-time-value.html
│               ├── flatten-value.html
│               ├── inline.html
│               ├── llms-entry.html
│               ├── llms-index-url.html
│               ├── llms-partial-notice.html
│               ├── llms-select.html
│               ├── llms-url.html
│               ├── map-list.html
│               ├── markdown-link.html
│               ├── page-excluded.html
│               ├── page-included.html
│               ├── repo-archive-url.html
│               ├── section-pages.html
│               ├── section.html
│               ├── skill-archive.html
│               ├── skill-frontmatter.html
│               ├── skill-references.html
│               ├── skill-siblings.html
│               ├── skills-index-url.html
│               ├── surface-published.html
│               └── warn.html
├── test/                       # Validation suite: twenty-two Hugo fixture builds plus Node build-output assertions. See test/README.md.
├── go.mod
├── hugo.toml
└── README.md
```

One consumer-authored hook file (`layouts/_partials/agent-readiness/twin-extra.html`) is intentionally NOT shipped: the twin renderer calls it only behind a `templates.Exists` guard, so the hook is zero-cost until a consuming site creates the file. See [The twin-extra hook](#the-twin-extra-hook).

`test/` ships inside the module, as it does for every other module in this repository. Run it with `bash modules/agent-readiness/test/run-tests.sh` (or `run-tests.cmd` on Windows).
