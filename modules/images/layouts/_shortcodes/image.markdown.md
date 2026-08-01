{{/*
  Markdown output variant of the image shortcode. Hugo's shortcode template
  lookup is output-format-aware, so when a page renders its `markdown`
  output format (a Markdown twin emitting .RenderShortcodes), the SAME
  content call

    {{< image src="photo.jpg" alt="A described scene" >}}

  selects this template automatically instead of image.html -- no consumer
  action beyond wiring the built-in `markdown` output format for the page
  kind. The emitted shape is compact, pure Markdown (no HTML at all):

    ![alt](URL)
    caption

  one image line, plus the caption as plain text on its own line directly
  below it when a caption is present. Credit, license, lightbox, srcset,
  placeholders, and dark variants are HTML rendering features and have no
  Markdown representation here; decorative="true" renders the empty label
  "![](URL)".

  URL policy: the source resolves through the SAME partial chain as the
  HTML path (images/config.html for the cascade and kill-switch semantics,
  images/resolve/source.html for the source dict), then:
  - page/global resources emit the ORIGINAL resource's absolute .Permalink.
    Calling .Permalink publishes the original file -- deliberate: a Markdown
    reader gets one stable, full-fidelity URL instead of a derivative tied
    to a processing spec (the HTML path already publishes the original,
    whose URL is the source dict's RelPermalink-based url). A preserved
    query/fragment suffix survives the swap.
  - remote and data sources emit the raw URL verbatim (no fetch opt-in --
    the Markdown variant never processes anything).
  - static-kind paths emit absURL of the resolved site-relative URL, so the
    twin's URL targets exactly the file the HTML path's relative URL does.
  A destination carrying whitespace or parentheses is wrapped in angle
  brackets (valid CommonMark) so it cannot terminate the destination early.

  The `enable` kill switches do not change this output: the neutral
  fallback of the HTML path (original bytes, no processing) is already
  exactly what this variant emits.

  Validation and degradation: the same misuse fails the build with the same
  errorf contract as the HTML path -- a missing src errorfs here, and the
  alt/decorative/lightbox/layout/process shape checks run through the
  shared images/lib/validate.html. A source that resolves nowhere degrades
  exactly like the HTML path: one deduplicated warning through
  images/lib/warn.html on the SAME key the HTML renderer uses (so the two
  formats never double-warn), and the alt text alone is emitted as plain
  text, because a Markdown image pointing at a nonexistent file would be a
  dead reference. Unknown named parameters warn once on the same key as the
  HTML entry. Warnings tied to HTML-only features (inline captions,
  decorative captions, skipped processing features) belong to the HTML
  renderer and are not repeated here.
*/}}

{{- $args := dict "page" .Page "position" (printf "%s" .Position) -}}

{{- $vocab := slice "src" "alt" "decorative" "dark" "caption" "credit" "credit_from_meta" "license" "license_url" "width" "height" "process" "quality" "anchor" "resample" "bg" "hint" "compression" "layout" "widths" "max_density" "sizes" "sizes_auto" "formats" "loading" "priority" "fetchpriority" "placeholder" "lightbox" "theme_strategy" "fetch" "remote_key" "responsive" "enable" "class" "root_class" "id" -}}
{{- if .IsNamedParams -}}
  {{- range $k := $vocab -}}
    {{- if isset $.Params $k -}}
      {{- $args = merge $args (dict $k ($.Get $k)) -}}
    {{- end -}}
  {{- end -}}
  {{- range $k, $_ := .Params -}}
    {{- if not (in $vocab $k) -}}
      {{- partial "images/lib/warn.html" (dict
          "key" (printf "images:warn:unknown-param:image:%s:%s" $k (printf "%s" $.Position))
          "message" (printf "[images] Ignoring the unknown image shortcode parameter %q (see the README Parameters table for the accepted names). See %s" $k $.Position)) -}}
    {{- end -}}
  {{- end -}}
{{- else if gt (len .Params) 0 -}}
  {{- $args = merge $args (dict "src" (.Get 0)) -}}
  {{- if gt (len .Params) 1 -}}
    {{- $args = merge $args (dict "alt" (.Get 1)) -}}
  {{- end -}}
{{- end -}}

{{- if not $args.src -}}
  {{- errorf "[images] The image shortcode requires a source: pass it as the first positional argument or as src=. See %s" .Position -}}
{{- else -}}
  {{- $page := .Page -}}
  {{- $opts := partial "images/config.html" (dict "page" $page "args" $args) -}}
  {{- $fatal := partial "images/lib/validate.html" (dict "opts" $opts) -}}
  {{- if not $fatal -}}
    {{- $src := partial "images/resolve/source.html" (dict "page" $page "src" $args.src) -}}
    {{- $out := "" -}}
    {{- if $src.missing -}}
      {{- partial "images/lib/warn.html" (dict
          "key" (printf "images:warn:missing:%s" $src.url)
          "message" (printf "[images] Image %q could not be resolved as a page resource, a global resource, or a static path; the Markdown output emits its alt text only. See %s" $src.url $opts.where)) -}}
      {{- $out = partial "images/lib/md-text.html" (dict "text" $opts.alt "label" false) -}}
    {{- else -}}
      {{- $url := $src.url -}}
      {{- if and $src.resource (or (eq $src.kind "page") (eq $src.kind "global")) -}}
        {{- $url = printf "%s%s" $src.resource.Permalink (strings.TrimPrefix $src.resource.RelPermalink $src.url) -}}
      {{- else if eq $src.kind "static" -}}
        {{- $url = absURL $src.url -}}
      {{- end -}}
      {{- if findRE `[\s()]` $url -}}{{- $url = printf "<%s>" $url -}}{{- end -}}
      {{- $out = printf "![%s](%s)" (partial "images/lib/md-text.html" (dict "text" $opts.alt "label" true)) $url -}}
      {{- with $opts.caption -}}
        {{- $out = printf "%s\n%s" $out (partial "images/lib/md-text.html" (dict "text" . "label" false)) -}}
      {{- end -}}
    {{- end -}}
    {{- $out | safeHTML -}}
  {{- end -}}
{{- end -}}
