{{/*
  Markdown output-format variant of the carousel shortcode. Hugo's shortcode
  template lookup is output-format-aware, so when a page renders its
  `markdown` output format (a Markdown twin emitting .RenderShortcodes), the
  SAME content call

    {{< carousel match="gallery/*" >}}
    {{< carousel items="gallery/one.jpg, gallery/two.jpg, /static/img/three.jpg" >}}

  selects this template automatically instead of carousel.html -- no
  consumer action beyond wiring the built-in `markdown` output format for
  the page kind. The emitted shape is compact, pure Markdown (no HTML at
  all, no class=, no data-*, no svg): one

    ![alt](URL)
    caption

  block per resolved slide -- the image line, plus the caption as plain
  text on its own line directly below it when a caption is present -- with
  one blank line between blocks so each renders as its own paragraph.
  Credit is an HTML rendering feature (rendered inside the figcaption as a
  <span class="carousel__credit">) with no Markdown representation here,
  mirroring images/image.markdown.md's own documented scope ("Credit,
  license, lightbox, srcset, placeholders, and dark variants are HTML
  rendering features and have no Markdown representation"); only the
  caption line is emitted.

  Fidelity to the HTML path (carousel/slides.html): the parameter surface,
  the match/items XOR rule, the resolved slide LIST, and its ORDER are
  IDENTICAL -- same $page.Resources.Match / $page.Resources.GetMatch /
  resources.Get / leading-slash / absolute-URL resolution chain, same
  per-item skip-and-warn behavior for an unresolvable items entry. Per-slide
  alt/caption derive exactly as in carousel/slides.html: alt from the
  bundle resource's trimmed params.alt (default ""), caption from the
  resource's .Title only when it differs from .Name (so default titles
  never leak into captions). id, class, label, labelledby, start, loop,
  mode, controls, picker, eager, lightbox, index_pad, and the modules/images
  pass-through vocabulary (widths, sizes, sizes_auto, formats, placeholder,
  quality, layout, responsive, anchor, resample, bg, hint, compression,
  max_density, dark, theme_strategy) are HTML rendering features with NO
  Markdown representation; they are accepted here (same vocabulary as the
  HTML entry, for call-surface parity so a shared content call never warns
  on this variant about a param the HTML variant consumes) and simply have
  nothing to influence in a plain image-plus-caption list. captions=false
  is the one accepted key that DOES still apply here (see below): it
  suppresses the caption line exactly as it suppresses figcaption in HTML.

  URL policy: every slide emits the ORIGINAL resource's absolute
  .Permalink (bundle/assets resources) or the already-resolved absolute/
  static URL (passthrough entries), never a processed derivative --
  deliberate, matching image.markdown.md and image-gallery.markdown.md: a
  Markdown reader gets one stable, full-fidelity URL. A destination
  carrying whitespace or parentheses is wrapped in angle brackets (valid
  CommonMark) so it cannot terminate the destination early.

  Validation and degradation, mirroring the HTML path exactly: this variant
  resolves slides directly rather than dispatching to carousel/slides.html
  (which renders HTML), so match and items are mutually exclusive and both
  errorf here through an equivalent XOR check carrying the same message
  shape as the HTML path's errorf, for message parity across formats.
  enable=false (same four-tier cascade, same carousel/config.html resolver)
  emits nothing at all. An empty match warns once through carousel/lib/warn.html
  on the SAME key carousel/slides.html uses (so the two formats never
  double-warn) and renders nothing. An unresolvable items entry warns once
  on the SAME per-entry key as the HTML path and is skipped -- one bad
  entry never breaks the whole carousel. An alt-less bundle resource warns
  once on the EXACT SAME hugo.Store key scheme carousel/slides.html
  documents and uses verbatim --
  printf "carousel-alt-%s-%s" $page.Path <resource .Name> -- so the same
  resource never double-warns across output formats; it still renders with
  the empty label "![](URL)", the Markdown analog of the HTML path's
  alt="" degradation. A passthrough (non-bundle) entry warns once on the
  SAME key as the HTML path and likewise renders with an empty label.
  Unknown named parameters warn once on the same key as the HTML entry.
  Slide-level problems never break the build; only the match/items misuse
  errorfs.
*/}}

{{- $args := dict "page" .Page "position" (printf "%s" .Position) "Ordinal" .Ordinal -}}

{{- $vocab := slice "match" "items" "id" "class" "label" "labelledby" "start" "loop" "mode" "controls" "picker" "captions" "eager" "lightbox" "index_pad" "enable" "widths" "sizes" "sizes_auto" "formats" "placeholder" "quality" "layout" "responsive" "anchor" "resample" "bg" "hint" "compression" "max_density" "dark" "theme_strategy" -}}
{{- if .IsNamedParams -}}
  {{- range $k := $vocab -}}
    {{- if isset $.Params $k -}}
      {{- $args = merge $args (dict $k ($.Get $k)) -}}
    {{- end -}}
  {{- end -}}
  {{- range $k, $_ := .Params -}}
    {{- if not (in $vocab $k) -}}
      {{- partial "carousel/lib/warn.html" (dict
          "key" (printf "carousel:warn:unknown-param:carousel:%s:%s" $k (printf "%s" $.Position))
          "message" (printf "[carousel] Ignoring the unknown carousel shortcode parameter %q (see the README Parameters table for the accepted names). See %s" $k $.Position)) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- $page := .Page -}}
{{- $where := printf "%s" .Position -}}

{{- $hasMatch := ne (trim (printf "%v" ($args.match | default "")) " \t\n\r") "" -}}
{{- $hasItems := ne (trim (printf "%v" ($args.items | default "")) " \t\n\r") "" -}}

{{- if and $hasMatch $hasItems -}}
  {{- errorf "[carousel] The carousel shortcode requires exactly one of \"match\" or \"items\", not both. See %s" $where -}}
{{- else if and (not $hasMatch) (not $hasItems) -}}
  {{- errorf "[carousel] The carousel shortcode requires exactly one of \"match\" or \"items\" (a bundle-resource glob or a comma-separated source list). See %s" $where -}}
{{- else -}}

{{- $cfg := partial "carousel/config.html" (dict "page" $page "args" $args) -}}
{{- if $cfg.enable -}}

{{/* ---- Input resolution: builds $entries, a slice of dicts each shaped
     dict "resource" (Resource or false) "url" (string, non-bundle only)
     "kind" ("bundle" | "static") -- IDENTICAL logic to carousel/slides.html
     so the same slide set, in the same order, resolves in both formats. ---- */}}
{{- $entries := slice -}}

{{- if $hasMatch -}}
  {{- $matched := $page.Resources.Match (printf "%v" $args.match) -}}
  {{- if not $matched -}}
    {{- partial "carousel/lib/warn.html" (dict
        "key" (printf "carousel:warn:match-empty:%s:%v" $where $args.match)
        "message" (printf "[carousel] The match glob %q matched no page resources; rendering nothing. See %s" $args.match $where)) -}}
  {{- else -}}
    {{- range $matched -}}
      {{- $entries = $entries | append (dict "resource" . "url" "" "kind" "bundle") -}}
    {{- end -}}
  {{- end -}}
{{- else -}}
  {{- range $raw := split $args.items "," -}}
    {{- $entry := trim $raw " \t\n\r" -}}
    {{- if ne $entry "" -}}
      {{- $resolved := false -}}
      {{- with $page.Resources.GetMatch $entry -}}
        {{- $entries = $entries | append (dict "resource" . "url" "" "kind" "bundle") -}}
        {{- $resolved = true -}}
      {{- end -}}
      {{- if not $resolved -}}
        {{- with resources.Get $entry -}}
          {{- $entries = $entries | append (dict "resource" . "url" "" "kind" "bundle") -}}
          {{- $resolved = true -}}
        {{- end -}}
      {{- end -}}
      {{- if not $resolved -}}
        {{- if hasPrefix $entry "/" -}}
          {{- $entries = $entries | append (dict "resource" false "url" (relURL $entry) "kind" "static") -}}
          {{- $resolved = true -}}
        {{- else if findRE `(?i)^[a-z][a-z0-9+.-]*://` $entry -}}
          {{- $entries = $entries | append (dict "resource" false "url" $entry "kind" "static") -}}
          {{- $resolved = true -}}
        {{- end -}}
      {{- end -}}
      {{- if not $resolved -}}
        {{- partial "carousel/lib/warn.html" (dict
            "key" (printf "carousel:warn:item-unresolvable:%s:%s" $where $entry)
            "message" (printf "[carousel] Skipping items entry %q: it did not resolve as a bundle resource, an assets/ resource, a leading-slash static path, or an absolute URL. See %s" $entry $where)) -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- if $entries -}}
{{- $blocks := slice -}}
{{- range $entries -}}
  {{- $r := .resource -}}
  {{- $isBundle := eq .kind "bundle" -}}
  {{- $alt := "" -}}
  {{- $caption := "" -}}
  {{- $url := .url -}}
  {{- if $isBundle -}}
    {{- $alt = trim (printf "%v" ($r.Params.alt | default "")) " \t\n\r" -}}
    {{- if ne $r.Title $r.Name -}}{{- $caption = $r.Title -}}{{- end -}}
    {{- $url = $r.Permalink -}}
    {{- if not $alt -}}
      {{- $altKey := printf "carousel-alt-%s-%s" $page.Path $r.Name -}}
      {{- partial "carousel/lib/warn.html" (dict
          "key" $altKey
          "message" (printf "[carousel] Slide resource %q has no alt text (set params.alt in the page's resources: metadata); rendering it with an empty alt label, and the HTML render also suppresses its lightbox anchor because a link named by empty alt fails WCAG 2.4.4/4.1.2. See %s" $r.Name $where)) -}}
    {{- end -}}
  {{- else -}}
    {{- partial "carousel/lib/warn.html" (dict
        "key" (printf "carousel:warn:no-alt-static:%s:%s" $where .url)
        "message" (printf "[carousel] The items entry %q resolves outside the page bundle, so it carries no resources: metadata; rendering it with an empty alt label, and the HTML render also suppresses its lightbox anchor. See %s" .url $where)) -}}
  {{- end -}}
  {{- if findRE `[\s()]` $url -}}{{- $url = printf "<%s>" $url -}}{{- end -}}
  {{- $block := printf "![%s](%s)" (partial "carousel/lib/md-text.html" (dict "text" $alt "label" true)) $url -}}
  {{- if and $cfg.captions $caption -}}
    {{- $block = printf "%s\n%s" $block (partial "carousel/lib/md-text.html" (dict "text" $caption "label" false)) -}}
  {{- end -}}
  {{- $blocks = $blocks | append $block -}}
{{- end -}}
{{- delimit $blocks "\n\n" | safeHTML -}}
{{- end -}}

{{- end -}}
{{- end -}}
