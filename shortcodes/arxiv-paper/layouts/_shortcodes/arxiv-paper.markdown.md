{{/*
  Compact Markdown variant of the arxiv-paper shortcode. Hugo's output-format-
  aware shortcode lookup selects this template instead of arxiv-paper.html
  whenever a page renders in a markdown output format -- for example when a
  markdown-format page template calls .RenderShortcodes -- so Markdown surfaces
  receive a compact citation instead of the widget HTML.

  Emits pure Markdown (no HTML tags, no BEM classes, no SVG): a one-line
  citation -- authors, year, title, and an arXiv:<id> link to the abstract
  page -- followed by the abstract as a blockquote. When the arXiv fetch failed
  (the module's graceful-degradation contract), the output falls back to what
  the shortcode parameters alone supply: a bare
  [arXiv:<id>](https://arxiv.org/abs/<id>) link. The data comes through the
  same cached fetch/derive partials as the HTML entry template, so this variant
  adds no network requests, and the fetch layer's warning deduplication covers
  both output formats, so it re-emits no warnings.

  Parameters: identical to arxiv-paper.html -- id, url, variant, title,
  abstract, enrich, class, revised. The variant, class and revised parameters
  are accepted for call-site compatibility but do not change this compact
  rendering. Parameter validation (missing locator, invalid variant, invalid
  revised mode) lives in the HTML entry
  template, which renders the same page in the HTML output format and already
  stops the build with errorf; this template does not duplicate those checks
  and renders nothing when no locator is present.

  Usage:
    arxiv-paper id="2512.24601"
    arxiv-paper url="https://arxiv.org/abs/1706.03762" enrich="all"
*/}}

{{- $id := .Get "id" | default "" -}}
{{- $url := .Get "url" | default "" -}}
{{- $variant := .Get "variant" | default "card" -}}
{{- $title := .Get "title" | default "" -}}
{{- $abstract := .Get "abstract" | default "" -}}
{{- $enrich := .Get "enrich" | default "" -}}

{{- $out := "" -}}
{{- if or $id $url -}}
  {{/* Fetch and normalize paper data through the shared cached fetch layer. */}}
  {{- $ctx := dict
    "id" $id
    "url" $url
    "variant" $variant
    "title" $title
    "abstract" $abstract
    "enrich" $enrich
    "position" .Position
  -}}
  {{- $data := partial "arxiv-paper/fetch.html" $ctx -}}
  {{- $link := printf "[arXiv:%s](%s)" $data.id $data.absURL -}}
  {{- if $data.apiOk -}}
    {{/* Citation line: Authors (year). Title. [arXiv:<id>](<abs URL>). */}}
    {{- $cite := partial "arxiv-paper/authors.html" (dict "authors" $data.authors "max" 3) -}}
    {{- with $data.publishedYear -}}
      {{- if $cite -}}
        {{- $cite = printf "%s (%v)" $cite . -}}
      {{- else -}}
        {{- $cite = printf "(%v)" . -}}
      {{- end -}}
    {{- end -}}
    {{- with $cite -}}
      {{- $cite = printf "%s. " . -}}
    {{- end -}}
    {{- $out = printf "%s%s. %s." $cite $data.title $link -}}
    {{- with $data.abstract -}}
      {{- $out = printf "%s\n\n> %s" $out . -}}
    {{- end -}}
  {{- else -}}
    {{/* Degraded: only what the shortcode parameters alone can supply. */}}
    {{- $out = $link -}}
  {{- end -}}
{{- end -}}
{{- $out | safeHTML -}}
