---
title: 'Noindexed Post'
description: 'Hidden from crawlers, so hidden from the agent surfaces too.'
date: 2026-05-01T09:00:00Z
robots: 'noindex, follow'
# A scalar that is NOT the documented `agent: false` shorthand. It must warn
# rather than be silently interpreted. This page is chosen because the
# noindex rule already excludes it, so exercising the warn costs no change to
# any listing count -- the non-map warning fires and the page stays excluded
# for its own separate reason.
agent: 'nonsense'
---

This page is excluded by the noindex filter.
