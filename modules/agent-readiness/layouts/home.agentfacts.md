{{- $cfg := partial "agent-readiness/config.html" (dict "page" . "args" dict) -}}
{{- partial "agent-readiness/facts.html" (dict "page" . "cfg" $cfg) -}}
