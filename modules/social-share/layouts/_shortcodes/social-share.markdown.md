{{- /*
  Markdown output-format variant of the social-share shortcode. Hugo's
  shortcode template lookup is output-format-aware, so when a page renders its
  `markdown` output format -- a Markdown twin emitting .RenderShortcodes -- the
  same content call

    {{< social-share >}}
    {{< social-share networks="x,telegram,copy" heading="Share this" >}}

  selects this template instead of social-share.html.

  IT EMITS NOTHING, DELIBERATELY, and that is the whole point of its existing.
  Without this file Hugo falls back to the base .html template in the markdown
  pass -- measured behavior, not a theory -- and the twin then carries the full
  sharing bar: a <nav> landmark, a <ul>, one <a> per network, inline SVG icons
  and BEM class hooks, in a document whose contract is pure Markdown. A reader
  of a twin gets markup it cannot use, in place of the compact text it asked
  for.

  Emitting nothing rather than a link list is the same judgment the sibling
  modules already record for their presentation-only features: carousel's twin
  documents credit, license and lightbox as "HTML rendering features [with] no
  Markdown representation", and images/image.markdown.md says the same. A
  sharing bar is that kind of feature end to end. It is an affordance offered to
  a human reading the page in a browser, not content the page is about, and its
  targets are derived from the page's own URL rather than authored -- so a twin
  that dropped them loses nothing a reader of the twin can act on, while a twin
  that carried them would spend its opening lines on outbound links to services
  the reader is not using.

  The shortcode's parameters are therefore all accepted and all ignored here.
  Nothing is warned about either: a consumer writing {{< social-share >}} in
  content has done nothing wrong, and a diagnostic per twin per page would
  report a correct configuration as a fault.
*/ -}}
