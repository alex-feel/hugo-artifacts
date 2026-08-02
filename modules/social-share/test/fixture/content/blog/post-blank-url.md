---
title: Blank URL Post
description: A social_share.url override that is whitespace only.
date: 2026-07-10
draft: false
social_share:
  url: ' '
  networks:
    - x
    - copy
---

A `social_share.url` of `" "` is present but carries no URL. It is truthy, so a naive fallback picks it over the page permalink and the bar ends up advertising an empty share URL; the module instead normalizes the consumer value first, which collapses it to `""`, and only then falls back to `.Permalink`.
