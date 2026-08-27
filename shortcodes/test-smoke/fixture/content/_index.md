---
title: 'Shortcode Smoke Fixture'
---

Each module below is invoked exactly ONCE. That is deliberate for the fetching ones: the second call site in a build meets an already-open host-down breaker and takes a different code path, which would make the warning set depend on render order.

## github-repo

{{< github-repo url="https://github.com/gohugoio/hugo" >}}

## hf-space

{{< hf-space id="gradio/hello_world" >}}

## arxiv-paper

{{< arxiv-paper id="1706.03762" >}}

## youtube-embed

{{< youtube-embed id="dQw4w9WgXcQ" >}}

## callout

{{< callout "note" >}} A paired shortcode: this module reads `.Inner`, so the self-closing form breaks the build. {{< /callout >}}

## callout, with an unreachable icon

The one DETERMINISTIC remote failure available to this fixture. `.invalid` is reserved by RFC 2606 and guaranteed never to resolve, so the fetch fails immediately rather than stalling, on any runner, with or without network. It is what lets the graceful-degradation contract be asserted rather than hoped for.

{{< callout type="tip" icon="https://icons.invalid/nonexistent.svg" >}} The icon cannot be fetched, so this renders without one instead of failing. {{< /callout >}}

## callout, authored inside a list item

The indentation is the subject: CommonMark reads four leading spaces as a code block, so a body taken from `.Inner` rather than `.InnerDeindent` publishes this list as `<pre><code>`.

- A list item whose nested shortcode body carries four spaces of indentation.

    {{< callout "note" >}}
    A paragraph inside an indented callout.

    - a list item that must not become code
    {{< /callout >}}
