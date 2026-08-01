---
title: 'Widget Demo'
description: 'One page exercising all eight widget shortcodes, so its Markdown twin pins the compact citations.'
resources:
  - src: gallery/one.png
    title: 'Gallery caption one'
    params:
      alt: 'First gallery image'
  - src: gallery/two.png
    title: 'Gallery caption two'
    params:
      alt: 'Second gallery image'
---

Opening prose ahead of the widgets.

{{< github-repo url="https://github.com/gohugoio/hugo" >}}

{{< github-profile user="alex-feel" >}}

{{< hf-space id="gradio/hello_world" >}}

{{< arxiv-paper id="1706.03762" >}}

{{< youtube-embed id="dQw4w9WgXcQ" title="Never Gonna Give You Up [Official Video]" >}}

{{< callout type="warning" title="Mind the gap" >}}
A warning body with **bold** Markdown.

- First hazard item
- Second hazard item
{{< /callout >}}

{{< image src="photo.png" alt="A sample photo" caption="A sample photo caption" >}}

{{< image-gallery match="gallery/*" >}}

Closing prose after the widgets.
