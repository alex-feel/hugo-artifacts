---
title: Standalone Gallery
description: Match-mode carousel with modules/images NOT imported, so every slide renders the plain standalone img fallback.
resources:
  - src: 01-first.png
    title: First slide
    params:
      alt: First slide
  - src: 02-second.png
    title: Second slide
    params:
      alt: Second slide
---

{{< carousel match="*.png" label="Standalone walkthrough" >}}
