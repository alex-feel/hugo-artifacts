{{/*
  Markdown output-format variant of the accordion-item shortcode, selected
  automatically -- for the SAME content call -- whenever the page renders
  in a markdown output format, while HTML output keeps the native
  <details> disclosure.

  It emits the item's label followed by its raw inner Markdown:

    **Shipping**

    Ships in 2-3 days.

  The label mirrors the HTML structure decision rather than inventing one.
  When the container set heading=2..6, the HTML wraps the title in that
  heading level, so the twin emits an ATX heading of the same level; with
  no heading configured the HTML title is a plain span, so the twin emits
  a bold line. A heading level therefore never appears in the twin unless
  the author asked for document structure in the first place.

  The body is the RAW inner Markdown (deindented and trimmed, never
  re-rendered through RenderString -- the twin's consumer renders it), so
  nested shortcodes inside it have already produced their own Markdown
  output through their own markdown variants.

  Parameters: the same call surface as accordion-item.html. title is
  REQUIRED and errorfs identically when missing or blank, so a misused
  shortcode fails the build regardless of output format. open, id, and
  class are HTML rendering features with no Markdown representation --
  disclosure state, deep-link anchors, and classes all vanish in plain
  Markdown -- and are accepted and ignored; no id is minted here, so the
  page's id registry is untouched by a twin render.
*/}}

{{/* The diagnostics position, resolved through accordion/lib/position.html
     because a NESTED shortcode's own .Position collapses to "<file>:1:1" at
     Hugo v0.164.0; the partial substitutes the outermost ancestor's accurate
     position, which points at the container the item was authored in. */}}
{{- $where := partial "accordion/lib/position.html" . -}}

{{- $vocab := slice "title" "open" "id" "class" -}}
{{- if .IsNamedParams -}}
  {{- range $k, $_ := .Params -}}
    {{- if not (in $vocab $k) -}}
      {{- partial "accordion/lib/warn.html" (dict
          "key" (printf "accordion:warn:unknown-param:accordion-item:%s:%s" $k $where)
          "message" (printf "[accordion] Ignoring the unknown accordion-item shortcode parameter %q (see the README Parameters table for the accepted names). See %s" $k $where)) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- $rawTitle := "" -}}
{{- if .IsNamedParams -}}
  {{- if isset .Params "title" -}}{{- $rawTitle = printf "%v" (.Get "title") -}}{{- end -}}
{{- else -}}
  {{/* .Params is nil (not an empty slice) for a call with no arguments at
       all, and `len` raises on a nil pointer, so presence is tested with
       `with` before any positional argument is read. */}}
  {{- with .Params -}}
    {{- $rawTitle = printf "%v" ($.Get 0) -}}
  {{- end -}}
{{- end -}}
{{- $rawTitle = trim $rawTitle " \t\n\r" -}}
{{- if eq $rawTitle "" -}}
  {{- errorf "The %q shortcode requires a title (the summary text): {{< accordion-item \"Shipping\" >}} or title=\"Shipping\". A disclosure control with no accessible name is unusable with a screen reader. See %s" .Name $where -}}
{{- else -}}

{{/* Line breaks inside a title collapse to spaces so the label stays one
     Markdown line, whichever form it takes. */}}
{{- $label := trim (replaceRE `[\r\n]+` " " $rawTitle) " \t\n\r" -}}

{{/* The heading level comes from the CONTAINER's own arguments through
     .Parent, re-derived exactly as the HTML variant re-derives it: a
     nested shortcode runs before its parent's body, so no store the
     container writes can reach this template. */}}
{{- $heading := 0 -}}
{{- with .Parent -}}
  {{- $heading = (partial "accordion/lib/sc-config.html" (dict "sc" . "where" $where)).heading -}}
{{- end -}}

{{- $lines := slice -}}
{{- if $heading -}}
  {{- $lines = $lines | append (printf "%s %s" (strings.Repeat $heading "#") $label) -}}
{{- else -}}
  {{- $lines = $lines | append (printf "**%s**" $label) -}}
{{- end -}}
{{- with .InnerDeindent | strings.TrimSpace -}}
  {{- $lines = $lines | append "" -}}
  {{- $lines = $lines | append (replaceRE `\r\n?` "\n" .) -}}
{{- end -}}
{{- delimit $lines "\n" | safeHTML -}}

{{- end -}}
