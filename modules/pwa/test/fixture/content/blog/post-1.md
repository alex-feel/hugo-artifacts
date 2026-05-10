---
title: Blog post 1
description: Used by Playwright matrix row 7 (offline rendering of precached pages).
date: 2026-01-02
---

Blog post 1. The default `params.pwa.sw.precache.include_recent_pages = 10` pulls this into the precache manifest, so the offline-rendering row of the validation matrix can verify that visiting it after the SW activates renders correctly even when the network is simulated as 503.
