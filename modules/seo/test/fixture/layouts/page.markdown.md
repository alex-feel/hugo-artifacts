{{- /* A minimal Markdown representation, so the page carries a real
       `markdown` output format for the alternates allow-list to advertise.
       The seo module does not generate twins; this exists only to give the
       allow-list something true to point at. */ -}}
# {{ .Title }}

{{ .RawContent }}
