# url-retirement

A Hugo module that makes a retired URL a real redirect and makes the set of published URLs checkable.

It publishes two documents and no markup at all: `/_redirects`, the host redirect map read by Cloudflare Pages, GitLab Pages and Netlify, carrying your own hand-written rules verbatim followed by one `301` per page alias; and `/url-manifest.txt`, one per language, listing every URL the build publishes. Zero CSS, zero JavaScript, zero visual surface.

Both answer the same failure, from opposite ends. A page that moves leaves an `aliases` entry behind, and Hugo turns that into a small HTML file containing a meta refresh -- a published file, which on these hosts wins over any redirect rule, and which no sitemap lists. A page that is deleted outright leaves nothing behind at all. In both cases a deployment check that compares the live `sitemap.xml` against the freshly built one sees nothing, because a sitemap is a filtered projection of the published surface rather than the surface itself: alias stubs are not in it, and neither are paginated list pages, which is how an indexed `/blog/page/4/` becomes a 404 with every check green.

## Installation

```toml
[[module.imports]]
  path = 'github.com/alex-feel/hugo-artifacts/modules/url-retirement'
```

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/url-retirement
hugo mod tidy
```

A local `layouts/home.redirects` or `layouts/home.urlmanifest.txt` in your own site overrides the module's.

## Requirements

Hugo v0.160.0 or newer, any edition. Go 1.22 or newer.

## Site configuration you have to add

Four things, and the module can set none of them for you. Hugo merges a module's `[mediaTypes]` and `[outputFormats]` tables into your configuration but ignores everything else a module's `hugo.toml` says about the site as a whole, so these live in your own configuration or nowhere.

```toml
# 1. Stop Hugo publishing a meta-refresh stub for every alias. Without this the
#    stub is a real file at the retired URL, and a real file wins over a
#    redirect rule, so the generated 301 never fires and nothing says so.
disableAliases = true

[pagination]
  # 2. The same thing for the first pager of every paginated list, which is a
  #    SEPARATE setting: /blog/page/1/ is an alias of /blog/ and survives the
  #    switch above.
  disableAliases = true

[outputs]
  # 3. Wire both formats onto the home page. A module's own [outputs] table is
  #    inert, so this list is the only place the wiring can happen -- and the
  #    list REPLACES Hugo's default rather than adding to it, so restate every
  #    format you already publish.
  home = ['html', 'rss', 'redirects', 'urlmanifest']

[params.url_retirement]

  [params.url_retirement.redirects]
    # 4. Move your hand-written rules here (see below).
    rules = 'url-retirement/_redirects'
```

### Combining this module with other modules that wire output formats

Your site configuration holds exactly ONE `[outputs]` table, and its lists are the union of every module's needs. A second `[outputs]` table in the same file fails the configuration load outright (`unmarshal failed: toml: table outputs already exists`); pasting one module README's `[outputs]` block over another's leaves a single table that loads cleanly, exits 0, warns about nothing -- and silently stops publishing every document the replaced list asked for, which for this module means the redirect map, the manifest, or both. So do not copy any module's block wholesale into a site that already has one: MERGE the names into the list already there. A site importing this module together with [`agent-readiness`](../agent-readiness/README.md), [`search`](../search/README.md), [`seo`](../seo/README.md) and [`pwa`](../pwa/README.md) wires all of them at once:

```toml
[outputs]
  home = ['html', 'rss', 'markdown', 'llmstxt', 'llmsindex', 'agentfacts', 'agentskills', 'searchindex', 'opensearch', 'webappmanifest', 'redirects', 'urlmanifest']
  section = ['html', 'rss', 'markdown']
  page = ['html', 'markdown']
```

### Move `static/_redirects` into `assets/`

If your site already keeps a hand-written `_redirects` file in `static/`, move it under `assets/` and point `redirects.rules` at it. This is not a matter of taste. Hugo copies `static/` into the publish directory and renders this module's document to the same path; the rendered file wins, and it wins with no warning at any log level, not even under `--printPathWarnings`. A site that keeps both loses every hand-written rule silently. Handing the rules to the module removes the collision instead of betting on which producer wins it, and the module copies them through verbatim, ahead of every generated rule, so they keep their precedence -- both hosts take the first matching rule.

```text
static/_redirects  ->  assets/url-retirement/_redirects
```

### Register paginated pages

Pager pages are reachable only through the paginator of the page that owns them. They are not in `site.Pages`, not in any page's output formats, and not in any sitemap, so no module can collect them on its own -- and a module that tried would either fail (asking a foreign page for its paginator inside a non-HTML output format raises `pagination not supported for this page`) or do damage (asking for it during the HTML pass CREATES one, publishing pager pages the site never asked for). So the site makes one call, passing the paginator it has already built:

```go-html-template
{{ $paginator := .Paginate .RegularPages }}
{{ partial "url-retirement/register-pagers.html" (dict "page" . "paginator" $paginator) }}
```

Add it to every list template that paginates. The partial never calls `.Paginate` or `.Paginator` itself, so it cannot replace your filtered, sorted collection with the default one. Ordering is safe by construction: Hugo renders one output format at a time across the whole site, and the manifest format is declared with a weight above the HTML format's, so every registration made during the HTML pass is already recorded when the manifest renders.

## What gets published

### `/_redirects`

Your hand-written rules first, exactly as you wrote them, then one rule per alias, sorted by source path:

```text
# Hand-written rules, owned by the site and copied verbatim.
/hand-written/  /notes/note-b/  301
/vendor/*  https://vendor.example/:splat  302
/legacy/first-post /posts/post-1/ 301
/legacy/first-post/ /posts/post-1/ 301
```

Every alias appears in two spellings by default. Hugo's `.Aliases` returns a path without a trailing slash, while the stub it would have published lands at `<alias>/index.html`, so the URL your visitors and Google actually hold carries the slash. Netlify documents that it normalizes the difference when matching; Cloudflare's documentation does not say that it does. Set `trailing_slash` to `slash` or `bare` once you know your host's behavior -- Cloudflare Pages caps the file at 2,000 static rules.

On a multilingual site the file is published once at the site root and contains every language's aliases, each pointing at its own translation.

### `/url-manifest.txt`

One per language, sorted, one URL per line, behind a `#` comment header:

```text
# Every URL this build publishes for language "en", sorted, one per line.
# Generated by the url-retirement Hugo module. Lines starting with # are comments.
# Not listed: files copied verbatim from static/, which Hugo exposes to no
# template, and any document whose publication is decided by a setting no
# template can read. Name those in url_retirement.manifest.extra.
# Other languages: /de/url-manifest.txt
# 20 URLs follow.
/
/_redirects
/posts/
/posts/index.xml
/posts/page/2/
```

It lists every page crossed with its output formats -- a feed, a Markdown twin and a JSON representation are published URLs like any other -- plus every registered pager URL, plus whatever `manifest.extra` names. It carries no timestamp on purpose: the file exists to be compared against the copy production is serving, and a stamp would make every build differ in a line that says nothing about the URL surface.

Your deployment check then diffs the live manifest against the built one, instead of diffing sitemaps:

```bash
curl -fsS https://example.org/url-manifest.txt | grep -v '^#' | sort > live.txt
grep -v '^#' public/url-manifest.txt | sort > built.txt
comm -23 live.txt built.txt   # URLs production serves that this build no longer publishes
```

## Parameters

Every key lives under `[params.url_retirement]` and is overridable there; the shipped values are in `data/url-retirement/defaults.toml`, where each one is documented beside its reason. There is deliberately no front-matter tier: both documents describe the whole site, and a single page cannot hold an opinion about a site-wide file without every other page contradicting it.

| Key | Default | Meaning |
| --- | --- | --- |
| `enable` | `true` | Master switch. When off, neither document is published: Hugo writes no file for a template that produces no output. |
| `redirects.enable` | `true` | The redirect map alone. |
| `redirects.rules` | `''` | Path below `assets/` of the hand-written rules copied verbatim ahead of the generated ones. Empty means the site has none. |
| `redirects.status` | `301` | Status emitted on generated rules. One of `301`, `302`, `303`, `307`, `308`. |
| `redirects.trailing_slash` | `'both'` | Which spelling of an alias to emit: `both`, `slash` or `bare`. |
| `manifest.enable` | `true` | The manifest alone. |
| `manifest.output_formats` | `true` | Whether to list a page's secondary output formats beside its primary URL. |
| `manifest.extra` | `[]` | Extra URLs to list, for what Hugo publishes but exposes to no template. |

### Validation

Every value is checked, and every rejected value warns once and leaves the shipped default standing: an unknown status, an unknown trailing-slash mode, a table given to a key that expects a list, a rules path that names no file, and a path the operating system rejects outright. The module never breaks a consuming build over its own configuration.

The one exception is deliberate. An alias containing whitespace is a build ERROR naming both the alias and the page, because whitespace ends a field in this file format: Hugo neither sanitizes nor rejects such an alias, and the alternative to failing is publishing a rule that redirects somewhere nobody asked for.

On a multilingual site, `redirects` settings that resolve differently per language are reported once. `/_redirects` is published at the site root, so whichever language renders last would decide the file's contents; keep those keys in the site-wide table rather than inside `[languages.<lang>]`.

## What the manifest cannot see

Two classes, both named in the file's own header rather than left for you to discover:

- **Files copied verbatim from `static/`.** Hugo exposes that directory to no template. If a retired URL of yours is a hand-placed HTML file there, name it in `manifest.extra`.
- **Documents whose publication is decided by settings no template can read** -- `sitemap.xml`, `robots.txt`, `404.html`. `site.Config` exposes only the privacy and services blocks, so the module cannot tell whether your site publishes them. `manifest.extra` again.

One more thing worth knowing rather than hiding: `.OutputFormats` reports the formats CONFIGURED for a page, so a page with a format wired but no matching template contributes a URL that publishes nothing. Hugo warns loudly for that case (`found no layout file for ...`), so the condition surfaces at build time rather than only here.

## Module structure

```text
modules/url-retirement/
├── data/
│   └── url-retirement/
│       └── defaults.toml
├── layouts/
│   ├── _partials/
│   │   └── url-retirement/
│   │       ├── config.html
│   │       ├── lib/
│   │       │   ├── prefix-url.html
│   │       │   ├── warn-emit.html
│   │       │   └── warn.html
│   │       ├── manifest/
│   │       │   └── lines.html
│   │       ├── redirects/
│   │       │   ├── aliases.html
│   │       │   └── lines.html
│   │       └── register-pagers.html
│   ├── home.redirects
│   └── home.urlmanifest.txt
├── go.mod
├── hugo.toml
└── README.md
```
