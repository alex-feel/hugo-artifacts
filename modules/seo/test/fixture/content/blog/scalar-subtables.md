---
title: 'Scalar sub-tables'
description: 'Writes seo.video as a bare id, which is truthy and used to abort the build.'
date: 2026-03-03T09:00:00Z
seo:
  # The bare-id spelling the module's own video_id alias encourages. It is
  # TRUTHY, so `| default dict` does not substitute; resolve/types.html then
  # types this page VideoObject and head-jsonld.html dispatches to a builder
  # that immediately reads .thumbnail_url off a string. That is a hard build
  # stop, inside a module the consumer does not own.
  video: 'dQw4w9WgXcQ'
  profile: 'jane'
---

Prose for the scalar sub-table page.
