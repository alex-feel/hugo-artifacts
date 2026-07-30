---
title: 'Map taxonomies'
description: 'Nests a table inside the tags and seo.keywords lists, which Hugo front matter accepts.'
date: 2026-03-07T09:00:00Z
# The map-item form of the list mistake: a table nested inside a list meant
# to hold strings. `range` accepts it, so nothing aborts; the item instead
# stringifies as Go's debug form (map[...]) straight into article:tag and,
# comma-joined, into the JSON-LD keywords -- silently, exit 0. The unusable
# tags list must empty out so the keywords chain falls through to
# seo.keywords, whose own table entry is dropped while the usable scalar
# beside it is kept.
tags:
  - name: nested-tag
seo:
  keywords:
    - label: nested-keyword
    - 'usable-keyword'
---

Prose for the map-taxonomy page.
