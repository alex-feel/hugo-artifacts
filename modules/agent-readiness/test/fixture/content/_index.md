---
title: 'Agent Readiness Fixture'
description: 'Home page of the fixture site.'
main_subtitle: 'Fixture Maintainer / Test Author'
based_in: 'Testville, Nowhere'
# A MAP-valued and a LIST-valued identity source. Go's %v renders these as
# `map[k:v]` and `[a b]` -- debug forms that must never reach a published
# document, and which the twin's jsonify would never produce for the same key.
credentials:
  id: 'ABC-123'
  issuer: 'Fixture Authority'
focus_areas: ['testing', 'tooling']
# Every surface's `enable` is SITE-SCOPED, and the HOME page is the only place
# a page-tier value could do real damage: llms.txt, about.md and the skills
# index all render from here, so a page tier that reached them would switch
# the document off while every twin kept pointing at it. Set here so the
# carve-out is exercised -- all three must be discarded, each with a warning,
# and all three documents must still be published.
agent:
  llms:
    enable: false
  facts:
    enable: false
  skills_index:
    enable: false
---

Home prose with a **bold** run and the [blog section](/blog/).

{{< probe home >}}
