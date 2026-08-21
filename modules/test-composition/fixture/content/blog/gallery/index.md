---
title: 'A Composition Gallery'
description: 'One page whose content publishes files no walk of the page graph can reach.'
date: 2026-01-16T09:00:00+00:00
tags: ['composition']
seo:
  image: 'card.svg'
social_share:
  networks: 'x,telegram,copy'
  image: 'social/share-card.png'
resources:
  - src: 'shot.png'
    params:
      alt: 'A flat test raster'
---

This page exists so that four modules publish a file each while rendering ordinary content, and so the URL registry can be checked against what the build really wrote.

The image below is a page-bundle resource. `modules/images` reads its URL, which is what writes it, and registers it.

{{< image src="shot.png" alt="A flat test raster" width="600" >}}

The carousel takes the same bundle resource. With `modules/images` composed here, the carousel hands the slide to that module rather than reading a permalink of its own, so the registration follows the module that actually published the file.

{{< carousel items="shot.png" >}}

{{< callout type="note" title="An icon is a published file too" icon="icons/star.svg" >}} The icon is a global asset. Resolving it reads its URL, which publishes it, so `shortcodes/callout` registers it. {{< /callout >}}

{{< social-share >}}

The page's own `seo.image` is an SVG, which the seo module passes through unprocessed rather than cropping, so its URL is stable and is registered too. A raster would be cropped into a content-addressed derivative instead, and the registry deliberately leaves those out.
