---
title: 'Scalar taxonomies'
description: 'Writes tags and categories as bare scalars, which Hugo front matter accepts.'
date: 2026-03-02T09:00:00Z
# The bare scalar form. Hugo accepts it and many sites write it. Uncoerced it
# broke two ways at once: `range` rejected it and stopped the build, while
# `index` and `delimit` accepted it and iterated it byte-wise, publishing
# `"keywords": "115, 105, 110, ..."` into the JSON-LD. Nothing here is exotic.
tags: 'single-tag'
categories: 'single-category'
---

Prose for the scalar-taxonomy page.
