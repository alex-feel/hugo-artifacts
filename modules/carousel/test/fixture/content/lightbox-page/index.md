---
title: Lightbox With Pass-Through
description: Composed carousel exercising lightbox=true together with an explicit images pass-through parameter (widths) over bundle resources that carry alt text.
resources:
  - src: 01-a.png
    title: Lightbox slide A
    params:
      alt: Lightbox slide A
  - src: 02-b.png
    title: Lightbox slide B
    params:
      alt: Lightbox slide B
  - src: 03-wide.png
    title: Lightbox slide C
    params:
      alt: Lightbox slide C
---

{{< carousel match="*.png" label="Lightbox walkthrough" lightbox="true" widths="480,960" >}}
