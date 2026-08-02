---
title: Site-Path Items
description: Items-mode carousel over leading-slash site paths, the entries whose emitted URLs must carry the baseURL path.
---

Every entry here lives in `static/`, not in this page bundle, so each one resolves through the leading-slash branch and renders with the empty alt label plus one warning. Composed with modules/images (this fixture imports it), the resolved slide URL is produced by images from the RAW authored entry; the subpath overlay build is what proves the baseURL path survives.

{{< carousel items="/site-slide-01.png, /site-slide-02.png" id="carousel-site-path" label="Site path walkthrough" >}}
