{{/*
  Markdown output-format variant of the paired callout shortcode. Hugo's
  output-format-aware shortcode template lookup selects this template instead
  of callout.html when a page renders to a `markdown` output format (for
  example Markdown twin pages produced with .RenderShortcodes), so the twin
  carries a compact, pure-Markdown representation instead of the BEM HTML.

  Output is a GitHub-style alert blockquote -- exactly the syntax the module's
  own blockquote render hook (layouts/_markup/render-blockquote.html) accepts,
  so the emitted Markdown round-trips: re-rendering it through this module
  reproduces the equivalent callout.

    > [!WARNING]- Radiation hazard
    >
    > Do not approach without protective gear.

  Emission rules (verified against Hugo's alert parser, which requires a
  letters-only designator and reads an optional +/- fold sign plus an
  optional same-line title, with or without a sign):
  - The designator is the CANONICAL type from callout/resolve-type.html --
    the same single source of truth the HTML shortcode and the render hook
    use, so aliases canonicalize identically in both formats ("hint" emits
    [!TIP]). It is emitted uppercase per GitHub convention; the parser
    lowercases it back into .AlertType.
  - collapsible/open map onto the Obsidian-compatible fold sign the hook
    already reads: collapsible+open -> "+", collapsible+collapsed -> "-",
    static -> no sign.
  - A user-supplied title is emitted verbatim on the alert line, where it
    round-trips into the hook's .AlertTitle. An omitted title emits no title
    text: on re-render the hook falls back to the same resolver label the
    HTML shortcode defaults to.
  - The body is the RAW inner Markdown (never re-rendered through
    RenderString), with every line prefixed by "> " so the whole construct
    stays one blockquote; a lone ">" line separates the designator from the
    body so the designator stays its own paragraph, a form Hugo's alert
    parser explicitly supports.

  Parameters (same call surface and defaults as callout.html):
  - type (positional 0, or type=): callout type. Default "note". First-class
    types and aliases resolve to letters-only designators that re-parse as
    alerts. A CUSTOM slug is emitted the same way, but when it contains a
    digit or hyphen Hugo's letters-only alert grammar re-parses the result
    as a regular blockquote carrying the literal [!my-type] marker text --
    the type information survives as text, not as an alert.
  - title (positional 1, or title=): emitted verbatim on the alert line;
    line breaks inside a title collapse to spaces so the construct stays one
    blockquote. Omitted -> bare designator (default label on re-render).
    title="" (head suppression in HTML) has no alert-syntax equivalent and
    likewise emits the bare designator line.
  - collapsible / open (bool): same truthy/falsy tokens as callout.html
    (true/1/yes/on and false/0/no/off, any casing); an unrecognized token is
    treated as false with a one-shot warning shared with the HTML variant.
  - role, icon, id, class: accepted (the call surface is shared with
    callout.html) but have NO Markdown representation; they influence only
    the HTML render, which also validates them.

  Usage (identical calls -- this template only changes what the markdown
  output format emits):
    callout "tip"
    callout "danger" "Do not do this"
    callout type="warning" collapsible="true" open="true"

  Never errorf: same contract as callout.html. Warnings deduplicate through
  the SAME hugo.Store keys as the HTML variant, so one input problem warns
  once per build no matter which output formats render, or in which order.
*/}}

{{- $rawType := .Get 0 -}}
{{- if not $rawType -}}{{ $rawType = .Get "type" }}{{- end -}}
{{- $type := or $rawType "note" -}}

{{/* Title resolution mirrors callout.html: three states via the dedicated
     argument API (.IsNamedParams plus isset for named calls, the positional
     argument count otherwise), because a missing NAMED argument does not
     reliably come back as nil from `.Get` when other named arguments are
     present. */}}
{{- $titlePresent := false -}}
{{- $title := "" -}}
{{- if .IsNamedParams -}}
  {{- if isset .Params "title" -}}
    {{- $titlePresent = true -}}
    {{- $title = printf "%v" (.Get "title") -}}
  {{- end -}}
{{- else if ge (len .Params) 2 -}}
  {{- $titlePresent = true -}}
  {{- $title = printf "%v" (.Get 1) -}}
{{- end -}}

{{/* Boolean tokens mirror callout.html, including the one-shot warning. The
     hugo.Store keys are IDENTICAL to the HTML variant's, so the same bad
     token never warns twice across output formats. */}}
{{- $truthyTokens := slice "true" "1" "yes" "on" -}}
{{- $falsyTokens := slice "false" "0" "no" "off" "" -}}
{{- $collapsibleInput := printf "%v" (.Get "collapsible" | default false) -}}
{{- $collapsibleTok := lower (trim $collapsibleInput " \t\n\r") -}}
{{- $collapsible := in $truthyTokens $collapsibleTok -}}
{{- if and (not $collapsible) (not (in $falsyTokens $collapsibleTok)) -}}
  {{- $warnKey := printf "callout:warned-bool:collapsible:%s" $collapsibleTok -}}
  {{- if not (hugo.Store.Get $warnKey) -}}
    {{- hugo.Store.Set $warnKey true -}}
    {{- warnf "[callout] Ignoring unrecognized collapsible=%q (use true/1/yes/on or false/0/no/off, any casing). Treating it as false. See %s" $collapsibleInput .Position -}}
  {{- end -}}
{{- end -}}
{{- $openInput := printf "%v" (.Get "open" | default false) -}}
{{- $openTok := lower (trim $openInput " \t\n\r") -}}
{{- $open := in $truthyTokens $openTok -}}
{{- if and (not $open) (not (in $falsyTokens $openTok)) -}}
  {{- $warnKey := printf "callout:warned-bool:open:%s" $openTok -}}
  {{- if not (hugo.Store.Get $warnKey) -}}
    {{- hugo.Store.Set $warnKey true -}}
    {{- warnf "[callout] Ignoring unrecognized open=%q (use true/1/yes/on or false/0/no/off, any casing). Treating it as false. See %s" $openInput .Position -}}
  {{- end -}}
{{- end -}}

{{/* Resolve the type through the shared resolver -- the single source of
     truth for canonicalization, shared with callout.html and the blockquote
     render hook, so an alias emits the same designator the hook maps back. */}}
{{- $r := partial "callout/resolve-type.html" $type -}}
{{- $canonical := $r.canonical -}}

{{/* Unknown-type warning, deduplicated under the SAME key as the HTML
     variant: a typo surfaces once per build regardless of output format. */}}
{{- if not $r.known -}}
  {{- $warnKey := printf "callout:warned-unknown:%s" $canonical -}}
  {{- if not (hugo.Store.Get $warnKey) -}}
    {{- hugo.Store.Set $warnKey true -}}
    {{- warnf "[callout] Unknown callout type %q is rendered as a custom type (class callout--%s, data-callout-type=%q, no default icon). If this was a typo, use a first-class type or an alias; if intentional, define styles for this type in your site CSS. See %s" $canonical $canonical $canonical .Position -}}
  {{- end -}}
{{- end -}}

{{/* Fold sign: the exact inverse of the mapping the render hook applies
     ("+" => collapsible+open, "-" => collapsible+collapsed, "" => static). */}}
{{- $sign := "" -}}
{{- if $collapsible -}}
  {{- $sign = "-" -}}
  {{- if $open -}}
    {{- $sign = "+" -}}
  {{- end -}}
{{- end -}}

{{/* Alert-line title: only a user-supplied, non-blank title is emitted (the
     hook supplies the default label on re-render, matching the HTML
     variant's omitted-title default). Line breaks collapse to spaces so the
     alert line stays a single line. */}}
{{- $mdTitle := "" -}}
{{- if $titlePresent -}}
  {{- $mdTitle = trim (replaceRE `[\r\n]+` " " $title) " \t\n\r" -}}
{{- end -}}
{{- $alertLine := printf "> [!%s]%s" (upper $canonical) $sign -}}
{{- if $mdTitle -}}
  {{- $alertLine = printf "%s %s" $alertLine $mdTitle -}}
{{- end -}}

{{/* Body: the RAW inner Markdown, taken from .InnerDeindent for the same
     reason the HTML variant takes it -- a callout authored inside an indented
     Markdown structure would otherwise carry four spaces of indentation into
     the emitted blockquote, where the twin's reader parses it as a code
     block -- trimmed, line endings normalized to LF,
     every line prefixed with "> " (a bare ">" for empty lines) so the whole
     construct is one blockquote. The lone ">" after the designator keeps the
     designator its own paragraph. An empty body emits the designator line
     alone -- a valid alert, mirroring the HTML variant's empty-body
     tolerance. */}}
{{- $lines := slice $alertLine -}}
{{- $inner := .InnerDeindent | strings.TrimSpace -}}
{{- with $inner -}}
  {{- $lines = $lines | append ">" -}}
  {{- range split (replaceRE `\r\n?` "\n" .) "\n" -}}
    {{- if . -}}
      {{- $lines = $lines | append (printf "> %s" .) -}}
    {{- else -}}
      {{- $lines = $lines | append ">" -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- delimit $lines "\n" | safeHTML -}}
