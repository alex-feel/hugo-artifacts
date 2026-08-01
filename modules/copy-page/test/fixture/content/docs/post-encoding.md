+++
title = "Enc & Matrix + 50% [Deal]"
description = "Prompt and URL characters exercising the encoding matrix."
date = 2026-07-12T00:00:00Z
draft = false
# Brackets in the URL path must reach the provider hrefs as %5B/%5D inside
# the percent-encoded prompt value.
url = "/docs/enc-[matrix]-42/"

[copy_page]
rows = ["copy", "view", "llms", "chatgpt", "claude", "perplexity", "grok", "aistudio"]
# The literal {url} token is replaced with the row's target URL; the spaces,
# ampersand, percent, literal plus, and brackets force %20-not-plus and full
# percent escaping in every provider href.
prompt = "Summarize {url} & explain 50% off + more [deal]"
+++

Post whose custom prompt and bracketed URL force %20-not-plus spaces plus escaped ampersands, percents, pluses, and brackets in every provider href.
