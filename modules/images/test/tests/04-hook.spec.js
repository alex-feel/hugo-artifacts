// Markdown render hook: standalone images get the full pipeline, the
// below-the-image attribute block delivers overrides while module-owned
// attribute names are deny-listed, inline images stay phrasing-only, a
// missing file degrades to the raw src with one warning, and the #raw
// fragment bypasses the pipeline for one image.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, rawHtml, warnCount} from './helpers.js';

const page = dom('bundle/index.html');
const raw = rawHtml('bundle/index.html');

test('a standalone Markdown image renders the full pipeline in block form', () => {
  const img = page.querySelectorAll('img').find((i) => i.getAttribute('alt') === 'Global asset');
  assert.ok(img, 'expected the global-asset hook image');
  const picture = img.parentNode;
  assert.equal(picture.tagName, 'PICTURE');
  assert.equal(picture.getAttribute('data-kind'), 'global');
  assert.ok(picture.querySelector('source[type="image/webp"]'));
  assert.ok(img.getAttribute('srcset'));
  assert.ok(img.getAttribute('sizes'));
  assert.ok(img.getAttribute('width'));
  let ancestor = picture.parentNode;
  while (ancestor) {
    assert.notEqual(ancestor.tagName, 'P', 'a standalone image must not sit inside a paragraph');
    ancestor = ancestor.parentNode;
  }
});

test('the attribute block delivers overrides and the deny-list drops module-owned names', () => {
  const picture = page.querySelector('#hook-attr');
  assert.ok(picture, 'expected #hook-attr');
  assert.equal(picture.getAttribute('data-layout'), 'fixed', 'the layout override was delivered');
  const img = picture.querySelector('img');
  assert.equal(img.getAttribute('width'), '480', 'the width override was delivered');
  assert.equal(img.getAttribute('data-author-note'), 'kept', 'unowned attributes pass through');
  assert.ok(!raw.includes('evil.png'), 'the deny-listed src attribute must be dropped');
  assert.equal(warnCount(/Dropping the Markdown attribute "src"/), 1);
});

test('an inline-in-paragraph image renders phrasing-only content', () => {
  const img = page.querySelectorAll('img').find((i) => i.getAttribute('alt') === 'Bundle inline');
  assert.ok(img, 'expected the inline hook image');
  let node = img.parentNode;
  let sawParagraph = false;
  while (node) {
    assert.notEqual(node.tagName, 'FIGURE', 'inline images must not emit a figure');
    if (node.tagName === 'P') sawParagraph = true;
    node = node.parentNode;
  }
  assert.ok(sawParagraph, 'the inline image must stay inside its paragraph');
});

test('a missing destination still renders an img and warns exactly once', () => {
  const img = page.querySelectorAll('img').find((i) => i.getAttribute('alt') === 'Missing image');
  assert.ok(img, 'the build must not fail on a missing image');
  assert.equal(img.getAttribute('src'), 'nope.png');
  assert.match(img.getAttribute('class'), /\bimage--static\b/);
  assert.equal(warnCount(/nope\.png/), 1);
});

test('the #raw fragment renders the neutral fallback', () => {
  const img = page.querySelectorAll('img').find((i) => i.getAttribute('alt') === 'Raw bypass');
  assert.ok(img, 'expected the raw-bypass hook image');
  assert.equal(img.getAttribute('src'), '/bundle/photo-1600.png', 'the ORIGINAL file is emitted');
  assert.equal(img.getAttribute('srcset'), undefined);
  assert.match(img.getAttribute('class'), /\bimage--static\b/);
  assert.equal(img.getAttribute('width'), '1600');
  assert.equal(img.getAttribute('height'), '900');
});
