{{- /* Markdown twin body for regular pages: front matter plus
     .RenderShortcodes, so every page publishes the index.md twin the
     06-markdown-twin spec fetches to assert on carousel.markdown.md
     output. */ -}}
---
title: "{{ .Title }}"
---

{{ .RenderShortcodes -}}
