---
title: 'Rollup, organizations only'
description: 'The org rollup under org-rollup-owners="organizations" with a cap below the kept count.'
---

The rollup with user-owned rows excluded AND the cap pulled below the kept count, so the two mechanisms are proven together: the canned response rolls up four external owners (three organizations plus one user account), the owner filter drops the user row before any counting, and the cap then cuts one organization. The list must say all of that -- `data-owners="organizations"`, a `data-total` of 3 that never counted the user row, two rendered rows both typed `Organization`, and a visible "and 1 more" note whose remainder is the cut organization, not the filtered user.

{{< github-profile user="fixture-dev" sections="org-rollup" org-rollup-owners="organizations" org-rollup-limit="2" avatar="hotlink" >}}
