---
title: Slide Mode (Unstyled)
description: mode=slide carousel with NO consumer CSS concealing non-current slides, so the concealment guard (getClientRects) must skip inert plus aria-hidden -- all slides stay visible and accessible.
resources:
  - src: 01.png
    title: Slide one
    params:
      alt: Slide one
  - src: 02.png
    title: Slide two
    params:
      alt: Slide two
  - src: 03.png
    title: Slide three
    params:
      alt: Slide three
---

{{< carousel match="*.png" label="Slide mode unstyled" mode="slide" >}}
