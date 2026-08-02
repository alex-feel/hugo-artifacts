---
title: Invalid Carousel Call
description: Negative-build fixture -- calling the carousel shortcode with both match and items must errorf and fail the build with a [carousel]-prefixed message.
---

{{< carousel match="gallery/*" items="a.jpg,b.jpg" >}}
