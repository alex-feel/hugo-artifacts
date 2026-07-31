---
# Two deliberately hostile shapes for the line-oriented documents. The title
# carries an unbalanced closing bracket, which unescaped would end the
# listing link text early in llms.txt and about.md. The description is a
# multi-line block scalar whose continuation line begins with a list marker,
# which uncollapsed would publish as a list entry of the generated document
# rather than as text of this page's own line.
title: 'Post Two] With A Stray Bracket'
description: |-
  A second post so section listings have more than one item.
  - a continuation line that begins with a list marker
date: 2026-03-01T09:00:00Z
"probe\nkey": 'probe value'
categories: ['testing']
tags: ['gamma']
---

Second post prose.
