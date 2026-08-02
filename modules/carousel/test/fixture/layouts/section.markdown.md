{{- /* Markdown twin body for section pages: without this template the
     section's markdown output stays wired but UNPUBLISHED. Not exercised by
     the gallery pages (all regular, bundle-kind pages), kept for parity
     with copy-page's fixture and in case a future spec adds a section
     call site. */ -}}
---
title: "{{ .Title }}"
---

{{ .RenderShortcodes -}}
