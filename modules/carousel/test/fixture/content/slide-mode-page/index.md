---
title: Slide Mode (Styled)
description: mode=slide carousel on a page whose body class activates the fixture CSS that hides non-current slides, so the concealment guard applies inert plus aria-hidden.
fixture_body_class: slide-mode-styled
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

{{< carousel match="*.png" label="Slide mode styled" mode="slide" >}}
