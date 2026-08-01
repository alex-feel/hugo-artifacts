---
title: Missing Twin Post
description: Shortcode placements, one pointing at a twin that does not exist.
date: 2026-07-14
draft: false
fixture_no_partial: true
---

The named-params shortcode below points its explicit url at a twin the site never publishes, so the enhanced copy flow must take the 404 error path.

{{< copy-page url="/docs/no-such-twin/index.md" rows="copy,view" id="copy-404" toggle_label="Use this page" >}}

The positional shortcode derives its URL from the page's own markdown output format.

{{< copy-page "view" >}}
