{{/*
  Markdown output variant of the hf-space shortcode. Hugo's shortcode template
  lookup is output-format-aware, so this template is selected automatically --
  for the SAME shortcode call -- whenever the page renders in a markdown
  output format (for example a Markdown twin built with .RenderShortcodes),
  while HTML output keeps the widget variants.

  It emits pure Markdown -- no HTML tags, no BEM classes, no SVG: one line
  citing the Space as [owner/name](https://huggingface.co/spaces/owner/name),
  enriched with the Space's emoji, display title, SDK, and like count when
  the Hub fetch succeeded:

    🤖 [owner/name](https://huggingface.co/spaces/owner/name) — Space Title (Gradio 4.44.0 · 1.2k likes)

  The title clause appears only when the display title actually differs from
  the Space name, and the SDK segment only when the Hub reports one. When the
  Hub fetch failed (the module's graceful-degradation contract), the line
  degrades to the bare [owner/name](...) link -- owner, name, and the
  canonical URL are parsed from the shortcode parameters alone, so the
  baseline never requires the Hub API. The data comes through the same cached
  fetch/derive partial as the HTML variants, so this template adds no network
  requests; the missing-token preflight warning is deduplicated build-wide
  via hugo.Store, and the fetch-failure warning is emitted with byte-identical
  text and position in both output formats, which Hugo's warning deduplication
  collapses to one -- a markdown render never emits a second warning.

  Parameters and validation are IDENTICAL to the HTML entry template
  (hf-space.html): id/url (either required, id wins), variant (validated
  against the same whitelist with a byte-identical message so a misused
  shortcode fails the build regardless of output format; the compact
  rendering is the same for every variant), title / description / emoji
  (the same fetch-layer overrides; description does not appear in the
  compact line), class (accepted for call-site compatibility; a Markdown
  line has no root element to class), and updated (validated against the
  same whitelist; the compact line renders no time label, so the mode
  changes nothing here).

  Usage (identical calls; the output format picks the template):
    hf-space id="gradio/hello_world"
    -> [gradio/hello_world](https://huggingface.co/spaces/gradio/hello_world) plus enrichment
    hf-space url="https://huggingface.co/spaces/owner/name" variant="hero"
    -> the same compact line; the variant changes nothing here
*/}}

{{- $id := .Get "id" | default "" -}}
{{- $url := .Get "url" | default "" -}}
{{- $variant := .Get "variant" | default "card" -}}
{{- $title := .Get "title" | default "" -}}
{{- $description := .Get "description" | default "" -}}
{{- $emoji := .Get "emoji" | default "" -}}
{{- $updated := .Get "updated" | default "relative" -}}

{{/* Validate that at least one locator was supplied. */}}
{{- if and (not $id) (not $url) -}}
  {{- errorf "The %q shortcode requires an 'id' (\"owner/name\") or a 'url' parameter. See %s" .Name .Position -}}
{{- end -}}

{{/* Validate variant against allowed values. */}}
{{- $validVariants := slice "inline" "card" "wide" "stats" "hero" -}}
{{- if not (in $validVariants $variant) -}}
  {{- errorf "The %q shortcode received invalid variant %q. Must be one of: inline, card, wide, stats, hero. See %s" .Name $variant .Position -}}
{{- end -}}

{{/* Validate the last-modified label display mode against allowed values. */}}
{{- $validUpdated := slice "relative" "date" "none" -}}
{{- if not (in $validUpdated $updated) -}}
  {{- errorf "The %q shortcode received invalid updated %q. Must be one of: relative, date, none. See %s" .Name $updated .Position -}}
{{- end -}}

{{/* Fetch and normalize Space data through the shared cached fetch layer. */}}
{{- $ctx := dict
  "id" $id
  "url" $url
  "variant" $variant
  "title" $title
  "description" $description
  "emoji" $emoji
  "position" .Position
-}}
{{- $data := partial "hf-space/fetch.html" $ctx -}}

{{/* Render layer: one Markdown line. The [owner/name](url) citation is the
     API-free baseline; emoji, title, SDK, and likes enrich it only when the
     fetch succeeded. Markdown metacharacters in the title are escaped so a
     title like "Demo [beta]" cannot open a stray link; CommonMark renders
     the escapes back to the literal characters. */}}
{{- $out := printf "[%s](%s)" $data.id $data.url -}}
{{- if $data.apiOk -}}
  {{- with $data.emoji -}}
    {{- $out = printf "%s %s" . $out -}}
  {{- end -}}
  {{- if and $data.title (ne $data.title $data.name) -}}
    {{- $titleEsc := replaceRE `([\[\]\\])` `\$1` $data.title -}}
    {{- $out = printf "%s — %s" $out $titleEsc -}}
  {{- end -}}
  {{- $meta := slice -}}
  {{- with $data.sdkLabel -}}
    {{- $sdkPart := . -}}
    {{- with $data.sdkVersion -}}
      {{- $sdkPart = printf "%s %s" $sdkPart . -}}
    {{- end -}}
    {{- $meta = $meta | append $sdkPart -}}
  {{- end -}}
  {{- $likesWord := T "hf_space_likes_word" (cond (lt $data.likesCount 1000) $data.likesCount 1000) | default "likes" -}}
  {{- $meta = $meta | append (printf "%s %s" $data.likesFormatted $likesWord) -}}
  {{- with $meta -}}
    {{- $out = printf "%s (%s)" $out (delimit . " · ") -}}
  {{- end -}}
{{- end -}}
{{- $out | safeHTML -}}
