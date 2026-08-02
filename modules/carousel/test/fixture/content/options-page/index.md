---
title: Options Walkthrough
description: Match-mode carousel exercising start, loop, picker, and eager together, with captions=false suppressing the figcaption these titled resources would otherwise render.
resources:
  - src: 01-a.png
    title: Slide A
    params:
      alt: Slide A
  - src: 02-b.png
    title: Slide B
    params:
      alt: Slide B
  - src: 03-c.png
    title: Slide C
    params:
      alt: Slide C
  - src: 04-d.png
    title: Slide D
    params:
      alt: Slide D
---

{{< carousel match="*.png" label="Options walkthrough" start="2" loop="true" picker="true" eager="2" captions="false" >}}
