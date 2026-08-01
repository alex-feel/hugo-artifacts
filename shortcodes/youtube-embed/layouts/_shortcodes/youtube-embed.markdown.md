{{/*
  Markdown output variant of the youtube-embed shortcode. Hugo's shortcode
  template lookup is output-format-aware, so this template is selected
  automatically -- for the SAME shortcode call -- whenever the page renders in
  a markdown output format (for example a Markdown twin built with
  .RenderShortcodes), while HTML output keeps the click-to-load facade.

  Instead of the facade it renders the compact Markdown representation: one
  line linking to the canonical watch URL,

    [Title](https://www.youtube.com/watch?v=dQw4w9WgXcQ)

  with list= and t=Ns appended when set, and the playlist page URL for a
  playlist-only embed. The URL is built by the shared
  youtube-embed/watch-url.html lib partial -- the same single source of truth
  facade.html uses for its JS-off fallback link -- so the two output formats
  can never drift apart. When no title is given, the link text falls back to
  the localized youtube_embed_watch_on_youtube label. No HTML is emitted, and
  the poster machinery never runs, so a markdown render performs zero remote
  fetches.

  Locator parameters and validation are IDENTICAL to the HTML variant
  (youtube-embed.html): the same parse-id.html resolution, the same errorf on
  an invalid raw id or a missing/unresolvable locator -- a misused shortcode
  fails the build identically regardless of output format -- and the same
  warnings, emitted with byte-identical text so Hugo's log deduplication
  collapses them when both output formats render the same call.

  Parameters (see youtube-embed.html for the full HTML-surface docs):
  - id     (string)  Raw 11-char video id. Same precedence and validation as
                     the HTML variant.
  - url    (string)  Full YouTube URL in any recognized shape; the 11-char id
                     is extracted and validated, and a carried list= / t= /
                     start= is honored.
  - title  (string)  Link text. Falls back to the localized "Watch on YouTube"
                     label when empty.
  - start  (int)     Start offset in seconds; emits t=Ns on the watch URL.
                     Same fallback to a url-carried offset as the HTML variant.
  - end    (int)     Accepted and validated exactly as in the HTML variant so
                     an invalid value warns identically, but a watch URL
                     carries no end offset, so it does not affect the output.
  - list   (string)  Playlist id. With no video id the output links to the
                     playlist page.
  Presentation-only parameters (poster, params, loading, sizes, class,
  id-anchor/anchor, show-title) are accepted and ignored -- a Markdown line
  has no player, poster, or root element.

  Usage (identical calls; the output format picks the template):
    youtube-embed id="dQw4w9WgXcQ" title="Never Gonna Give You Up"
    -> [Never Gonna Give You Up](https://www.youtube.com/watch?v=dQw4w9WgXcQ)
    youtube-embed url="https://youtu.be/dQw4w9WgXcQ?t=42"
    -> [Watch on YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s)
    youtube-embed list="PLFsQleAWXsj_4yDeebiIADdH5FMayBiJo"
    -> [Watch on YouTube](https://www.youtube.com/playlist?list=PLFsQleAWXsj_4yDeebiIADdH5FMayBiJo)
*/}}

{{- $idParam := .Get "id" | default "" -}}
{{- $url := .Get "url" | default "" -}}
{{- $title := .Get "title" | default "" -}}
{{/* start/end presence is detected with isset, not `default`: Hugo parses an
     unquoted numeric argument to an int, and int 0 is falsy, so a `default
     ""` pipe would silently turn an explicit start=0 into "unset" while the
     quoted form start="0" stayed explicit. The printf normalizes both forms
     into one string surface for the numeric validation below. */}}
{{- $startRaw := "" -}}
{{- if and .IsNamedParams (isset .Params "start") -}}
  {{- $startRaw = printf "%v" (.Get "start") -}}
{{- end -}}
{{- $endRaw := "" -}}
{{- if and .IsNamedParams (isset .Params "end") -}}
  {{- $endRaw = printf "%v" (.Get "end") -}}
{{- end -}}
{{- $listParam := .Get "list" | default "" -}}

{{/* Parse and validate the locator. A raw id wins the video-id slot; a url
     supplied alongside still contributes its list= and t=/start= values. The
     explicit `list` parameter wins over a url-carried list. */}}
{{- $parsed := partial "youtube-embed/parse-id.html" (dict "id" $idParam "url" $url) -}}
{{- $id := $parsed.id -}}
{{- $list := or $listParam $parsed.list -}}

{{/* A URL pasted into id= is demoted by parse-id to the url slot and REPLACES
     a url= supplied alongside it; surface that replacement so the discarded
     url (including its t=/list=) does not vanish silently. Only an explicit
     http:// or https:// scheme marks a pasted URL. */}}
{{- $idParamIsUrl := or (hasPrefix (lower $idParam) "http://") (hasPrefix (lower $idParam) "https://") -}}
{{- if and $idParamIsUrl $url -}}
  {{- warnf "The %q shortcode received a URL in id=%q together with url=%q; the id URL wins and url is ignored entirely, including its t=/list=. See %s" .Name $idParam $url .Position -}}
{{- end -}}

{{/* A supplied raw id (not a pasted URL, which parse-id demotes to the url
     branch) must itself validate -- a playlist id mined from url= cannot
     rescue a bad raw id, or a typo would silently render a playlist-only
     embed instead of failing loudly. */}}
{{- $rawIdRejected := and $idParam (not $idParamIsUrl) (ne $parsed.id $idParam) -}}
{{- if $rawIdRejected -}}
  {{- errorf "The %q shortcode received an invalid id=%q. YouTube ids are exactly 11 characters of [A-Za-z0-9_-]. See %s" .Name $idParam .Position -}}
{{- end -}}

{{/* Surface a conflicting double locator: when id= wins over a url= carrying
     a DIFFERENT video id, the drop is warned so a copy-paste mistake does not
     go unnoticed. The url's list= and t=/start= are honored either way. */}}
{{- if and $idParam (not $rawIdRejected) $parsed.urlId (ne $parsed.urlId $parsed.id) -}}
  {{- warnf "The %q shortcode received id=%q and a url carrying a different video id %q; id wins and the url video id is ignored (the url's t=/list= are still honored). See %s" .Name $idParam $parsed.urlId .Position -}}
{{- end -}}

{{/* The embed is valid when parse-id resolved a usable id/list from id=/url=,
     OR a standalone list= parameter was supplied (a playlist-only embed). */}}
{{- $valid := or $parsed.valid (ne $listParam "") -}}

{{- if not $valid -}}
  {{- if and (not $idParam) (not $url) (not $listParam) -}}
    {{- errorf "The %q shortcode requires an 'id' (raw 11-char video id), a 'url' (any YouTube URL), or a 'list' (playlist id). See %s" .Name .Position -}}
  {{- else -}}
    {{- errorf "The %q shortcode could not extract a valid 11-character YouTube video id from id=%q url=%q. YouTube ids are exactly 11 characters of [A-Za-z0-9_-]. See %s" .Name $idParam $url .Position -}}
  {{- end -}}
{{- end -}}

{{/* Normalize start/end to non-negative integer seconds HERE, exactly as the
     HTML variant does, so validation warns identically regardless of output
     format. A non-numeric or negative value is ignored (treated as unset)
     with a single warning -- an optional timing hint must not fail the build.
     Leading zeros are stripped so the base-0 cast cannot read a zero-padded
     value as octal (int "011" -> 9) or die on an invalid octal digit (int
     "08" is fatal); an all-zero value trims to empty and counts as an
     explicit 0, and a run of more than NINE digits is warned and ignored --
     the cap matches the url-carried components in parse-id.html and keeps
     the surviving cast provably inside int64, so no try wrapper is needed.
     $startSet is set ONLY when the explicit start actually parsed, so every
     invalid value (non-numeric or over the cap) stays "treated as unset" and
     the url-carried offset below still applies. $end is validated purely for
     cross-format warning parity: a watch URL carries no end offset. */}}
{{- $start := 0 -}}
{{- $startSet := false -}}
{{- with $startRaw -}}
  {{- if findRE `^[0-9]+$` . 1 -}}
    {{- $s := strings.TrimLeft "0" . -}}
    {{- if gt (len $s) 9 -}}
      {{- warnf "The %q shortcode ignored an out-of-range start=%q (expected whole seconds of at most nine digits). See %s" $.Name . $.Position -}}
    {{- else -}}
      {{- with $s -}}
        {{- $start = int . -}}
      {{- end -}}
      {{- $startSet = true -}}
    {{- end -}}
  {{- else -}}
    {{- warnf "The %q shortcode ignored a non-numeric start=%q (expected whole seconds). See %s" $.Name . $.Position -}}
  {{- end -}}
{{- end -}}
{{- with $endRaw -}}
  {{- if findRE `^[0-9]+$` . 1 -}}
    {{- $e := strings.TrimLeft "0" . -}}
    {{- if gt (len $e) 9 -}}
      {{- warnf "The %q shortcode ignored an out-of-range end=%q (expected whole seconds of at most nine digits). See %s" $.Name . $.Position -}}
    {{- end -}}
  {{- else -}}
    {{- warnf "The %q shortcode ignored a non-numeric end=%q (expected whole seconds). See %s" $.Name . $.Position -}}
  {{- end -}}
{{- end -}}

{{/* A start offset carried in the URL (?t= / ?start=, e.g. youtu.be/ID?t=42)
     is honored only when no VALID explicit `start` parameter was supplied;
     the valid explicit parameter always wins, and an invalid one counts as
     unset. A url-carried offset parse-id had to discard (an overflowing
     component) is surfaced here, since this template holds the position. */}}
{{- if $parsed.startInvalid -}}
  {{/* When a URL pasted into id= was demoted to the url slot, quote THAT
       url -- the url= parameter it replaced would read as empty here. */}}
  {{- $offsetSource := cond $idParamIsUrl $idParam $url -}}
  {{- warnf "The %q shortcode ignored an out-of-range time offset carried in url=%q. See %s" .Name $offsetSource .Position -}}
{{- end -}}
{{- if and (not $startSet) (gt $parsed.start 0) -}}
  {{- $start = $parsed.start -}}
{{- end -}}

{{/* Render layer: one Markdown line. The link text is the title, or the
     localized watch-on-YouTube label when none was given -- the same label
     the HTML facade's fallback link shows for an untitled embed. The Markdown
     link-text metacharacters (backslash and square brackets) are escaped so a
     title like "C++ [Tutorial]" cannot break the link syntax; CommonMark
     renders the escapes back to the literal characters. */}}
{{- $label := $title -}}
{{- if eq $label "" -}}
  {{- $label = T "youtube_embed_watch_on_youtube" | default "Watch on YouTube" -}}
{{- end -}}
{{- $label = replaceRE `([\[\]\\])` `\$1` $label -}}
{{- $watchUrl := partial "youtube-embed/watch-url.html" (dict "id" $id "list" $list "start" $start) -}}
{{- printf "[%s](%s)" $label $watchUrl | safeHTML -}}
