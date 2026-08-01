{{- /* Markdown twin body for regular pages: front matter plus
     .RenderShortcodes, so every page publishes the index.md twin the copy
     row fetches and the view row links to. */ -}}
---
title: "{{ .Title }}"
---

{{ .RenderShortcodes -}}
