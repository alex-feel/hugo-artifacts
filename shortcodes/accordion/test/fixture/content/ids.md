---
title: 'Item ids'
---

Minted ids, collision suffixes, an explicit override, the opt-out, and a title that sanitizes to nothing.

{{< accordion >}}

{{< accordion-item "Same title" >}}

First.

{{< /accordion-item >}}

{{< accordion-item "Same title" >}}

Second, so its minted id must carry a collision suffix.

{{< /accordion-item >}}

{{< accordion-item "Same title" >}}

Third.

{{< /accordion-item >}}

{{< accordion-item title="Explicit" id="chosen-by-the-author" >}}

An author-supplied id wins verbatim.

{{< /accordion-item >}}

{{< accordion-item title="Opted out" id="" >}}

The empty string suppresses the id attribute entirely.

{{< /accordion-item >}}

{{< accordion-item "!!!" >}}

A title that anchorizes to nothing falls back to the base name.

{{< /accordion-item >}}

{{< accordion-item "Inline `code` and **bold**" >}}

The title renders as inline markdown; the id is minted from the raw text.

{{< /accordion-item >}}

{{< /accordion >}}

