// The markdown output format: the module's second template surface, selected
// automatically for the same content calls when a page renders as a Markdown
// twin.
//
// The twin's job is to carry the CONTENT a disclosure would otherwise hide, in
// plain Markdown, to a reader that has no browser to open anything with. So
// the assertions are about what survives (every title, every body) and what
// must not leak (any HTML at all).
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, PAGES, read} from './helpers.js';

for (const build of BUILDS) {
  test(`[${build.name}] the twin emits no HTML`, () => {
    const md = read(PAGES.markdownTwin, build.dir);
    assert.doesNotMatch(
      md,
      /<details|<summary|<div|<svg|<span/,
      'HTML leaked into the Markdown twin',
    );
    assert.doesNotMatch(md, /class="accordion/, 'a class attribute leaked into the Markdown twin');
  });

  test(`[${build.name}] every item's title and body reach the twin`, () => {
    const md = read(PAGES.markdownTwin, build.dir);
    for (const title of ['Shipping', 'Returns', 'Warranty', 'Heading item', 'Standalone']) {
      assert.ok(md.includes(title), `the twin dropped the item titled ${JSON.stringify(title)}`);
    }
    assert.match(
      md,
      /Ships in \*\*two\*\* days\./,
      'the twin dropped a body, or re-rendered its Markdown',
    );
    assert.match(
      md,
      /A second paragraph, so the body is proven to be block-level\./,
      'the twin dropped a paragraph',
    );
  });

  test(`[${build.name}] the label form mirrors the HTML structure decision`, () => {
    const md = read(PAGES.markdownTwin, build.dir);
    // No heading configured in HTML -> a plain span there, a bold line here.
    assert.match(md, /^\*\*Shipping\*\*$/m, 'a default item did not emit a bold label');
    // heading=3 in HTML -> an h3 there, an ATX heading of the same level here.
    assert.match(md, /^### Heading item$/m, 'a heading-mode item did not emit an ATX heading');
    assert.doesNotMatch(
      md,
      /^\*\*Heading item\*\*$/m,
      'a heading-mode item also emitted a bold label',
    );
  });

  test(`[${build.name}] the twin carries no disclosure state, id or class`, () => {
    // open, id and class are HTML rendering features with no Markdown
    // representation; a twin that tried to express them would be inventing
    // syntax.
    const md = read(PAGES.markdownTwin, build.dir);
    assert.doesNotMatch(md, /\bopen\b\s*=/, 'the twin emitted an open attribute');
    assert.doesNotMatch(md, /\{#[a-z0-9-]+\}/, 'the twin emitted an id syntax');
  });

  test(`[${build.name}] the twin and the HTML page render the same call set`, () => {
    // A drift here would mean one surface silently skipped an item -- the
    // failure neither surface can see on its own.
    const md = read(PAGES.markdownTwin, build.dir);
    const html = read(PAGES.home, build.dir);
    const titles = ['Shipping', 'Returns', 'Warranty', 'Heading item', 'Standalone'];
    for (const title of titles) {
      assert.ok(
        html.includes(`>${title}</span>`),
        `the HTML page dropped ${JSON.stringify(title)}`,
      );
      assert.ok(md.includes(title), `the twin dropped ${JSON.stringify(title)}`);
    }
  });
}
