---
title: Labelledby Wins Over Label
description: A visible heading with a static id feeds carousel's labelledby parameter, proving aria-labelledby wins over an explicit (and here deliberately wrong) label.
resources:
  - src: 01-a.png
    title: Labelledby slide A
    params:
      alt: Labelledby slide A
  - src: 02-b.png
    title: Labelledby slide B
    params:
      alt: Labelledby slide B
---

## Team Photos {#team-photos-heading}

{{< carousel match="*.png" labelledby="team-photos-heading" label="should-be-ignored" >}}
