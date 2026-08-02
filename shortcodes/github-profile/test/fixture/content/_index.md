---
title: 'GitHub Profile Fixture'
description: 'Home page of the github-profile fixture site.'
---

The call below asks for every section the module ships (`variant="full"`) with every optional computation switched on, so one build renders every branch the suite asserts against: the full headline strip including its floor note, the calendar with both streaks, the per-organization rollup, languages, reviews, and the identity, contributed, organizations, pinned and socials sections.

The avatar is hotlinked rather than fetched: `avatar="fetch"` would copy the image at build time, which is the one remaining network call in the render path, and this fixture is offline by construction.

{{< github-profile user="fixture-dev" variant="full" avatar="hotlink" history="year" show-streak="true" show-rank="true" merged-prs="true" >}}
