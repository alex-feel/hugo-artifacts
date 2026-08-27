---
title: 'Id collision with a page heading'
---

The one documented caveat of minted ids, given a subject so it cannot quietly change: the module deduplicates against its OWN items on the page, and it cannot see the ids Hugo mints for Markdown headings (`.Fragments` tracks those, and only per render). A heading whose text matches an item title therefore produces a duplicate id, and the fix is to give the item an explicit `id`.

## Shipping options

{{< accordion >}}

{{< accordion-item "Shipping options" >}}

This item's minted id collides with the heading above it.

{{< /accordion-item >}}

{{< /accordion >}}

## Returns policy

{{< accordion >}}

{{< accordion-item title="Returns policy" id="returns-policy-item" >}}

This item names its own id, which is how an author resolves the collision.

{{< /accordion-item >}}

{{< /accordion >}}

