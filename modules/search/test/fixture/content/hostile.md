---
title: 'Tips &amp; tricks &mdash; the &lt;img src=x onerror=alert(1)&gt; guide'
description: 'Escaped &lt;script&gt;alert("desc")&lt;/script&gt; payload &amp; more &mdash; with "quotes" and (parens)'
date: 2026-02-01
images: ['javascript:alert(1)']
---

A hostile corpus page for search robustness checks. The payload `<img src=x onerror=alert('body')>` sits in an inline code span.

Escaped entity payload: &lt;script&gt;alert('escaped')&lt;/script&gt; sits as literal text.

Regex metacharacters survive querying: ( and [ and ]]&gt; and "double quotes" and 'single quotes'.
