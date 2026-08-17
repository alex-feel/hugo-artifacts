---
title: 'Jane Doe'
description: 'The site owner, whose ProfilePage mainEntity anchors the Person graph.'
# A portrait, in the one shape that can tell the native-aspect path from the
# cropped one: 400x500 is not 1.91:1, so mainEntity.image and Person.image are
# a different URL from this page's own og:image. Without an image here neither
# node rendered at all, and the `natural` variant was asserted by nothing.
images: ['img/portrait.png']
seo:
  profile:
    is_site_owner: true
    given_name: 'Jane'
    family_name: 'Doe'
    job_title: 'Fixture Author'
---

Author bio prose.
