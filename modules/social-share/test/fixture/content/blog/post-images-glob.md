---
title: Images Glob Post
description: Glob images post.
date: 2026-07-10
draft: false
images: ['shot[.png']
social_share:
  networks: [pinterest]
---

Post whose `images` front matter entry is a literal filename carrying an unbalanced glob metacharacter: the share-image lookup must treat it as an exact path and the build must not break.
