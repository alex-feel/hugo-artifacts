---
title: 'Rendered twice'
outputs: ['html', 'amp']
---

This page renders in TWO HTML-family output formats, which makes Hugo execute its shortcodes twice. Everything the module keys on a per-page store has to survive that: a minted id must come out the same in both documents rather than drifting onto the next collision suffix, and an open item must be counted once rather than once per render.

## Repeated titles

{{< accordion >}}

{{< accordion-item "Twice rendered" >}}

First.

{{< /accordion-item >}}

{{< accordion-item "Twice rendered" >}}

Second, so a drifting registry would show up as a different suffix in the second document.

{{< /accordion-item >}}

{{< /accordion >}}

## One open item in an exclusive group

{{< accordion exclusive="true" >}}

{{< accordion-item title="The open one" open="true" >}}

Exactly one item here carries open, so any multi-open warning naming this group is a false alarm from counting executions rather than items.

{{< /accordion-item >}}

{{< accordion-item "The closed one" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}
