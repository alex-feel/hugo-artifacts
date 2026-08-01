{{- /* Markdown twin body for section pages: without this template the
     section's markdown output stays wired but UNPUBLISHED, and the widget
     on /docs/ would point at a 404. */ -}}
---
title: "{{ .Title }}"
---

{{ .RenderShortcodes -}}
