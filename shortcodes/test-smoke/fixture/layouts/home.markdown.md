{{- /* The Markdown twin of the home page. Rendering .RenderShortcodes rather
       than .Content is what selects each module's <name>.markdown.md variant
       over its HTML entry template, which is the only way those variants are
       exercised anywhere in this repository. */ -}}
{{ .RenderShortcodes }}
