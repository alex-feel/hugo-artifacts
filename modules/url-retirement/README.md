# url-retirement

A Hugo module that makes a retired URL a real redirect and makes the set of published URLs checkable.

It publishes two documents and no markup at all: `/_redirects`, the host redirect map read by Cloudflare Pages, GitLab Pages and Netlify, carrying your own hand-written rules verbatim followed by one `301` per page alias, one per paginated list for the `/blog/page/1/` Hugo stops publishing, and one for the redirect Hugo runs between the site root and its default language; and `/url-manifest.txt`, one per language, listing every URL the build publishes. Zero CSS, zero JavaScript, zero visual surface.

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

Five things, and the module can set none of them for you. Hugo merges a module's `[mediaTypes]` and `[outputFormats]` tables into your configuration but ignores everything else a module's `hugo.toml` says about the site as a whole, so these live in your own configuration or nowhere.

```toml
# 1. Stop Hugo publishing a meta-refresh stub for every alias. Without this the
#    stub is a real file at the retired URL, and a real file wins over a
#    redirect rule, so the generated 301 never fires and nothing says so.
disableAliases = true

# 2. The same thing for Hugo's redirect between the site root and the default
#    language's own directory. Neither switch beside this one reaches it --
#    three stubs, three settings -- and it costs a site that publishes no such
#    redirect nothing: see "The default site's redirect" below.
disableDefaultSiteRedirect = true

[pagination]
  # 3. The same thing for the first pager of every paginated list, which is a
  #    SEPARATE setting: /blog/page/1/ is an alias of /blog/ and survives the
  #    switch above. The module generates the rule that replaces it, from the
  #    paginator your list template registers -- see "Register paginated pages".
  disableAliases = true

[outputs]
  # 4. Wire both formats onto the home page. A module's own [outputs] table is
  #    inert, so this list is the only place the wiring can happen -- and the
  #    list REPLACES Hugo's default rather than adding to it, so restate every
  #    format you already publish.
  home = ['html', 'rss', 'redirects', 'urlmanifest']

[params.url_retirement]

  [params.url_retirement.redirects]
    # 5. Move your hand-written rules here (see below).
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

Add it to every list template that paginates. The partial never calls `.Paginate` or `.Paginator` itself, so it cannot replace your filtered, sorted collection with the default one. Ordering is safe by construction: Hugo renders one output format at a time across the whole site, and both documents are declared so they render after the HTML pass, so every registration is already recorded when they are built.

Registration feeds BOTH documents, which is why it is worth making even on a list short enough to fit one pager. `/url-manifest.txt` gains every pager URL, and `/_redirects` gains the rule for the FIRST one -- the `/blog/page/1/` that setting 3 above stops Hugo publishing. Hugo mints that URL for every list a template paginates, a one-pager section included, and it is in no page's `.Aliases`, so a list you never register keeps its pager URLs invisible to the manifest AND loses `/blog/page/1/` to a 404 the moment you adopt the module.

The pagination URL segment -- the `page` of `/blog/page/2/` -- is read off the second pager of any list you register, per language, so a site that renamed it needs no configuration as long as one list in that language runs past a single pager. Where no such list exists, `redirects.pagination_path` supplies it. The module cannot read your `[pagination] path` directly: `site.Config` exposes the `services` and `privacy` blocks and nothing else.

If you localize that segment, restate the whole block. A `[languages.<lang>.pagination]` table REPLACES the site-wide one rather than merging with it, so a language naming only `path` silently reverts `pagerSize` to Hugo's default of 10 and `disableAliases` to `false` -- publishing, for that language alone, the exact stub setting 3 exists to suppress:

```toml
[languages.de]

  [languages.de.pagination]
    path = 'seite'
    pagerSize = 10
    disableAliases = true
```

### The default site's redirect

Hugo redirects between the site root and the directory its default language is served from, and which way it runs depends on where you put that language:

| Your configuration                                          | Hugo publishes | The module's rule |
| ----------------------------------------------------------- | -------------- | ----------------- |
| Two or more languages, default at the root                  | `/en/` -> `/`  | `/en/  /  301`    |
| `defaultContentLanguageInSubdir = true`, any language count | `/` -> `/en/`  | `/  /en/  301`    |
| One language at the root                                    | nothing        | none              |
| Multihost (a `baseURL` per language)                        | nothing        | none              |

The published form is a meta-refresh stub exactly like an alias stub, and it survives `disableAliases`: that switch governs the `aliases` front-matter field, while this redirect is minted by the language machinery. `disableDefaultSiteRedirect` is what switches it off, and setting 2 above asks for it so the generated rule is what answers.

The second row is the one worth reading twice. There the retired URL is your site root, so leaving that rule out does not degrade a corner of the site -- it 404s the address people type. That is also the only retired URL with a single spelling: trimming the slash off `/` leaves nothing, and no host matches an empty path.

Nothing here needs configuring. The module reads the shape off the default site itself -- `hugo.Sites.Default`, its language prefix and its home URL -- because Hugo exposes none of these settings to a template, and it emits the rule the shape calls for, whether or not you switched the stub off. Leave the switch at Hugo's default and the published file keeps winning, which makes the rule inert rather than wrong.

One dimension only: Hugo mints the same redirect for a default role and a default version, and `disableDefaultSiteRedirect` covers all three, but a site using those dimensions has a URL surface this module does not describe.

The last row of the table is a limit rather than a feature. A multihost site -- one giving each language its own `baseURL` -- gets no redirect from Hugo and none from this module, but it is not otherwise supported: `/_redirects` is then published once per host and each copy carries every language's rules, which is wrong on all of them. Use the module on a shared-domain multilingual site.

## What gets published

### `/_redirects`

Your hand-written rules first, exactly as you wrote them, then the generated ones -- one per alias, one per registered paginator's first pager, and one for the default site's redirect -- sorted together by source path:

```text
# Hand-written rules, owned by the site and copied verbatim.
/hand-written/  /notes/note-b/  301
/vendor/*  https://vendor.example/:splat  302
/blog/page/1 /blog/ 301
/blog/page/1/ /blog/ 301
/legacy/first-post /posts/post-1/ 301
/legacy/first-post/ /posts/post-1/ 301
```

The three producers share one sorted set so that two rules claiming the same retired URL are reported rather than silent -- both hosts take the first match, so the loser never receives its traffic.

A pager rule is emitted for every paginator your templates register, whatever `[pagination] disableAliases` says, because no template can read that setting. Leave it at Hugo's default and the stub stays published and keeps winning, which makes the rule inert rather than wrong; the installation instructions above turn it off precisely so the rule is what answers.

Every retired URL appears in two spellings by default. Hugo's `.Aliases` returns a path without a trailing slash, while the stub it would have published lands at `<alias>/index.html`, so the URL your visitors and Google actually hold carries the slash. Netlify documents that it normalizes the difference when matching; Cloudflare's documentation does not say that it does. Set `trailing_slash` to `slash` or `bare` once you know your host's behavior -- Cloudflare Pages caps the file at 2,000 static rules.

On a multilingual site the file is published once at the site root and contains every language's aliases, each pointing at its own translation, plus the one rule for the default site's redirect.

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

One manifest per language means the path depends on where that language sits. A default language served at the root publishes `/url-manifest.txt` and the others `/<lang>/url-manifest.txt`; under `defaultContentLanguageInSubdir = true` there is no manifest at the root at all, and the check starts at `/<defaultLang>/url-manifest.txt`. Every manifest's header names its siblings, so one of them is enough to find the rest.

## Parameters

Every key lives under `[params.url_retirement]` and is overridable there; the shipped values are in `data/url-retirement/defaults.toml`, where each one is documented beside its reason. There is deliberately no front-matter tier: both documents describe the whole site, and a single page cannot hold an opinion about a site-wide file without every other page contradicting it.

| Key | Default | Meaning |
| --- | --- | --- |
| `enable` | `true` | Master switch. When off, neither document is published: Hugo writes no file for a template that produces no output. |
| `redirects.enable` | `true` | The redirect map alone. |
| `redirects.rules` | `''` | Path below `assets/` of the hand-written rules copied verbatim ahead of the generated ones. Empty means the site has none. |
| `redirects.status` | `301` | Status emitted on generated rules. One of `301`, `302`, `303`, `307`, `308`. |
| `redirects.trailing_slash` | `'both'` | Which spelling of a retired URL to emit: `both`, `slash` or `bare`. |
| `redirects.pagination_path` | `'page'` | Your `[pagination] path`, for building the first-pager rule. Consulted only where the segment cannot be read off a pager URL: a language whose every registered list fits on one pager. |
| `manifest.enable` | `true` | The manifest alone. |
| `manifest.output_formats` | `true` | Whether to list a page's secondary output formats beside its primary URL. |
| `manifest.extra` | `[]` | Extra URLs to list, for what Hugo publishes but exposes to no template. Each entry is a server-relative path beginning with `/`; anything else is reported and dropped. |

### Validation

Every value is checked, and every rejected value warns once and leaves the shipped default standing: an unknown status, an unknown trailing-slash mode, a boolean written as anything other than a true or false spelling, a table given to a key that expects a list or a path, an `extra` entry that is not a server-relative path, a pagination segment carrying whitespace or a slash, a rules path that names no file, and a path the operating system rejects outright. The module never breaks a consuming build over its own configuration.

The boolean check is two-sided on purpose. Matching only the true spellings would make `enable = 'yse'` resolve to false and switch a document off with no diagnostic at all, which is the loudest thing this module can do reached in the quietest possible way.

The one exception is deliberate. An alias containing whitespace is a build ERROR naming both the alias and the page, because whitespace ends a field in this file format: Hugo neither sanitizes nor rejects such an alias, and the alternative to failing is publishing a rule that redirects somewhere nobody asked for.

On a multilingual site, `redirects` settings that resolve differently per language are reported once. `/_redirects` is published at the site root, so whichever language renders last would decide the file's contents; keep those keys in the site-wide table rather than inside `[languages.<lang>]`.

## What the manifest cannot see

Four classes. The first two are named in the file's own header rather than left for you to discover; the last two are stubs the installation instructions above switch off, and they appear only on a site that did not:

- **Files copied verbatim from `static/`.** Hugo exposes that directory to no template. If a retired URL of yours is a hand-placed HTML file there, name it in `manifest.extra`.
- **Documents whose publication is decided by settings no template can read** -- `sitemap.xml`, `robots.txt`, `404.html`. `site.Config` exposes only the privacy and services blocks, so the module cannot tell whether your site publishes them. `manifest.extra` again.
- **First-pager stubs, on a site that left `[pagination] disableAliases` at Hugo's default.** That setting is invisible for the same reason, so where it is off Hugo publishes `/blog/page/1/` and the manifest does not list it. Turning it on -- which the installation instructions above ask for -- removes the URL rather than the omission, and the generated rule takes over.
- **The default site's redirect, on a site that left `disableDefaultSiteRedirect` at Hugo's default.** Same shape again: Hugo publishes the stub at `/<defaultLang>/` or at the site root, and the manifest lists neither, because that stub belongs to no page. Setting 2 above removes the URL, and the generated rule takes over.

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
│   │       │   ├── extra-url.html
│   │       │   ├── prefix-url.html
│   │       │   ├── spellings.html
│   │       │   ├── warn-emit.html
│   │       │   └── warn.html
│   │       ├── manifest/
│   │       │   └── lines.html
│   │       ├── redirects/
│   │       │   ├── aliases.html
│   │       │   ├── language-root.html
│   │       │   ├── lines.html
│   │       │   ├── pagers.html
│   │       │   └── rules.html
│   │       └── register-pagers.html
│   ├── home.redirects
│   └── home.urlmanifest.txt
├── go.mod
├── hugo.toml
└── README.md
```
