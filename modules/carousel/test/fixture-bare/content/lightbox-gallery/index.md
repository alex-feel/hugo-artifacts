---
title: Standalone Lightbox Gallery
description: Match-mode carousel with lightbox=true and modules/images NOT imported, so each slide's standalone anchor carries href to the original resource plus data-full-width/data-full-height (dimensions are known because the source is a bundle resource).
resources:
  - src: 01-first.png
    title: First lightbox slide
    params:
      alt: First lightbox slide
  - src: 02-second.png
    title: Second lightbox slide
    params:
      alt: Second lightbox slide
---

{{< carousel match="*.png" label="Standalone lightbox walkthrough" lightbox="true" >}}
