{{/*
  Markdown output-format variant of the accordion container shortcode.
  Hugo's output-format-aware shortcode template lookup selects this
  template instead of accordion.html when a page renders to a `markdown`
  output format (for example the Markdown twin pages produced with
  .RenderShortcodes), so the twin carries plain Markdown instead of the
  BEM HTML.

  A container has no Markdown representation of its own -- disclosure is a
  rendering behavior, and a reader of the twin sees the content it hides
  -- so this template emits only its children's Markdown, trimmed, with
  nothing wrapped around it. Each accordion-item emits its own labeled
  block (see accordion-item.markdown.md), so the sequence reads as an
  ordinary titled section list.

  Parameters: the same call surface as accordion.html, so a shared content
  call never warns here about a parameter the HTML variant consumes.
  heading is the one that still applies -- it decides whether the items'
  titles emit as Markdown headings or as bold lines -- and each item
  re-derives it from this container's arguments exactly as the HTML
  variant does. exclusive, group, icon, id, and class are HTML rendering
  features with no Markdown representation and are accepted and ignored.

  Warnings deduplicate through the SAME keys as the HTML variant (the
  shared accordion/lib helpers, keyed by position or token), so one input
  problem warns once per build no matter which output formats render, or
  in which order.
*/}}

{{/* The diagnostics position, resolved through accordion/lib/position.html
     because a NESTED shortcode's own .Position collapses to "<file>:1:1" at
     Hugo v0.164.0; a container nested inside another accordion's item is
     exactly that case, and the partial substitutes the outermost ancestor's
     accurate position. */}}
{{- $where := partial "accordion/lib/position.html" . -}}

{{- $vocab := slice "exclusive" "group" "heading" "icon" "id" "class" -}}
{{- if .IsNamedParams -}}
  {{- range $k, $_ := .Params -}}
    {{- if not (in $vocab $k) -}}
      {{- partial "accordion/lib/warn.html" (dict
          "key" (printf "accordion:warn:unknown-param:accordion:%s:%s" $k $where)
          "message" (printf "[accordion] Ignoring the unknown accordion shortcode parameter %q (see the README Parameters table for the accepted names). See %s" $k $where)) -}}
    {{- end -}}
  {{- end -}}
{{- else -}}
  {{/* .Params is nil (not an empty slice) for a call with no arguments at
       all, and `len` raises on a nil pointer, so presence is tested with
       `with` before any length is taken. */}}
  {{- with .Params -}}
    {{- partial "accordion/lib/warn.html" (dict
        "key" (printf "accordion:warn:positional:accordion:%s" $where)
        "message" (printf "[accordion] The accordion shortcode takes named parameters only; ignoring the positional arguments. See %s" $where)) -}}
  {{- end -}}
{{- end -}}

{{/* Nothing this template resolves is passed to the items: a nested
     shortcode executes before its parent's body, so each item re-derives
     the heading level from this container's own arguments through
     .Parent. The resolution still runs here so an invalid heading value
     warns from the container that carries it. */}}
{{- $cfg := partial "accordion/lib/sc-config.html" (dict "sc" . "where" $where) -}}

{{- $inner := .Inner | strings.TrimSpace -}}
{{- if eq $inner "" -}}
  {{- partial "accordion/lib/warn.html" (dict
      "key" (printf "accordion:warn:empty:%s" $where)
      "message" (printf "[accordion] The accordion shortcode has no inner content; rendering nothing. Author accordion-item shortcodes between its opening and closing tags. See %s" $where)) -}}
{{- else -}}
{{- $inner | safeHTML -}}
{{- end -}}
