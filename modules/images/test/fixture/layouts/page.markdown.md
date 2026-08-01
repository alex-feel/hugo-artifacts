{{/* Markdown twin body for regular pages, mirroring how a consuming site's
     twin surface works: .RenderShortcodes expands every shortcode through
     its output-format-selected template -- the module's *.markdown.md
     variants here -- while leaving the surrounding Markdown untouched. */}}
{{- .RenderShortcodes -}}
