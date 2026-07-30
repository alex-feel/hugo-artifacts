---
title: 'Falsy seo block'
description: 'Writes the whole seo front-matter block as false.'
date: 2026-03-05T09:00:00Z
# The FALSY twin of the scalar-seo-block mistake, and the quieter one: `with`
# treats false as absent, so gated on `with` this line produced no diagnostic
# at all while the page rendered its full head surface anyway.
seo: false
---

Prose for the falsy seo-block page.
