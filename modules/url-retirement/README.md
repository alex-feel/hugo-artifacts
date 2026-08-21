# url-retirement

A Hugo module that makes a retired URL a real redirect and makes the set of published URLs checkable.

It publishes two documents and no markup at all: `/_redirects`, the host redirect map read by Cloudflare Pages, GitLab Pages and Netlify, carrying your own hand-written rules verbatim followed by one `301` per page alias, one per paginated list for the `/blog/page/1/` Hugo stops publishing, and one for the redirect Hugo runs between the site root and its default language; and `/url-manifest.txt`, one per language, listing every URL the build publishes and a host serves. Zero CSS, zero JavaScript, zero visual surface.

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
  #    format you already publish. Keep `html` among them, wherever you put it:
  #    a home page with no html output publishes no page at all, and takes its
  #    URL from the first format the list has left -- so every link to your
  #    front page and its sitemap entry would name this module's document.
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

### Telling the manifest when a format publishes nothing

Wiring a format onto a page is not the same as publishing a document for it. Hugo decides publication on the rendered BYTE LENGTH -- a template that emits the empty string makes Hugo write no file, one that emits a single space makes it write one -- and it reports the difference NOWHERE: the page keeps listing the format, `.RelPermalink` keeps resolving to the path nothing was written to, and the build log is silent at every level including `--logLevel debug`. Nothing on a Page or on an OutputFormat exposes it either. So a manifest built from `.OutputFormats` alone names URLs production answers 404 for, in the one document whose whole job is being compared against production.

The only party that knows is the template that decided to emit nothing, so this module asks it. A module or a site that owns a format whose template renders nothing for some pages ships one file:

```text
layouts/_partials/url-retirement/publishes/<format-name>.html
```

named for the output format, lowercased. It receives `(dict "page" PAGE "format" OUTPUTFORMAT)` and returns `true` when that page publishes a document in that format:

```go-html-template
{{- return (ne (partial "my-module/thing-url.html" (dict "page" .page)) "") -}}
```

It must `return` a BOOLEAN. A partial that prints its answer instead of returning one hands back the text it rendered; an empty render would then read as `false` and delete a live URL from the registry silently, which is the one failure this document cannot afford, so a non-boolean answer is refused with one warning per format and the URL stays listed. The best hook does not restate its producer's conditions but delegates to whatever the producer itself consults, so the answer cannot drift from what the template does.

A format with no such file is listed as wired, exactly as before -- so adding nothing keeps the previous behavior, and a hook can only ever REMOVE lines the build does not write. A site that replaces a module's format template with one of its own owns the answer too, and overrides the hook the same way, because project layouts win over a module's.

The sibling modules in this repository already answer for the formats they own, so a site that imports them needs no hook of its own: [`agent-readiness`](../agent-readiness/README.md) for `markdown`, `llmstxt`, `llmsindex`, `agentfacts` and `agentskills`, and [`search`](../search/README.md) for `searchindex` and `opensearch`. Those answers matter at ordinary settings rather than only in misconfigurations: `/.well-known/agent-skills/index.json` is deliberately not published by a site that configures no skills, and a Markdown twin is deliberately not published for a page carrying `agent: false` or a `noindex` robots value.

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

Add it to every list template that paginates. The partial never calls `.Paginate` or `.Paginator` itself, so it cannot replace your filtered, sorted collection with the default one. Ordering is safe by construction: Hugo renders one output format at a time within a language, and both documents are declared so they render after the HTML pass, so every registration that language made is already recorded when they are built. Weight this module's `urlmanifest` format below `html`'s and that inverts -- the manifest is written before any list page can register anything -- so every pager URL is refused with a warning naming it rather than quietly missing, the same diagnostic described under [Register URLs no page carries](#register-urls-no-page-carries).

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

### Register URLs no page carries

A build publishes things that are in no page collection and in no page's output formats, so the manifest cannot reach them however complete its walk is. A file the asset pipeline wrote is a Resource rather than a Page and exists only because some template read its URL. A page carrying `build.list = never` is in no collection at all, which is exactly how a module ships a page a site never lists. A file copied verbatim from `static/` is exposed to no template whatsoever. Omission is the SILENT direction for this document -- a URL missing from the registry is one whose disappearance from production the coverage check can never report -- so whoever publishes such a URL registers it:

```go-html-template
{{ $page := . }}
{{ with resources.Get "js/sw.js" }}
  {{ with (. | js.Build $opts).RelPermalink }}
    {{ if templates.Exists "_partials/url-retirement/register-url.html" }}
      {{ partial "url-retirement/register-url.html" (dict "page" $page "url" .) }}
    {{ end }}
  {{ end }}
{{ end }}
```

The page is captured before the `with` blocks because each of them rebinds the dot, and the asset is reached through `with` rather than dereferenced, because a missing asset would otherwise take the build down inside a module. Pass `.url` for one URL, `.urls` for several, or both. Every entry is a server-relative path beginning with `/`, carrying no whitespace and not beginning with `//`, which names another host rather than a path on this site; anything else is reported and dropped, by the same rule that checks an `extra` entry. The guard takes a path under `layouts/` WITH the `.html` suffix, which `partial` itself does not need, and the pre-v0.146 `partials/` spelling silently returns false -- so a module calls this unconditionally and a site that does not import this one pays nothing for the call.

Register what the build really WROTE, never what it intends to write. Every other line in the manifest is evidence that a file exists, and registration is the one arrival path that can ADD a line no file backs, which would put a URL production answers 404 for into the document written to be compared against production. Reading a Resource's `.RelPermalink` is what materializes it, so register the URL that read returned, where it returned it, and not from a branch that might publish nothing.

Do NOT register a content-addressed URL -- a fingerprinted script, a processed image, anything carrying a hash of its own contents. Such a URL changes whenever its source does, by design, so listing it reports a retirement and a new URL on every rebuild in a file whose only use is showing what genuinely changed. The same goes for anything a development build publishes and a production build does not, a source map most of all: a manifest structurally unequal to production's cannot be diffed against it. Those URLs are left out deliberately, and the manifest header says so.

Ordering is the one way a registration is lost, and this module tells you when it happens. Hugo renders one output format at a time within a language, positive weights ascending and then every zero-weight format, so `/url-manifest.txt` at weight 100 sees registrations made during any pass that renders before it and none made after. The `html` format is weight 10, so an html-pass template -- a layout, or a partial the consumer's `<head>` reaches -- is always in time; a format carrying no weight renders after every weighted one, so a registration made from its own template is not. A registration that arrives too late is refused with one warning naming the URL instead of vanishing into a map nothing reads again, and every registration on a site that weights this module's format below `html`'s is refused the same way, which is what that misconfiguration costs.

[`pwa`](../pwa/README.md) is the module in this repository that registers what it publishes: its service worker, whose URL is deliberately stable so the browser update check can find it, and its offline page, which is the `build.list = never` case. The others do not yet, and two things make that harder than it looks for them: [`agent-readiness`](../agent-readiness/README.md) publishes its Agent Skills artifacts from a `partialCached` whose first caller varies by build, so a registration there would sometimes run in a pass too late to count, and [`images`](../images/README.md) and [`seo`](../seo/README.md) publish the consuming site's OWN assets from resolvers that a zero-weight format's pass can reach first. Until that is settled, a site importing those modules names what it needs in `manifest.extra` -- which is also the answer for what belongs to the site rather than to any module: a hand-placed file under `static/` your own templates do not register, and a document whose publication is decided by a setting no template can read.

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

The last row is a limit on this one rule rather than on the module. A multihost site -- one giving each language its own `baseURL` -- gets no such redirect from Hugo and needs none, because every language is already served at its own host root; what it does get is described under `/_redirects` below.

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

On a **multihost** site there is no shared root to publish it to. Hugo gives every language its own publish root, so this file is written once per HOST, and each copy describes that host alone: its own pages' aliases, its own registered pagers, and its own `redirects` settings, which may legitimately differ from another language's. Retired URLs there are host-relative, because that is what the host serves -- an alias Hugo reports as `/de/alter-pfad` is served at `/alter-pfad` on the German host, and the rule says so. Nothing needs configuring for this; the module reads the shape off `hugo.IsMultihost`.

### `/url-manifest.txt`

One per language, sorted, one URL per line, behind a `#` comment header:

```text
# Every URL this build publishes and a host serves, for language "en", sorted, one per line.
# Generated by the url-retirement Hugo module. Lines starting with # are comments.
# A URL no page carries is here only because something registered it:
# a file copied verbatim from static/, anything the asset pipeline
# publishes, a page kept out of every page collection by
# build.list = never, and any document whose publication is decided by a
# setting no template can read. The module that publishes one registers
# it; name the rest in url_retirement.manifest.extra. A content-addressed
# URL is left out on purpose: a fingerprinted name changes with its own
# contents, so listing it would report a retirement on every rebuild.
# Also not listed: the redirect map this module publishes, which every
# host that reads it consumes at deploy time and serves at no URL, and
# whatever url_retirement.manifest.exclude names.
# One class can still be over-listed: an output format renders nothing
# for some pages and Hugo publishes no file, which it reports nowhere,
# so the format's owner answers for it through a publication hook. A
# format nobody answers for is listed as wired.
# Other languages: /de/url-manifest.txt
# 19 URLs follow.
/
/posts/
/posts/index.xml
/posts/page/2/
```

It lists every page crossed with the output formats that page actually PUBLISHES -- a feed, a Markdown twin and a JSON representation are published URLs like any other -- plus every URL registered for that language, whether by a list template registering its pagers or by a module registering what it published outside the page graph, plus whatever `manifest.extra` names, minus whatever `manifest.exclude` names. It carries no timestamp on purpose: the file exists to be compared against the copy production is serving, and a stamp would make every build differ in a line that says nothing about the URL surface.

Published rather than merely wired, because the two come apart: a format whose template renders nothing for a page makes Hugo publish no file for it, and Hugo says so nowhere. See [Telling the manifest when a format publishes nothing](#telling-the-manifest-when-a-format-publishes-nothing). A page Hugo renders no document for at all -- `build.render` set to `link`, which keeps the URL without the document -- contributes nothing either, in this mode or with `manifest.output_formats = false`.

One file this module publishes is deliberately absent from it: `/_redirects` itself. That document is a control file the host READS, not a page the host serves -- on Cloudflare Pages it answers 404 while `/sitemap.xml` and `/robots.txt` answer 200 -- so listing it would put one line in the manifest that no fetch against production can ever confirm, in a file whose only job is that comparison. Control files your own site renders through output formats of its own, a `_headers` map or a `_routes.json`, are the same case with an owner this module cannot enumerate: name them in `manifest.exclude` and they leave the manifest the same way.

Your deployment check then diffs the live manifest against the built one, instead of diffing sitemaps:

```bash
curl -fsS https://example.org/url-manifest.txt | grep -v '^#' | sort > live.txt
grep -v '^#' public/url-manifest.txt | sort > built.txt
comm -23 live.txt built.txt   # URLs production serves that this build no longer publishes
```

One manifest per language means the path depends on where that language sits. A default language served at the root publishes `/url-manifest.txt` and the others `/<lang>/url-manifest.txt`; under `defaultContentLanguageInSubdir = true` there is no manifest at the root at all, and the check starts at `/<defaultLang>/url-manifest.txt`. Every manifest's header names its siblings, so one of them is enough to find the rest.

On a multihost site each host publishes its own manifest at its own root, and the header names the others by their full URL rather than by a path, since a path on one host does not name a file on another.

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
| `manifest.exclude` | `[]` | URLs to leave out, for what the build publishes but no host serves: a control file your site renders through an output format of its own. Same entry shape as `extra`, subtracted last, so a path named by both keys is left out. An entry matching nothing is not reported, because each language has its own manifest. |

### Validation

Every value is checked, and every rejected value warns once and leaves the shipped default standing: an unknown status, an unknown trailing-slash mode, a boolean written as anything other than a true or false spelling, a table given to a key that expects a list or a path, a pagination segment carrying whitespace or a slash, a rules path that names no file, and a path the operating system rejects outright. An `extra` entry, an `exclude` entry and a registered URL are held to one rule, so each is rejected for the same reasons: it names no URL at all, it is empty, it does not begin with `/`, it begins with `//` and therefore names another host, or it carries whitespace, which the file format cannot survive because the manifest is one URL per line. A malformed registration is reported against the CALL that made it, naming the page, because whoever has to fix it wrote a template rather than a configuration file. The module never breaks a consuming build over its own configuration.

The boolean check is two-sided on purpose. Matching only the true spellings would make `enable = 'yse'` resolve to false and switch a document off with no diagnostic at all, which is the loudest thing this module can do reached in the quietest possible way.

The one exception is deliberate. An alias containing whitespace is a build ERROR naming both the alias and the page, because whitespace ends a field in this file format: Hugo neither sanitizes nor rejects such an alias, and the alternative to failing is publishing a rule that redirects somewhere nobody asked for.

On a multilingual site, `redirects` settings that resolve differently per language are reported once. `/_redirects` is published at the site root, so whichever language renders last would decide the file's contents; keep those keys in the site-wide table rather than inside `[languages.<lang>]`. A multihost site is exempt: each host has its own copy of the file, so a per-language `status` or `trailing_slash` is a real choice rather than a collision, and nothing is reported.

## What the manifest cannot see

Six classes, none of which the walk over pages can reach on its own. The first three get there when whoever published them registers the URL, and the fourth cannot be registered by anybody, because no template knows whether it was published; all four are named in the file's own header rather than left for you to discover. The last two are stubs the installation instructions above switch off, and they appear only on a site that did not:

- **Files copied verbatim from `static/`.** Hugo exposes that directory to no template, so nothing can enumerate it and nothing can confirm a given file was copied. Name a URL you care about in `manifest.extra`, or register it from one of your own templates if your site knows it published it.
- **Anything the asset pipeline publishes** -- a bundled worker, a script, a processed image. Those are resources rather than pages, reachable only from the template that built them, and that template registers the URL it read. What stays out is the content-addressed half: a fingerprinted URL changes with its contents by design, so a diff against production would report every rebuild as a change. See [Register URLs no page carries](#register-urls-no-page-carries).
- **A page kept out of every page collection** by `build.list = never`. Hugo publishes it and `site.Pages` cannot see it, which is exactly how a module ships a page a site never lists -- the [`pwa`](../pwa/README.md) module's offline page is one, and that module registers it from the template that renders it. A page of your own in that shape is yours to register or to name in `manifest.extra`.
- **Documents whose publication is decided by settings no template can read** -- `sitemap.xml`, `robots.txt`, `404.html`. `site.Config` exposes only the privacy and services blocks, so no template can tell whether your site publishes them, which leaves registration nothing to be evidence of. `manifest.extra` is the only answer here.
- **First-pager stubs, on a site that left `[pagination] disableAliases` at Hugo's default.** That setting is invisible for the same reason, so where it is off Hugo publishes `/blog/page/1/` and the manifest does not list it. Turning it on -- which the installation instructions above ask for -- removes the URL rather than the omission, and the generated rule takes over.
- **The default site's redirect, on a site that left `disableDefaultSiteRedirect` at Hugo's default.** Same shape again: Hugo publishes the stub at `/<defaultLang>/` or at the site root, and the manifest lists neither, because that stub belongs to no page. Setting 2 above removes the URL, and the generated rule takes over.

The mirror of those omissions is the one thing the manifest can still list wrongly: a format wired on a page whose template publishes nothing for it. See [Telling the manifest when a format publishes nothing](#telling-the-manifest-when-a-format-publishes-nothing) for who answers that and how. Hugo's `found no layout file for ...` warning does not cover it -- measured at v0.164.0 and at v0.160.0, that warning fires only for a format with no template of a matching SUFFIX, and Hugo silently borrows another template when one exists.

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
│   │       │   ├── manifest-path.html
│   │       │   ├── page-renders.html
│   │       │   ├── page-url.html
│   │       │   ├── prefix-url.html
│   │       │   ├── publishes.html
│   │       │   ├── record-url.html
│   │       │   ├── spellings.html
│   │       │   ├── url-shape.html
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
│   │       ├── register-pagers.html
│   │       └── register-url.html
│   ├── home.redirects
│   └── home.urlmanifest.txt
├── go.mod
├── hugo.toml
└── README.md
```
