// Indentation and nesting: the two ways an item's body meets the Markdown
// renderer, and the one real limitation the module carries.
//
// An item body is rendered with .Page.RenderString, which is a second pass
// through Goldmark. That is what makes nested shortcodes, render hooks, and
// full block Markdown work in a body -- and it is also why raw HTML in a body
// obeys markup.goldmark.renderer.unsafe. The suite builds the fixture at both
// settings so the limitation and its documented remedy are each proven,
// instead of whichever one a single fixture happened to configure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGES, read, items, defaultDir, unsafeDir, elements} from './helpers.js';

const BODY_HTML_PAGES = [PAGES.nesting, PAGES.layout];
const NO_BODY_HTML_PAGES = [PAGES.home, PAGES.groups, PAGES.ids, PAGES.degrade];

test('an indented body is Markdown, not a code block', () => {
  // .InnerDeindent, not .Inner: CommonMark reads four spaces of leading
  // indentation as a code block, which is exactly what a shortcode authored
  // inside a Markdown list item carries.
  for (const dir of [defaultDir, unsafeDir]) {
    const item = items(read(PAGES.nesting, dir)).find((i) => i.titleText === 'Indented');
    assert.ok(item, 'the indented item is missing');
    // <pre> alone is the code-BLOCK signal; the body legitimately contains
    // inline <code>, so matching on that would fail against correct output.
    assert.doesNotMatch(item.body.inner, /<pre\b/, 'the indented body rendered as a code block');
    assert.match(
      item.body.inner,
      /<p>This body is indented/,
      'the indented body lost its paragraph',
    );
    assert.equal(elements(item.body.inner, 'li').length, 1, 'the indented body lost its list');
  }
});

test('a nested accordion is dropped at the default Markdown settings', () => {
  // Goldmark's default unsafe = false replaces raw HTML with an omission
  // comment, and an inner accordion has already been rendered to HTML by the
  // time the outer item's body is rendered. Hugo warns about it per page; the
  // module cannot override a site-level markup setting.
  const outer = items(read(PAGES.nesting, defaultDir)).find((i) => i.titleText === 'Outer');
  assert.ok(outer, 'the outer item is missing');
  assert.match(
    outer.body.inner,
    /<!-- raw HTML omitted -->/,
    'the documented limitation no longer reproduces',
  );
  assert.equal(
    items(outer.body.inner).length,
    0,
    'a nested accordion survived at the default settings, so the limitation is stale',
  );
});

test('a nested accordion renders whole once raw HTML is allowed', () => {
  const outer = items(read(PAGES.nesting, unsafeDir)).find((i) => i.titleText === 'Outer');
  assert.ok(outer, 'the outer item is missing');
  assert.doesNotMatch(outer.body.inner, /<!-- raw HTML omitted -->/, 'content was still dropped');
  const inner = items(outer.body.inner);
  assert.equal(inner.length, 1, 'the nested accordion did not render inside the outer item');
  assert.equal(inner[0].titleText, 'Inner', 'the nested item lost its title');
  assert.equal(inner[0].bodyId, 'inner', 'the nested item lost its minted id');
  assert.match(inner[0].body.inner, /<p>The inner body\.<\/p>/, 'the nested item lost its body');
});

test('the markup setting changes only the pages whose bodies carry raw HTML', () => {
  // The subject that moves: without this pair the two builds could be
  // identical everywhere and every assertion above would still pass against
  // one tree read twice.
  for (const rel of NO_BODY_HTML_PAGES) {
    assert.equal(
      read(rel, defaultDir),
      read(rel, unsafeDir),
      `${rel} differs between the two builds, so something other than raw-HTML handling changed`,
    );
  }
  for (const rel of BODY_HTML_PAGES) {
    assert.notEqual(
      read(rel, defaultDir),
      read(rel, unsafeDir),
      `${rel} is identical in both builds, so the unsafe overlay never took effect`,
    );
  }
});
