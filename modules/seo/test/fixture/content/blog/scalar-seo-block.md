---
title: 'Scalar seo block'
description: 'Writes the whole seo front-matter block as a bare scalar.'
date: 2026-03-04T09:00:00Z
# The whole block, not one key inside it. resolve/description.html,
# resolve/robots.html and resolve/types.html each read this on EVERY page as
# `$page.Params.seo | default dict` and then `index` it -- and `index` on a
# string with a string key errors, so one page written this way stopped the
# whole build.
seo: 'not-a-table'
---

Prose for the scalar seo-block page.
