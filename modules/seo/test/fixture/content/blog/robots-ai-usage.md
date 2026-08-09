---
title: 'Robots AI usage'
description: 'Carries the two tokens Bing reads for AI usage plus one no engine reads, so the directive survives whatever any single vendor decided about it.'
date: 2026-03-07T09:00:00Z
# The module used to hold a list of tokens it believed dead and delete them
# from the consumer's directive. Google retired noarchive and nocache; Bing did
# not, having repurposed the pair in September 2023 to control whether a page
# may be used in Bing Chat answers and in training Microsoft's generative-AI
# models, and it documents `<meta name="bingbot" content="...">` as the way to
# scope them to Bing alone. The list deleted both, on the all-bots directive
# and on the per-bot map alike, and told the consumer to remove the directive
# that was working. nositelinkssearchbox is here as the other half of the
# lesson: no engine reads it, and it still must survive, because a token a
# crawler ignores costs nothing and the module no longer judges which is which.
seo:
  robots: 'noarchive, nocache, nositelinkssearchbox'
  robots_bots:
    bingbot: 'noarchive'
---

Prose for the robots AI-usage page.
