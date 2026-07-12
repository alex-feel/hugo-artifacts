---
title: Bundle Scenarios
exercise_partials: true
resources:
  - src: gallery/g1.png
    title: Gallery one
    params:
      alt: Purple rectangle one
      credit: Ann Author
  - src: gallery/g2.png
    title: Gallery two
    params:
      alt: Blue rectangle two
  - src: gallery/g3.png
    title: Gallery three
---

## Shortcode scenarios

{{< image src="photo-1600.png" alt="A wide test scene" id="sc-default" >}}

{{< image src="small-800.png" alt="An exact ladder rung" id="sc-exact" >}}

{{< image src="tiny-500.png" alt="A tiny source" id="sc-tiny" >}}

{{< image src="avatar-512.png" alt="A square avatar" layout="fixed" width="256" id="sc-fixed" >}}

{{< image src="photo-1600.png" alt="A captioned scene" caption="A *fine* view" credit="Photo: **Jane** Doe" license="CC BY 4.0" license_url="https://creativecommons.org/licenses/by/4.0/" lightbox="true" id="sc-figure" >}}

{{< image src="tiny-500.png" alt=`<script>alert('x')</script> " & '` id="sc-hostile-alt" >}}

{{< image src="tiny-500.png" alt="Hostile caption host" caption="<script>x</script>" id="sc-hostile-caption" >}}

{{< image src="tiny-500.png" alt="Hostile license host" license="Evil license" license_url="javascript:alert(1)" id="sc-hostile-license" >}}

{{< image src="tiny-500.png" decorative="true" id="sc-decorative" >}}

{{< image src="photo-1600.png" alt="A theme-aware scene" dark="photo-dark.png" id="sc-dark-media" >}}

{{< image src="photo-1600.png" alt="A class-toggled scene" dark="photo-dark.png" theme_strategy="class" id="sc-dark-class" >}}

{{< image src="photo-1600.png" alt="A dominant-color scene" placeholder="dominant" id="sc-ph-dominant" >}}

{{< image src="photo-1600.png" alt="A blurred-preview scene" placeholder="blur" id="sc-ph-blur" >}}

{{< image src="anim.gif" alt="An animated demo" id="sc-gif" >}}

{{< image src="diagram.svg" alt="A vector diagram" id="sc-svg" >}}

{{< image src="diagram.svg" alt="A width-only vector diagram" width="100" id="sc-svg-width" >}}

{{< image src="https://example.com/r.jpg" alt="A remote photo" id="sc-remote" >}}

{{< image "photo-1600.png" "A positional described scene" >}}

{{< image src="photo-1600.png" alt="A priority hero" priority="true" layout="full" id="sc-priority" >}}

{{< image src="photo-1600.png" alt="An eager non-priority scene" loading="eager" id="sc-eager" >}}

{{< image src="credited-400.jpg" alt="An IPTC-credited photo" credit_from_meta="true" id="sc-iptc-credit" >}}

## Non-positive and out-of-range token degradations (must never break the build)

{{< image src="photo-1600.png" alt="Zero widths degrade" widths="0" id="sc-zero-widths" >}}

{{< image src="photo-1600.png" alt="Out-of-range quality degrades" quality="150" id="sc-quality-bomb" >}}

## Galleries

{{< image-gallery match="gallery/*.png" id="gallery-plain" >}}

{{< image-gallery match="gallery/*.png" crop="1x1" id="gallery-crop" >}}

## Markdown render hook scenarios

![Global asset](images/global-1200.png)

![Attributed](small-800.png)
{id="hook-attr" width="480" layout="fixed" src="evil.png" data-author-note="kept"}

Some inline text before ![Bundle inline](tiny-500.png) and after it, inside one paragraph.

![Static icon](/static-icon.png)

![Missing image](nope.png)

![Remote hook image](https://example.com/r.jpg)

![x](javascript:alert(1))

![Raw bypass](photo-1600.png#raw)

![XSS breakout probe](small-800.png)
{data-evil="x\" onerror=\"alert(1)\" data-y=\"y" data-good="plain value"}

![Fill without width or height](small-800.png)
{process="fill" height="400"}
