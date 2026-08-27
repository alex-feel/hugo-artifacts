{{/*
  Markdown twin of the home page: emits the page's own Markdown with every
  shortcode call resolved through its markdown output-format variant, which
  is how this fixture exercises accordion.markdown.md and
  accordion-item.markdown.md from the same content the HTML build renders.
*/}}
{{- .RenderShortcodes -}}
