---
title: 'Post One'
description: 'A post with prose, a heading, a link and a shortcode call.'
date: 2026-02-01T09:00:00Z
lastmod: 2026-06-15T12:00:00Z
# The ONLY page in the fixture carrying the shipped `llms_featured` flag, and
# deliberately the OLDEST and LOWEST-ordered admitted blog post: a
# `select = 'flagged'` entry must therefore pick a different page from a
# `select = 'first'` entry over the same section, or the flagged spec would
# pass for the wrong reason.
llms_featured: true
categories: ['testing']
tags: ['alpha', 'beta']
keywords: ['fixture', 'twin']
---

## A heading

Prose with **bold** text and the [projects section](/projects/).

{{< probe alpha >}}
