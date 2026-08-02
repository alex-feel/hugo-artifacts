---
title: Site-Path Items
description: Items-mode carousel over leading-slash site paths with modules/images NOT imported, so the standalone img fallback emits the resolved URL itself.
---

Every entry here lives in `static/`, not in this page bundle, so each one resolves through the leading-slash branch and renders with the empty alt label plus one warning. With modules/images absent, `carousel/slides.html` emits the resolved URL directly in its plain `<img>` fallback; the subpath overlay build is what proves the baseURL path survives.

{{< carousel items="/site-slide-01.png, /site-slide-02.png" id="carousel-site-path" label="Site path walkthrough" >}}
