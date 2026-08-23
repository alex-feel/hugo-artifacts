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

If your site already keeps a hand-written `_redirects` file in `static/`, move it under `assets/` and point `redirects.rules` at it. This is not a matter of taste. Hugo copies `static/` into the publish directory and renders this module's document to the same path; the rendered file wins, and it wins with no warning at any log level, not even under `--printPathWarnings`. A site that keeps both loses every hand-written rule silently. Handing the rules to the module removes the collision instead of betting on which producer wins it, and the module copies them through verbatim, ahead of every generated rule, so they keep their precedence on the hosts that document one.

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

The page is captured before the `with` blocks because each of them rebinds the dot, and the asset is reached through `with` rather than dereferenced, because a missing asset would otherwise take the build down inside a module. Pass `.url` for one URL, `.urls` for several, or `.resource` when you have the Resource itself. Every entry is a server-relative path beginning with `/`, carrying no whitespace and not beginning with `//`, which names another host rather than a path on this site; anything else is reported and dropped, by the same rule that checks an `extra` entry. The guard takes a path under `layouts/` WITH the `.html` suffix, which `partial` itself does not need, and the pre-v0.146 `partials/` spelling silently returns false -- so a module calls this unconditionally and a site that does not import this one pays nothing for the call.

Pass `.resource` wherever you have one, because the content-addressed rule below is then applied for you rather than by you:

```go-html-template
{{ with resources.Get $path }}
  {{ $url = .Permalink }}
  {{ if templates.Exists "_partials/url-retirement/register-url.html" }}
    {{ partial "url-retirement/register-url.html" (dict "page" site.Home "resource" .) }}
  {{ end }}
{{ end }}
```

A resource is registered only when it is published under the name it came in with -- when the base name of its `.RelPermalink` is the base name of its `.Name`. Measured at Hugo v0.164.0, a derivative is published under a name carrying a hash of its own contents while `.Name` still reports the source's, so the two come apart exactly where the URL is content-addressed; a resource that fails the check is skipped silently, because a module resolving images meets derived ones as a matter of course and a warning per page per image would bury the diagnostics that mean something. The page passed is the RENDERING language's home, which is what `site.Home` names: a registration picks which language's manifest the URL belongs to, and that is the manifest the current pass is building.

Register what the build really WROTE, never what it intends to write. Every other line in the manifest is evidence that a file exists, and registration is the one arrival path that can ADD a line no file backs, which would put a URL production answers 404 for into the document written to be compared against production. Reading a Resource's `.RelPermalink` is what materializes it, so register the URL that read returned, where it returned it, and not from a branch that might publish nothing.

Do NOT register a content-addressed URL -- a fingerprinted script, a processed image, anything carrying a hash of its own contents. Such a URL changes whenever its source does, by design, so listing it reports a retirement and a new URL on every rebuild in a file whose only use is showing what genuinely changed. The same goes for anything a development build publishes and a production build does not, a source map most of all: a manifest structurally unequal to production's cannot be diffed against it. Those URLs are left out deliberately, and the manifest header says so.

Ordering is the one way a registration is lost, and this module tells you when it happens. Hugo renders one output format at a time within a language, positive weights ascending and then every zero-weight format, so `/url-manifest.txt` at weight 100 sees registrations made during any pass that renders before it and none made after. The `html` format is weight 10, so an html-pass template -- a layout, or a partial the consumer's `<head>` reaches -- is always in time; a format carrying no weight renders after every weighted one, so a registration made from its own template is not. A registration that arrives too late is refused with one warning naming the URL instead of vanishing into a map nothing reads again, and every registration on a site that weights this module's format below `html`'s is refused the same way, which is what that misconfiguration costs. So this partial is for a template that KNOWS which pass reaches it; where that cannot be known, the format's owner answers a question instead, which is the next section.

Every module in this repository that publishes a URL outside the page graph now declares it, and which of the two mechanisms it uses is decided by ONE question: can the module guarantee which render pass reaches it? [`pwa`](../pwa/README.md) can -- its service worker and its `build.list = never` offline page are built from the html pass and nowhere else -- so it registers, and so do [`seo`](../seo/README.md), [`images`](../images/README.md), [`social-share`](../social-share/README.md), [`carousel`](../carousel/README.md) and [`callout`](../../shortcodes/callout/README.md), each at the line where it reads the URL of a resource. [`agent-readiness`](../agent-readiness/README.md) cannot: its Agent Skills artifacts are copied by whichever caller first reaches a shared resolution, and those callers sit in different passes, so it ANSWERS a question this document asks instead (see below).

That a module publishes the consuming site's own file rather than one it ships makes no difference to which mechanism applies, and it is worth saying why. The resolver is the only party in the build that knows which resource materialized at which path -- it walked the page bundle, then `assets/`, then `static/`, chose a suffix, and decided not to process -- so a site restating that resolution in `manifest.extra` would be maintaining a copy of a rule that lives in the module, and a copy drifts. Ownership is untouched by the listing: `manifest.exclude` subtracts last, so a site that disagrees with any of it says so in one line, and a registration asserts nothing about who owns the URL.

What stays yours: a hand-placed file under `static/` no template reads, and a document whose publication is decided by a setting no template can read. Both go in `manifest.extra`.

### Answer for what an output format wrote besides its document

A registration is a push, and a push needs a sender that knows when it runs. Where a file is published by whichever caller first reaches a shared resolution, that is exactly what the module does not know: which caller wins is decided by the CONSUMING SITE's configuration, so the same registration lands on one site and is refused on another. Measured at Hugo v0.164.0 on the Agent Skills artifacts, a registration placed where they are copied was in time on every build at default settings and refused on every build with `manifest.output_formats = false`, because that setting decides whether the publication hook -- which is what triggers the copy early -- runs at all.

So for that case the manifest ASKS, during its own pass, where an answer cannot be late. A module or a site owning an output format that publishes files BESIDES the format's own document ships one file:

```text
layouts/_partials/url-retirement/writes/<format-name>.html
```

named for the output format, lowercased, beside the [`publishes/`](#telling-the-manifest-when-a-format-publishes-nothing) hook of the same name. It receives `(dict "page" PAGE "format" OUTPUTFORMAT)` and returns a SLICE of server-relative URLs -- `return slice` when it has none for this page:

```go-html-template
{{- $urls := slice -}}
{{- range partial "my-module/lib/artifacts.html" dict -}}
  {{- $urls = $urls | append .url -}}
{{- end -}}
{{- return $urls -}}
```

It is asked only where the `publishes/` hook answered true, because a format that published no document for a page did not publish its side files either: one resolution decides both. A format with no such file contributes nothing, so adding nothing keeps the previous behavior.

The obligations are the registration's, for the same reasons: name only what the build really WROTE, and leave content-addressed URLs out. One is easier to honor here -- reading a Resource's URL is what publishes it, so a hook that returns URLs it read has published them by reading them, while a hook that builds a path by string arithmetic is asserting rather than reporting and can name a 404. The answer must arrive through `return` as a SLICE: a partial that prints instead hands back the text it rendered, which is refused by type with one warning per format, and each element is then held to the same shape rule an `extra` entry is, so one malformed URL is refused alone rather than costing the whole answer.

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

The three producers share one sorted set so that two rules claiming the same retired URL are reported rather than silent -- Netlify and Cloudflare Pages both document that the first matching rule wins, so the loser never receives its traffic.

A pager rule is emitted for every paginator your templates register, whatever `[pagination] disableAliases` says, because no template can read that setting. Leave it at Hugo's default and the stub stays published and keeps winning, which makes the rule inert rather than wrong; the installation instructions above turn it off precisely so the rule is what answers.

Every retired URL appears in two spellings by default. Hugo's `.Aliases` returns a path without a trailing slash, while the stub it would have published lands at `<alias>/index.html`, so the URL your visitors and Google actually hold carries the slash. Netlify documents that it normalizes the difference when matching; neither Cloudflare Pages' nor GitLab Pages' documentation says whether it does. Set `trailing_slash` to `slash` or `bare` once you know your host's behavior -- it halves the rule count, and both of those hosts cap the file.

On a multilingual site the file is published once at the site root and contains every language's aliases, each pointing at its own translation, plus the one rule for the default site's redirect.

On a **multihost** site there is no shared root to publish it to. Hugo gives every language its own publish root, so this file is written once per HOST, and each copy describes that host alone: its own pages' aliases, its own registered pagers, and its own `redirects` settings, which may legitimately differ from another language's. Retired URLs there are host-relative, because that is what the host serves -- an alias Hugo reports as `/de/alter-pfad` is served at `/alter-pfad` on the German host, and the rule says so. Nothing needs configuring for this; the module reads the shape off `hugo.IsMultihost`.

### What each host documents about `_redirects`

One format, three readers, and they do not document the same feature set. Below is what each host's own redirect documentation states, read on 2026-08-24. A host may well do more than it has written down; the module assumes only this.

| What the documentation states | Netlify | Cloudflare Pages | GitLab Pages |
| --- | --- | --- | --- |
| Where the file goes | the publish directory | the build output directory | `public/` |
| Status codes documented | `301`, `302`, `404`, `200` | `301`, `302`, `303`, `307`, `308`, and `200` for proxying | `301`, `302`, `200` |
| Status when the rule omits one | `301` | `302` | `301` |
| Rule cap | no figure stated, though a deploy can fail if the serialized rule set is too large | 2,000 static plus 100 dynamic, and 1,000 characters per rule | 64 KB and 1,000 rules by default, configured per instance |
| Trailing slash normalized before matching | documented | not addressed | not addressed |
| First matching rule wins | documented | documented | not addressed |

Three consequences follow for a site using this module.

**`redirects.status` is portable at `301` and `302`, and nowhere else.** Of the five values that key accepts, those two are the only ones all three hosts document. Netlify's documentation says of `302` that it is to be used "instead of `307`, which is currently unsupported", and mentions neither `303` nor `308`; GitLab Pages documents none of the three. The module accepts all five because Cloudflare Pages documents all five, but a site on either of the other two hosts that sets `303`, `307` or `308` is relying on behavior its host has not committed to.

**A generated rule always carries its status, so the differing defaults never decide anything** -- the module writes the code on every line it produces. Hand-written rules copied through `redirects.rules` are yours, though, and a line you wrote without a code takes the host's default, which is `302` on Cloudflare Pages where the other two give `301`.

**The rule caps are what `trailing_slash` is for.** `both`, the default, emits two rules per retired URL, so a site retiring 600 URLs writes 1,200 rules and has already passed GitLab Pages' default cap -- the tightest of the three, and the one that silently processes only the first rules within it. Setting `slash` or `bare` halves the count once you know which spelling your host serves.

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
# it, or answers for it when this document asks the owner of an output
# format what else that format wrote; name the rest in
# url_retirement.manifest.extra. A content-addressed
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
curl -fsS https://example.org/url-manifest.txt > live-raw.txt || exit 1   # a fetch that failed is not an empty manifest
grep -v '^#' live-raw.txt | sort > live.txt
grep -v '^#' public/url-manifest.txt | sort > built.txt
comm -23 live.txt built.txt   # URLs production serves that this build no longer publishes
```

The fetch stands on its own line for the reason its comment gives. Piped straight into the filter it fails in the worst direction: `curl` writes nothing, the pipeline still exits 0 because the status of a piped command is discarded, and `comm -23` then prints nothing -- so a check that never fetched anything reports a clean run.

One manifest per language means the path depends on where that language sits. A default language served at the root publishes `/url-manifest.txt` and the others `/<lang>/url-manifest.txt`; under `defaultContentLanguageInSubdir = true` there is no manifest at the root at all, and the check starts at `/<defaultLang>/url-manifest.txt`. Every manifest's header names its siblings, so one of them is enough to find the rest.

On a multihost site each host publishes its own manifest at its own root, and the header names the others by their full URL rather than by a path, since a path on one host does not name a file on another.

#### Reading the first comparison

Three conditions make that comparison report something no URL was retired for, and each is worth knowing before the first run rather than after it. Two are on the PRODUCTION side and leave no trace in the built tree, because nothing there is wrong; the third is on the build side and names itself in the build log.

**Moving the pin across `723e4a3` reports `/_redirects` once.** Before that commit the module listed its own redirect map, so production is still serving a manifest that names it while this build no longer does. Neither half of the comment applies: the map is left out because a host READS it rather than serving it, as described above, and this build still writes the file. It is not a retirement and needs no rule, and it stops appearing once the new manifest is deployed.

**Adopting the check for the first time has nothing to compare against.** Production is not serving a manifest yet, so the fetch fails and the guard above stops the run there -- correctly, since a comparison needs both sides. One deploy ends the condition, and until then the built manifest is the only copy there is.

**An `extra` entry the shape rule now rejects leaves the built manifest too.** Entries are server-relative paths, and `caae6df` extended that check to two shapes it had been letting through: a protocol-relative `//host/path`, and an entry carrying whitespace. Such an entry was published before and is not now, so it turns up in the same output. It is on the build side rather than production's, the build names it in a warning, and unlike the two above it stays until the entry is fixed.

**A later narrowing would produce the same shape.** The two documents in that diff come from different builds of this module as well as from different content, so a line in the output has three possible sources: the URL really stopped being published and needs a rule; what the manifest lists narrowed while the build still publishes the URL; or your own configuration stopped being accepted. Only the first is a retirement, and the built tree settles which one it is -- a URL this build still publishes was not retired, whatever the two manifests say about it.

## Parameters

Every key lives under `[params.url_retirement]` and is overridable there; the shipped values are in `data/url-retirement/defaults.toml`, where each one is documented beside its reason. There is deliberately no front-matter tier: both documents describe the whole site, and a single page cannot hold an opinion about a site-wide file without every other page contradicting it.

| Key | Default | Meaning |
| --- | --- | --- |
| `enable` | `true` | Master switch. When off, neither document is published: Hugo writes no file for a template that produces no output. |
| `redirects.enable` | `true` | The redirect map alone. |
| `redirects.rules` | `''` | Path below `assets/` of the hand-written rules copied verbatim ahead of the generated ones. Empty means the site has none. |
| `redirects.status` | `301` | Status emitted on generated rules. One of `301`, `302`, `303`, `307`, `308` -- of which only `301` and `302` are documented by all three hosts, so see [What each host documents](#what-each-host-documents-about-_redirects) before choosing another. |
| `redirects.trailing_slash` | `'both'` | Which spelling of a retired URL to emit: `both`, `slash` or `bare`. |
| `redirects.pagination_path` | `'page'` | Your `[pagination] path`, for building the first-pager rule. Consulted only where the segment cannot be read off a pager URL: a language whose every registered list fits on one pager. |
| `manifest.enable` | `true` | The manifest alone. |
| `manifest.output_formats` | `true` | Whether to list a page's secondary output formats beside its primary URL. |
| `manifest.extra` | `[]` | Extra URLs to list, for what Hugo publishes but exposes to no template. Each entry is a server-relative path beginning with `/`; anything else is reported and dropped. An entry naming a URL the build already reaches on its own is reported too -- see [When an `extra` entry stops being load-bearing](#when-an-extra-entry-stops-being-load-bearing). |
| `manifest.exclude` | `[]` | URLs to leave out, for what the build publishes but no host serves: a control file your site renders through an output format of its own. Same entry shape as `extra`, subtracted last, so a path named by both keys is left out -- and a path named by both is never reported as a redundant `extra` entry either, since the exclusion is what decides the outcome. An entry matching nothing is not reported, because each language has its own manifest and matching nothing is what a correctly scoped entry looks like from the other one. |

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

### When an `extra` entry stops being load-bearing

An `extra` entry earns its place when nothing else in the build can see the URL. That can stop being true without your configuration changing at all: a module update starts registering the URL, or the owner of the output format that wrote it starts answering for it, and your line becomes a duplicate of an arrival path that is now live. The manifest is byte-identical either way, because the two paths are merged and deduplicated, so nothing about the file tells you which of your entries are still doing work.

That silence is the problem, because the two cases look identical and behave differently. A redundant entry keeps the URL in the file on the day the registration stops arriving -- exactly the disappearance this document exists to surface -- and your coverage check goes on passing. So the build says so, once per entry:

```text
WARN  [url-retirement] /sw.js is named in url_retirement.manifest.extra, and every language whose list names it already reaches that URL without it ...
```

Delete the line it names. Nothing about the published manifest changes, and the next time that URL really does go missing, you hear about it.

On a multilingual site the message waits for every language whose list names the entry -- which is what the wording above means and why it does not say every language. `extra` is ordinarily site-wide while each language renders its own manifest, so one entry can be redundant for one language and the only thing carrying its URL for another; such an entry is not reported, because deleting it would strip the URL from the language that needed it. An entry scoped to one language under `[languages.<lang>.params.url_retirement.manifest]` is answered for by that language alone, and a language that publishes no manifest answers for nothing.

An entry `manifest.exclude` also names is never reported either: the exclusion subtracts last and decides the outcome, so the entry is holding nothing up and removing it would change nothing. A language that excludes an entry the rest of the site names is not one the message waits for, since it answers for nothing.

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
│   │       │   ├── host-frame.html
│   │       │   ├── manifest-path.html
│   │       │   ├── page-renders.html
│   │       │   ├── page-url.html
│   │       │   ├── prefix-url.html
│   │       │   ├── publishes.html
│   │       │   ├── record-url.html
│   │       │   ├── spellings.html
│   │       │   ├── url-shape.html
│   │       │   ├── warn-emit.html
│   │       │   ├── warn.html
│   │       │   └── writes.html
│   │       ├── manifest/
│   │       │   ├── lines.html
│   │       │   └── redundant-extra.html
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
