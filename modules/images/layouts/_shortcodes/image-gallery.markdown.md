{{/*
  Markdown output variant of the image-gallery shortcode. Hugo's shortcode
  template lookup is output-format-aware, so when a page renders its
  `markdown` output format (a Markdown twin emitting .RenderShortcodes),
  the SAME content call

    {{< image-gallery match="gallery/*" >}}

  selects this template automatically instead of image-gallery.html. The
  emitted shape is compact, pure Markdown (no HTML at all): one

    ![alt](URL)
    caption

  block per matched page resource -- the image line, plus the caption as
  plain text on its own line directly below it when a caption is present --
  with one blank line between items so each renders as its own block.

  Fidelity to the HTML path: the item set is the SAME $page.Resources.Match
  result in the SAME order, and per-item alt/caption derive exactly as in
  images/gallery.html -- alt from the resource's params.alt, caption from
  the resource title only when it differs from the resource name (so
  default titles never leak into captions). Crop, lightbox, index_pad,
  id, and class are HTML rendering features with no Markdown
  representation; the cascade keys are accepted (same vocabulary as the
  HTML entry) and simply have nothing to influence here, because this
  variant never processes anything.

  URL policy: every item emits the ORIGINAL resource's absolute .Permalink.
  Calling .Permalink publishes the original file -- deliberate: a Markdown
  reader gets one stable, full-fidelity URL instead of a derivative tied to
  a processing spec. A destination carrying whitespace or parentheses is
  wrapped in angle brackets (valid CommonMark).

  Validation and degradation, mirroring the HTML path: a missing match is
  the same authoring mistake and errorfs; a glob that matches nothing warns
  once through images/lib/warn.html on the SAME key the HTML renderer uses
  (so the two formats never double-warn) and renders nothing; an item
  without alt metadata warns once on the shared per-resource key and
  renders the empty label "![](URL)" -- the Markdown analog of the HTML
  path's alt="" degradation. Unknown named parameters warn once on the same
  key as the HTML entry. Item problems never break the build.
*/}}

{{- $args := dict "page" .Page "position" (printf "%s" .Position) -}}

{{- $vocab := slice "match" "crop" "lightbox" "index_pad" "id" "class" "widths" "sizes" "sizes_auto" "formats" "loading" "placeholder" "responsive" "enable" "quality" "anchor" "resample" "bg" "hint" "compression" "layout" "max_density" -}}
{{- if .IsNamedParams -}}
  {{- range $k := $vocab -}}
    {{- if isset $.Params $k -}}
      {{- $args = merge $args (dict $k ($.Get $k)) -}}
    {{- end -}}
  {{- end -}}
  {{- range $k, $_ := .Params -}}
    {{- if not (in $vocab $k) -}}
      {{- partial "images/lib/warn.html" (dict
          "key" (printf "images:warn:unknown-param:image-gallery:%s:%s" $k (printf "%s" $.Position))
          "message" (printf "[images] Ignoring the unknown image-gallery shortcode parameter %q (see the README Parameters table for the accepted names). See %s" $k $.Position)) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- if not $args.match -}}
  {{- errorf "[images] The image-gallery shortcode requires a match parameter carrying a page-resource glob, e.g. match=\"gallery/*\". See %s" .Position -}}
{{- else -}}
  {{- $page := .Page -}}
  {{- $opts := partial "images/config.html" (dict "page" $page "args" $args) -}}
  {{- $where := $opts.where -}}
  {{- $items := $page.Resources.Match (printf "%v" $args.match) -}}
  {{- if not $items -}}
    {{- partial "images/lib/warn.html" (dict
        "key" (printf "images:warn:gallery-empty:%s:%v" $where $args.match)
        "message" (printf "[images] The gallery glob %q matched no page resources; rendering nothing. See %s" $args.match $where)) -}}
  {{- else -}}
    {{- $blocks := slice -}}
    {{- range $items -}}
      {{- $alt := trim (printf "%v" (.Params.alt | default "")) " \t\n\r" -}}
      {{- $caption := "" -}}
      {{- if ne .Title .Name -}}{{- $caption = .Title -}}{{- end -}}
      {{- if not $alt -}}
        {{- partial "images/lib/warn.html" (dict
            "key" (printf "images:warn:gallery-alt:%s:%s" $page.RelPermalink .Name)
            "message" (printf "[images] Gallery resource %q has no alt text (set params.alt in the page's resources: metadata); rendering alt=\"\" and suppressing its lightbox anchor, because an anchor named by an empty alt fails WCAG 2.4.4/4.1.2. See %s" .Name $where)) -}}
      {{- end -}}
      {{- $url := .Permalink -}}
      {{- if findRE `[\s()]` $url -}}{{- $url = printf "<%s>" $url -}}{{- end -}}
      {{- $block := printf "![%s](%s)" (partial "images/lib/md-text.html" (dict "text" $alt "label" true)) $url -}}
      {{- with $caption -}}
        {{- $block = printf "%s\n%s" $block (partial "images/lib/md-text.html" (dict "text" . "label" false)) -}}
      {{- end -}}
      {{- $blocks = $blocks | append $block -}}
    {{- end -}}
    {{- delimit $blocks "\n\n" | safeHTML -}}
  {{- end -}}
{{- end -}}
