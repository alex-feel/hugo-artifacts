---
title: Two Carousels
description: Two independent carousel placements on the same page, proving the per-placement script emission and window-level run guard both work when the module is invoked twice.
resources:
  - src: first-01.png
    title: First carousel, slide one
    params:
      alt: First carousel, slide one
  - src: first-02.png
    title: First carousel, slide two
    params:
      alt: First carousel, slide two
  - src: second-01.png
    title: Second carousel, slide one
    params:
      alt: Second carousel, slide one
  - src: second-02.png
    title: Second carousel, slide two
    params:
      alt: Second carousel, slide two
---

## First carousel

{{< carousel match="first-*.png" id="carousel-first" label="First carousel" >}}

## Second carousel

{{< carousel match="second-*.png" id="carousel-second" label="Second carousel" >}}
