---
title: 'Nesting and indentation'
---

An item authored inside an indented Markdown list, and an accordion nested inside an accordion item.

## Inside a list item

- A list item, whose nested shortcode body carries four spaces of indentation.

    {{< accordion-item "Indented" >}}

    This body is indented by four spaces. Without `.InnerDeindent`, CommonMark would read it as a code block.

    - and this list would be code too

    {{< /accordion-item >}}

## Nested accordion

{{< accordion >}}

{{< accordion-item "Outer" >}}

The outer body, which itself contains a whole accordion.

{{< accordion >}}

{{< accordion-item "Inner" >}}

The inner body.

{{< /accordion-item >}}

{{< /accordion >}}

{{< /accordion-item >}}

{{< /accordion >}}

