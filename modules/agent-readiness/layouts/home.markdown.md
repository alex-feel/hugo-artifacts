{{- $cfg := partial "agent-readiness/config.html" (dict "page" . "args" dict) -}}
{{- partial "agent-readiness/markdown-page.html" (dict "page" . "cfg" $cfg) -}}
