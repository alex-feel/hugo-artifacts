# social-share module validation suite

Playwright tests that validate the social-share module end to end against the minimal consuming site in [`fixture/`](fixture/). The fixture resolves the module from this repository checkout via `hugo.work` plus a `go.mod` `replace`, so no network module fetch is needed.

## What is covered

- `tests/01-markup.spec.js` -- server-rendered markup with JavaScript disabled: exact intent hrefs for the default list, the full encoding matrix (ampersand, percent, literal plus, emoji, quotes, angle brackets, a newline, a right-to-left override), the Mastodon fragment-only sharer, `safeURL` survival of `viber:`/`sms:` schemes, image-aware and instance-backed targets, a `networks_extra` endpoint that already carries a query, per-scheme `rel`/`target` policy, front matter overrides, the shortcode bar, and the pre-enhancement hidden state of the action buttons.
- `tests/02-enhancement.spec.js` -- progressive enhancement: capability-gated reveal of the copy and Web Share buttons, the `--enhanced` state class, the copy flow (clipboard content, live-region announcement, timed reset), and status-region emission rules.
- `tests/03-events.spec.js` -- the `social-share:share` and `social-share:action` CustomEvent surface, including that `detail.url` is the canonical page URL.

## Running

Prerequisites: Hugo v0.160.0+ (extended), Go 1.22+, Node.js 22+, and the Playwright Chromium browser (`npx playwright install chromium`).

```bash
cd modules/social-share/test
npm ci
./run-tests.sh        # or run-tests.cmd on Windows
```

The run script serves the fixture on port 1414 (override with `PORT`), fails the run if the hugo log mentions a deprecation, executes the suite, and always terminates the hugo server afterward. To run against an already-running server: `FIXTURE_URL=http://localhost:1414 npm test`.
