{{/*
  Compact Markdown variant of the github-repo shortcode. Hugo's output-format-
  aware shortcode lookup selects this template instead of github-repo.html
  whenever a page renders in a markdown output format -- for example when a
  markdown-format page template calls .RenderShortcodes -- so Markdown
  surfaces receive a compact citation instead of the widget HTML.

  Emits pure Markdown (no HTML tags, no BEM classes, no SVG): one line citing
  the repository as an [owner/repo](https://github.com/owner/repo) link,
  enriched with the description and key stats (stars, primary language,
  license) when the fetched data carries them. The baseline link derives from
  the url parameter alone, so it renders even when the GitHub API fetch failed
  or was rate-limited (the module's graceful-degradation contract). The data
  comes through the same cached fetch/derive partials as the HTML entry
  template, so this variant adds no network requests, and the fetch layer's
  warning deduplication (hugo.Store sentinels plus Hugo's collapsing of
  identical log messages) covers both output formats, so it re-emits no
  warnings.

  Parameters: identical to github-repo.html -- url, variant, name,
  description, class, updated. The variant parameter is passed through to the
  fetch layer so the request surface matches the HTML render of the same call
  (an inline call still fetches nothing); it does not change this compact
  rendering. The class and updated parameters are accepted for call-site
  compatibility and ignored -- a Markdown line has no root element and
  renders no time label. Parameter validation
  (missing url, invalid variant) lives in the HTML entry template, which
  renders the same page in the HTML output format and already stops the build
  with errorf; this template does not duplicate those checks and renders
  nothing when no url is present.

  Usage (identical calls; the output format picks the template):
    github-repo url="https://github.com/gohugoio/hugo"
    -> [gohugoio/hugo](https://github.com/gohugoio/hugo) — The world's fastest framework for building websites. (82.1k stars · Go · Apache-2.0)
    github-repo url="https://github.com/gohugoio/hugo" variant="inline"
    -> [gohugoio/hugo](https://github.com/gohugoio/hugo)
*/}}

{{- $url := .Get "url" | default "" -}}
{{- $variant := .Get "variant" | default "card" -}}
{{- $name := .Get "name" | default "" -}}
{{- $description := .Get "description" | default "" -}}

{{- $out := "" -}}
{{- if $url -}}
  {{/* Fetch and normalize repository data through the shared cached fetch layer. */}}
  {{- $ctx := dict
    "url" $url
    "variant" $variant
    "name" $name
    "description" $description
    "position" .Position
  -}}
  {{- $data := partial "github-repo/fetch.html" $ctx -}}

  {{/* Baseline citation: an owner/name link derived from the URL alone (the
       name override is honored, mirroring the HTML title). The Markdown
       link-text metacharacters (backslash and square brackets) are escaped so
       an unusual name override cannot break the link syntax; CommonMark
       renders the escapes back to the literal characters. */}}
  {{- $label := printf "%s/%s" $data.owner $data.name -}}
  {{- $label = replaceRE `([\[\]\\])` `\$1` $label -}}
  {{- $out = printf "[%s](%s)" $label $data.url -}}

  {{/* Description enrichment: present from the API or from the description
       override, so it can render even when the fetch failed. */}}
  {{- with $data.description -}}
    {{- $out = printf "%s — %s" $out . -}}
  {{- end -}}

  {{/* Key-stats enrichment, only when the API fetch succeeded. The plural
       count mirrors the HTML variants: a raw count below 1000 selects its own
       plural form; a compact-formatted display such as "1.2k" selects the
       form of 1000. */}}
  {{- if $data.apiOk -}}
    {{- $stats := slice -}}
    {{- if gt $data.stars 0 -}}
      {{- $starsWord := T "github_repo_stars_word" (cond (lt $data.starsCount 1000) $data.starsCount 1000) | default "stars" -}}
      {{- $stats = $stats | append (printf "%s %s" $data.starsFormatted $starsWord) -}}
    {{- end -}}
    {{- with $data.language -}}
      {{- $stats = $stats | append . -}}
    {{- end -}}
    {{- with $data.license -}}
      {{- $stats = $stats | append . -}}
    {{- end -}}
    {{- with $stats -}}
      {{- $out = printf "%s (%s)" $out (delimit . " · ") -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- $out | safeHTML -}}
