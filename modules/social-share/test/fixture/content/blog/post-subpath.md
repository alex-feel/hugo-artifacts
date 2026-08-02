---
title: Subpath Post
description: Consumer-authored site-root-relative url and image values.
date: 2026-07-10
draft: false
social_share:
  url: /custom/share-target/
  image: /img/explicit-share.png
  networks:
    - x
    - pinterest
    - vk
    - odnoklassniki
    - weibo
---

Post whose `social_share.url` and `social_share.image` are written the way a consumer naturally writes a site-root-relative path, with a leading slash. Neither value resolves to a page resource or a global `assets/` resource, so both reach the module's literal-URL fallback -- the exact step that used to drop the baseURL's path. The four image-aware targets here cover all four share-image parameter names (`media`, `image`, `imageUrl`, `pic`).
