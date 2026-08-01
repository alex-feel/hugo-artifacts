---
title: Markdown Variants
resources:
  - src: mdgallery/m1.png
    title: Amber caption one
    params:
      alt: Amber tile one
  - src: mdgallery/m2.png
    params:
      alt: Amber tile two
  - src: mdgallery/m3.png
    title: Amber caption three
    params:
      alt: Amber tile three
---

## Markdown output variant scenarios

{{< image src="local-photo.png" alt="A page-resource markdown scene" >}}

{{< image src="images/global-1200.png" alt="A global markdown scene" >}}

{{< image src="local-photo.png" alt="A captioned markdown scene" caption="A *fine* caption" >}}

{{< image src="local-photo.png" decorative="true" >}}

{{< image src="https://example.com/remote-photo.jpg" alt="A remote markdown scene" >}}

{{< image src="/static-icon.png" alt="A static markdown icon" >}}

{{< image src="local-photo.png" alt="A [bracketed] alt probe" >}}

{{< image "local-photo.png" "A positional markdown scene" >}}

## Gallery

{{< image-gallery match="mdgallery/*.png" >}}
