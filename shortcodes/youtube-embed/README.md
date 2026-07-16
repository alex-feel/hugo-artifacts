# youtube-embed

Privacy-first YouTube facade shortcode for Hugo. On load it renders only a same-origin poster image and a real play button -- no YouTube iframe, no preconnect, no contact with any Google domain. The player is injected client-side only after the visitor clicks Play. Like its sibling modules, this one is style-agnostic: it emits semantic HTML with [BEM](https://getbem.com/) class hooks, `data-*` attributes, and CSS custom properties, and ships ZERO CSS. All visual presentation is the consuming site's responsibility, so you can build a design of any complexity on top of it.

## Installation

Import the module in your site's Hugo configuration:

```toml
# hugo.toml

[[module.imports]]
path = 'github.com/alex-feel/hugo-artifacts/shortcodes/youtube-embed'
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/shortcodes/youtube-embed
```

**Important -- template lookup precedence:** If your site already has a file at `layouts/_shortcodes/youtube-embed.html`, Hugo uses the local file instead of the module's shortcode. Delete the local file for the module to take effect. The same applies to the partials under `layouts/_partials/youtube-embed/` and the asset at `assets/js/youtube-embed.js`.

For local development against a checkout of this repository, use `hugo.work` (preferred) or `[module.replacements]` as described in the repository's root `CLAUDE.md`.

## Requirements

- Hugo v0.160.0+ (extended edition)
- Go 1.22+

The extended edition is required because the poster pipeline converts thumbnails to WebP, and `js.Build` bundles the client script.

## Usage

Provide either an `id` (a raw 11-character video id) or a `url` (any common YouTube URL shape). A playlist can be embedded via `list`.

### Basic

```go-html-template
{{</* youtube-embed id="dQw4w9WgXcQ" */>}}
```

### From a URL

Any of the recognized URL shapes works; the 11-character id is extracted and validated:

```go-html-template
{{</* youtube-embed url="https://youtu.be/dQw4w9WgXcQ" */>}}
{{</* youtube-embed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" */>}}
{{</* youtube-embed url="https://www.youtube.com/embed/dQw4w9WgXcQ" */>}}
{{</* youtube-embed url="https://www.youtube.com/shorts/dQw4w9WgXcQ" */>}}
{{</* youtube-embed url="https://m.youtube.com/watch?v=dQw4w9WgXcQ" */>}}
```

### Title, start, and end

`title` becomes the play button's accessible label and the injected iframe's title. `start` and `end` are offsets in seconds:

```go-html-template
{{</* youtube-embed id="dQw4w9WgXcQ" title="Never Gonna Give You Up" start="42" end="90" */>}}
```

### Playlist

With no video id, the playlist is embedded as a series. With a video id, the `list` is appended so the player opens the video within the playlist:

```go-html-template
{{</* youtube-embed list="PLFsQleAWXsj_4yDeebiIADdH5FMayBiJo" */>}}
{{</* youtube-embed id="dQw4w9WgXcQ" list="PLFsQleAWXsj_4yDeebiIADdH5FMayBiJo" */>}}
```

### Local poster override

Supply your own poster from the page bundle or the `assets/` directory. It is processed through Hugo's image pipeline and served same-origin, exactly like an auto-resolved thumbnail:

```go-html-template
{{</* youtube-embed id="dQw4w9WgXcQ" poster="custom-poster.jpg" */>}}
```

### Arbitrary player parameters

`params` is appended verbatim to the embed URL, so any YouTube player parameter the facade does not model directly is still reachable:

```go-html-template
{{</* youtube-embed id="dQw4w9WgXcQ" params="cc_load_policy=1&hl=fr" */>}}
```

### Extra class and root anchor

```go-html-template
{{</* youtube-embed id="dQw4w9WgXcQ" class="featured" id-anchor="intro-video" show-title="true" title="Intro" */>}}
```

## Parameters

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | string | one of `id`/`url`/`list` | -- | Raw 11-character video id. Wins the video-id slot over `url` when both are set; the URL's `list=` and `t=`/`start=` are still honored, and a **different** video id carried in `url` is dropped with a build warning. An invalid raw id fails the build even when `url` supplies a playlist. A pasted URL in `id` replaces `url` entirely (with a build warning when a `url` was supplied alongside). |
| `url` | string | one of `id`/`url`/`list` | -- | Full YouTube URL. Recognized shapes: `youtu.be/`, `watch?v=` (including `&v=`), `embed/`, `v/`, `shorts/`, `youtube-nocookie.com/embed/`, `m.youtube.com`. A `&list=` and a `?t=`/`?start=` offset (`90`, `90s`, `1m30s`, `1h2m3s`; the legacy `#t=` fragment form also works) are honored -- also when `id` supplies the video id. |
| `list` | string | one of `id`/`url`/`list` | -- | Playlist id. Without a video id, embeds the playlist; with a video id, appends `list=`. |
| `title` | string | no | -- | Accessible button label, injected iframe title, and (with `show-title`) a visible title element. |
| `start` | int | no | -- | Start offset in seconds. Emits `start=N` (and `t=Ns` on the fallback link). An explicit `0` (quoted or unquoted) counts as set and suppresses a url-carried offset. Values cap at nine digits, matching url-carried components. Falls back to a `?t=`/`?start=` carried in `url` when unset or invalid; a valid explicit parameter always wins (a non-numeric or out-of-range value is warned and treated as unset). |
| `end` | int | no | -- | End offset in seconds. Emits `end=N`. Values cap at nine digits. |
| `poster` | string | no | auto | Local poster override (page-resource name or `assets/` path). Highest poster priority. |
| `params` | string | no | -- | Arbitrary extra player query string appended to the embed URL (e.g. `cc_load_policy=1&hl=fr`). |
| `loading` | string | no | `lazy` | Poster `<img>` loading attribute (`lazy` or `eager`). |
| `sizes` | string | no | `100vw` | Poster responsive `sizes` attribute. Set it to match your layout slot (for example `(min-width: 48rem) 40rem, 100vw`) so the browser does not over-fetch the widest variant. |
| `class` | string | no | -- | Additional class(es) appended to the root element. |
| `id-anchor` | string | no | -- | Optional root element `id` (alias: `anchor`). |
| `show-title` | bool | no | `false` | Render a visible `youtube-embed__title` element. |

Validation:

- Omitting all of `id`, `url`, and `list` fails the build with an error message carrying the shortcode name and position.
- Supplying an `id` or `url` from which no valid 11-character id can be extracted fails the build. YouTube ids are exactly 11 characters of `[A-Za-z0-9_-]`.
- Supplying a `poster` that cannot be found (neither a page resource nor an asset) fails the build. This is treated as an authoring mistake, not a degradation case. Remove the `poster` parameter to fall back to the automatic thumbnail.
- A missing remote thumbnail NEVER fails the build. The module warns once per build (deduplicated) and renders a neutral box with a working play button.

## Poster resolution

The poster is always served from your own origin. The module resolves it at build time through a four-tier priority chain and republishes the bytes as fingerprinted same-origin variants, so the rendered page makes no third-party image request:

1. **Local override (`poster`).** Resolved against the page bundle first (`.Page.Resources.GetMatch`), then global assets (`resources.Get`).
2. **`maxresdefault.jpg` (1280x720).** Fetched via `resources.GetRemote` wrapped in `try`. The primary missing-thumbnail signal is HTTP 404, which Hugo surfaces as a nil resource. A dimension guard additionally rejects the low-resolution gray placeholder that some edge nodes serve for a missing maxres frame, so only a true high-resolution frame is accepted.
3. **`hqdefault.jpg` (480x360).** The de-facto always-present fallback for public videos.
4. **`default.jpg` (120x90).** Last-resort thumbnail.

If none resolve, the facade renders a neutral 16:9 box and the play button still works.

The chosen poster is processed into responsive WebP and JPEG variants and emitted as a `<picture>` with a WebP `<source>` and a JPEG `<img>` fallback. A responsive `srcset` ladder (1280 / 640 / 480 where the source is wide enough) is generated without upscaling, and explicit `width`/`height` on the `<img>` prevent layout shift.

## Privacy model

This module exists to give visitors a true zero-contact-before-click experience, which neither the built-in `youtube` shortcode nor a plain nocookie iframe provides.

- **Before the click:** the page contains only same-origin HTML, CSS, and the small enhancement script, plus the same-origin poster image. There is no iframe `src`, and the module deliberately does NOT preconnect or warm-connect to any Google domain. No request reaches `youtube.com`, `youtube-nocookie.com`, `ytimg.com`, `google.com`, or `doubleclick.net`.
- **At the click:** the script injects an `<iframe>` pointing at `youtube-nocookie.com`. The `youtube-nocookie.com` domain only DEFERS cookies; once the player loads it still contacts Google, discloses the visitor's IP, and writes to `localStorage` (for example `yt-remote-device-id`). In short, nocookie is a mitigation AFTER play begins, not a guarantee of no contact. The facade -- not nocookie -- is what guarantees no contact before the click.
- **Consent regimes:** because the post-click iframe behaves like a normal YouTube embed, in strict consent regimes (such as the GDPR/ePrivacy interpretation that treats device-storage access as requiring prior consent) you should gate the click behind your site's consent boundary. A common pattern is to leave the facade rendered but intercept the button until the visitor has accepted media embeds.
- **`rel=0`:** the embed URL sets `rel=0`. Since 2018 this no longer hides related videos entirely; it only restricts the post-playback suggestions to the same channel as the video that was played.

## Graceful degradation

The module degrades safely along several independent axes:

- **No JavaScript / before enhancement:** the facade includes a plain `<a class="youtube-embed__link">` that navigates to the YouTube watch page (or playlist). This preserves the zero-contact guarantee, since it links away rather than embedding. When the enhancement script runs, it hides this link (`hidden`) and adds `youtube-embed--enhanced` to the root, so scripted visitors are not offered a duplicate, away-navigating control; visitors without scripting keep the link as the visible affordance.
- **Missing remote thumbnail:** a neutral 16:9 box is rendered and the play button still works; the build is never broken.
- **Network failure during build:** thumbnail fetch failures fall through the tier chain and ultimately to the neutral box, with a single deduplicated `warnf`.

## Localization

All UI strings resolve through i18n keys shipped in the module's `i18n/` directory (English and Russian included). Every lookup falls back to the English string, so a site language without translations still renders correctly. Override any key in the consuming site's own `i18n/<lang>.toml` to translate or reword:

| Key | English value | Used for |
| --- | --- | --- |
| `youtube_embed_play_video` | `Play video: {{ .Title }}` | Play-button `aria-label` when a `title` is given (`{{ .Title }}` is the title) |
| `youtube_embed_play_video_untitled` | `Play video` | Play-button `aria-label` without a `title` |
| `youtube_embed_watch_on_youtube` | `Watch on YouTube` | JS-off fallback link text without a `title` |
| `youtube_embed_player_title` | `YouTube video player` | Injected iframe `title` without a `title` (carried via `data-title`) |

## Styling

The module outputs unstyled semantic HTML. All visual presentation is the consuming site's responsibility.

### The one rule you must add

The facade needs an aspect box so the poster and the injected iframe fill a stable 16:9 area with no layout shift. Add this single line (and let the iframe fill the box):

```css
.youtube-embed {
  aspect-ratio: 16 / 9;
}

.youtube-embed__iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
```

Everything else -- the play button's appearance, hover and focus states, the poster fit, the optional visible title, the fallback link's visibility -- is yours to design.

### Typography wrappers

When the shortcode renders inside a prose/typography container (for example Tailwind Typography, whose `:where(picture)`/`:where(img)` defaults add vertical margins), those element defaults hit `youtube-embed__picture`, `youtube-embed__image`, and the injected `youtube-embed__iframe`, which can break the 16:9 box with stray bands or offsets. Reset the margins inside the facade:

```css
.youtube-embed__picture,
.youtube-embed__image,
.youtube-embed__iframe {
  margin: 0;
}
```

### CSS hooks

Every element uses BEM naming under the `youtube-embed` block:

- **Block:** `youtube-embed` (root `<div>`)
- **State modifiers:** `youtube-embed--has-poster`, `youtube-embed--no-poster`, `youtube-embed--playlist`, `youtube-embed--enhanced` (added client-side once the script wires the facade), and `youtube-embed--activated` (added client-side after Play)
- **Elements:** `youtube-embed__body`, `youtube-embed__picture`, `youtube-embed__source`, `youtube-embed__image`, `youtube-embed__button`, `youtube-embed__icon`, `youtube-embed__title`, `youtube-embed__link`, and `youtube-embed__iframe` (created client-side)

### Data attributes

| Attribute | Value | Purpose |
| --- | --- | --- |
| `data-video-id` | 11-char id | Video identification (absent for a playlist-only embed) |
| `data-playlist-id` | playlist id | Present when a playlist is embedded or appended |
| `data-embed-url` | full nocookie embed URL | The exact URL the script uses to build the iframe on click |
| `data-title` | iframe title | The `title` the script applies to the injected iframe (the video title, or the localized generic player label when untitled) |
| `data-poster-tier` | `local`/`maxres`/`hq`/`default`/`none` | Which poster tier was resolved (useful for diagnostics or styling the no-poster state) |

### Icons

The play icon is an inline SVG using `fill="currentColor"` (inherits text color), `aria-hidden="true"`, and `width="1em" height="1em"` (scales with font size). No external icon fonts are required. It is decorative: the accessible name lives on the `<button aria-label="...">`.

## Module Structure

```text
shortcodes/youtube-embed/
  go.mod
  hugo.toml
  assets/
    js/
      youtube-embed.js              # Light-DOM click-to-load enhancement (bundled by js.Build)
  i18n/
    en.toml                         # English UI strings (the fallback defaults)
    ru.toml                         # Russian UI strings
  layouts/
    _shortcodes/
      youtube-embed.html            # Entry: param extraction, id parse/validate, dispatch
    _partials/
      youtube-embed/
        parse-id.html               # id/list extraction from id or url + 11-char validation
        poster.html                 # T1-T4 poster resolution -> same-origin <picture> data
        facade.html                 # BEM markup + once-per-page script injection
        icon.html                   # Inline-SVG play icon (currentColor, 1em, aria-hidden)
```
