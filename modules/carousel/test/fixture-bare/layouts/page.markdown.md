{{- /* Markdown twin body, standalone site: proves the twin renders plain
     Markdown (no images composition) via the same shared markup contract
     as the composed fixture's 06-markdown-twin coverage. */ -}}
---
title: "{{ .Title }}"
---

{{ .RenderShortcodes -}}
