---
title: 'Limits off'
description: 'Both list caps at 0: every derived row renders.'
---

Both caps at `0`, which means "keep every row". The rollup renders all four owners with no remainder note -- nothing was cut, so nothing may claim to have been. The contributed list renders every fetched repository and still carries a remainder note, because the note reads the connection's own `totalCount`: the canned response reports 20 contributed repositories while returning 9 nodes, standing in for the truncation the API itself performs past its 100-node ceiling, which no cap setting can undo.

The zeros below are deliberately UNQUOTED: an unquoted numeric argument reaches the shortcode as a Go int, and int 0 is exactly the value a `| default` pipeline would silently collapse to the fallback -- which is why the entry template reads these parameters through `isset` instead. This page is the subject that keeps that spelling working; `rollup-limited.md` covers the quoted-string spelling.

{{< github-profile user="fixture-dev" sections="org-rollup,contributed" org-rollup-limit=0 contributed-limit=0 avatar="hotlink" >}}
