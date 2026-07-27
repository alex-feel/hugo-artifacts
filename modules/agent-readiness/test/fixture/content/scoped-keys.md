---
title: 'Site-scoped keys set at the page tier'
description: 'Every agent key here is SITE-SCOPED, so all of them are discarded and each one warns exactly once.'
agent:
  # `agent: {enable: false}` is the trap this page exists for. A reader of the
  # key table reaches for it as a per-page opt-out; it is a map, so the
  # non-map guard cannot catch it, and without the lower-tier warning it is
  # discarded in total silence while the page keeps its twin and stays listed.
  # The opt-out that actually works is `agent: false`.
  enable: false
  sections: ['/nowhere']
  exclude_noindex: false
  robots:
    bots: ['gptbot']
  markdown:
    enable: false
---

This page sits outside the `sections` allow-list, so it is absent from every listing and has no twin. It exists solely so the page tier of the config cascade is exercised with keys that belong to the site tier.
