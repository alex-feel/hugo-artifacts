---
title: Chunked search
# A page-tier page_size below the two-hit "gravity" result set, so a
# grouped query can pin that group counts track RENDERED results and grow
# with "show more"; count_pad rides the SHORTCODE call site below, pinning
# the shortcode's forwarded-key whitelist along with the zero-padded count
# element text against the bare data-search-count value.
search:
  page_size: 1
---

{{< search count_pad=2 >}}
