---
title: 'Exclusive groups'
---

Two `exclusive` containers on ONE page, a pair of containers sharing an explicit `group`, and an exclusive group carrying two `open` items.

## First exclusive container

{{< accordion exclusive="true" >}}

{{< accordion-item "Alpha" >}}

Alpha body.

{{< /accordion-item >}}

{{< accordion-item "Beta" >}}

Beta body.

{{< /accordion-item >}}

{{< /accordion >}}

## Second exclusive container

It must mint a DIFFERENT group name from the first, or the two accordions would silently close each other's items.

{{< accordion exclusive="true" >}}

{{< accordion-item "Gamma" >}}

Gamma body.

{{< /accordion-item >}}

{{< accordion-item "Delta" >}}

Delta body.

{{< /accordion-item >}}

{{< /accordion >}}

## Shared group, first half

{{< accordion group="faq" >}}

{{< accordion-item "Shared one" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

## Shared group, second half

{{< accordion group="faq" >}}

{{< accordion-item "Shared two" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

## Two open items in one exclusive group

The browser keeps only the first, so the module warns at build time.

{{< accordion group="multi-open" >}}

{{< accordion-item title="First open" open="true" >}}

Body.

{{< /accordion-item >}}

{{< accordion-item title="Second open" open="yes" >}}

Body.

{{< /accordion-item >}}

{{< /accordion >}}

