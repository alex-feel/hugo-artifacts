---
title: 'Avatar mode none'
description: 'The two organization surfaces under avatar="none".'
---

The `avatar="none"` baseline for the organization surfaces: the membership list keeps its generic organization glyph and the rollup keeps its bare owner names, with no `img` element anywhere in the widget. A separate page for the same reason the worked-in scope has one -- every home-page spec keeps seeing exactly one widget in every mode-sensitive class.

Only the two organization sections render here, because those are the only sections the org-avatar half of the `avatar` option reaches; the identity section's own `none` handling predates it and keeps its existing behavior of omitting the avatar element entirely.

{{< github-profile user="fixture-dev" sections="org-rollup,orgs" avatar="none" >}}
