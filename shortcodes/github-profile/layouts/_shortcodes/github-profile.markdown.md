{{/*
  Compact Markdown variant of the github-profile shortcode. Hugo's output-
  format-aware shortcode lookup selects this template instead of
  github-profile.html whenever a page renders in a markdown output format --
  for example when a markdown-format page template calls .RenderShortcodes --
  so Markdown surfaces receive a one-line metric citation instead of the
  widget HTML.

  Emits pure Markdown (no HTML tags, no BEM classes, no SVG): a profile link
  as [github.com/login](https://github.com/login), enriched -- only when the
  GraphQL fetch succeeded -- with the headline metric sentence in the same
  shape and the same i18n vocabulary as the HTML metric strip: "2.4k commits,
  699 merged pull requests, 15 external repositories, 11 organizations, 79
  active days in the last 90 — plus 7,880 private contributions". The
  baseline link derives from the user parameter alone, so it renders even
  when the API fetch failed or was rate-limited (the module's graceful-
  degradation contract). The data comes through the same cached fetch/derive
  partials as the HTML entry template with the same arguments, so this
  variant adds no network requests and the fetch layer's warning
  deduplication covers both output formats.

  Parameters: identical to github-profile.html. user, history, merged-prs,
  show-streak, show-rank, and name feed the shared fetch/derive layer so the
  request surface matches the HTML render of the same call; variant,
  sections, avatar, attribution, class, and language-scope shape only the
  HTML widget and are accepted here for call-site compatibility and ignored
  -- language-scope selects which repositories the language ROW measures, and
  this variant renders no language row. Parameter validation
  (missing or malformed user, invalid enums) lives in the HTML entry
  template, which renders the same page in the HTML output format and already
  stops the build with errorf; this template does not duplicate those checks
  and renders nothing when the user parameter is absent or malformed, and it
  normalizes an invalid history to the default so no malformed API request is
  issued while the HTML side is failing the build.

  Usage (identical calls; the output format picks the template):
    github-profile user="alex-feel"
    -> [github.com/alex-feel](https://github.com/alex-feel): 2.4k commits, ...
*/}}

{{- $user := .Get "user" | default "" -}}
{{- $history := .Get "history" | default "year" -}}
{{- if not (in (slice "year" "all") $history) -}}
  {{- $history = "year" -}}
{{- end -}}
{{- $showStreak := eq (lower (printf "%v" (.Get "show-streak" | default false))) "true" -}}
{{- $showRank := eq (lower (printf "%v" (.Get "show-rank" | default false))) "true" -}}
{{- $mergedPrs := eq (lower (printf "%v" (.Get "merged-prs" | default false))) "true" -}}
{{- $name := .Get "name" | default "" -}}

{{- $out := "" -}}
{{- if findRE `^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$` $user -}}
  {{/* Fetch and derive through the shared cached layer, mirroring the HTML
       entry's arguments so both formats hit one cache entry and one warning
       surface. */}}
  {{- $raw := partial "github-profile/fetch.html" (dict
    "user" $user
    "history" $history
    "mergedPrs" $mergedPrs
    "position" .Position
  ) -}}
  {{- $d := partial "github-profile/derive.html" (dict
    "raw" $raw
    "requestedLogin" $user
    "history" $history
    "showStreak" $showStreak
    "showRank" $showRank
    "nameOverride" $name
  ) -}}

  {{/* Baseline citation: the profile link derives from the validated login
       alone (alphanumerics and inner hyphens, so no Markdown escaping is
       needed). */}}
  {{- $out = printf "[github.com/%s](%s)" $d.login $d.identity.profileUrl -}}

  {{/* Metric-sentence enrichment, only when the API fetch succeeded: the
       same groups, conditions, i18n labels, and separators as the HTML
       headline strip, as plain text. */}}
  {{- if $d.apiOk -}}
    {{- $parts := slice (printf "%s %s" (partial "github-profile/compact-number.html" $d.totals.commits) (T "github_profile_metric_commits" | default "commits")) -}}
    {{- if ge $d.mergedPrCount 0 -}}
      {{- $parts = $parts | append (printf "%s %s" (partial "github-profile/compact-number.html" $d.mergedPrCount) (T "github_profile_metric_merged_prs" | default "merged pull requests")) -}}
    {{- else -}}
      {{- $parts = $parts | append (printf "%s %s" (partial "github-profile/compact-number.html" $d.totals.prs) (T "github_profile_metric_prs" | default "pull requests (authored)")) -}}
    {{- end -}}
    {{- if gt $d.externalRepos 0 -}}
      {{- $parts = $parts | append (printf "%s %s" (partial "github-profile/compact-number.html" $d.externalRepos) (T "github_profile_metric_external_repos" | default "external repositories")) -}}
    {{- end -}}
    {{- if gt $d.externalOrgs 0 -}}
      {{- $parts = $parts | append (printf "%s %s" (partial "github-profile/compact-number.html" $d.externalOrgs) (T "github_profile_metric_external_orgs" | default "organizations")) -}}
    {{- end -}}
    {{- $parts = $parts | append (printf "%v %s" $d.recentActive (T "github_profile_metric_recent_days" | default "active days in the last 90")) -}}
    {{- with $d.rankLevel -}}
      {{- $parts = $parts | append (printf "%s %s" . (T "github_profile_rank_label" | default "activity score")) -}}
    {{- end -}}
    {{- $sentence := delimit $parts (T "github_profile_sep" | default ", ") -}}
    {{- if gt $d.totals.restricted 0 -}}
      {{- $restrictedFormatted := lang.FormatNumber 0 $d.totals.restricted -}}
      {{- $note := T "github_profile_restricted_note" (dict "count" $d.totals.restricted "formatted" $restrictedFormatted) | default (printf "plus %s private contributions" $restrictedFormatted) -}}
      {{- $sentence = printf "%s%s%s" $sentence (T "github_profile_note_sep" | default " — ") $note -}}
    {{- end -}}
    {{- $out = printf "%s: %s" $out $sentence -}}
  {{- end -}}
{{- end -}}
{{- $out | safeHTML -}}
