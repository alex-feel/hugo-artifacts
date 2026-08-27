---
title: 'Accordion Fixture'
---

The core surface: a plain container, a heading-mode container, and a standalone item. This page also renders in the `markdown` output format, so the same calls below drive the module's `.markdown.md` template variants.

## Plain container

{{< accordion >}}

{{< accordion-item "Shipping" >}}

Ships in **two** days.

{{< /accordion-item >}}

{{< accordion-item title="Returns" open="true" >}}

Thirty days.

A second paragraph, so the body is proven to be block-level.

{{< /accordion-item >}}

{{< accordion-item title="Warranty" >}}

One year.

{{< /accordion-item >}}

{{< /accordion >}}

## Heading mode

{{< accordion heading="3" >}}

{{< accordion-item "Heading item" >}}

Body of the heading item.

{{< /accordion-item >}}

{{< /accordion >}}

## Standalone item

{{< accordion-item "Standalone" >}}

An item called on its own renders its own container.

{{< /accordion-item >}}

