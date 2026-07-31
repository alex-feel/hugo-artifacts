---
title: 'Noindexed but explicitly included'
description: 'Carries robots noindex AND agent exclude false, which overrides the noindex rule.'
date: 2026-06-11T09:00:00Z
robots: 'noindex, follow'
agent:
  exclude: false
---

An explicit `exclude: false` overrides the noindex and search-page rules but never the bare opt-out. Without this page the override branch is dead code.
