// Default render contract: photo-1600.png (1600x900) under the fixture
// ladder [480, 800] must emit the exact picture/source/img shape with a
// WebP chain, a PNG fallback chain, generated sizes with the lazy "auto,"
// prefix, CLS dimensions, and existing non-empty derivative files.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, publishedNonEmpty, srcsetEntries} from './helpers.js';

const picture = dom('bundle/index.html').querySelector('#sc-default');

test('default render emits a picture with the block class on the root', () => {
  assert.ok(picture, 'expected #sc-default');
  assert.equal(picture.tagName, 'PICTURE');
  assert.match(picture.getAttribute('class'), /\bimage\b/);
  assert.match(picture.getAttribute('class'), /\bimage__picture\b/);
  assert.equal(picture.getAttribute('data-kind'), 'page');
  assert.equal(picture.getAttribute('data-layout'), 'constrained');
});

test('WebP source carries exactly the clamped ladder in ascending order', () => {
  const source = picture.querySelector('source');
  assert.equal(source.getAttribute('type'), 'image/webp');
  const entries = srcsetEntries(source.getAttribute('srcset'));
  assert.deepEqual(
    entries.map((e) => e.desc),
    ['480w', '800w'],
  );
  for (const e of entries) assert.match(e.url, /\.webp$/);
});

test('fallback img mirrors the ladder in PNG with CLS dimensions', () => {
  const img = picture.querySelector('img');
  const entries = srcsetEntries(img.getAttribute('srcset'));
  assert.deepEqual(
    entries.map((e) => e.desc),
    ['480w', '800w'],
  );
  for (const e of entries) assert.match(e.url, /\.png$/);
  assert.match(img.getAttribute('src'), /\.png$/);
  assert.equal(img.getAttribute('width'), '800');
  assert.equal(img.getAttribute('height'), '450');
});

test('sizes is generated from the layout with the lazy auto prefix', () => {
  const expected = 'auto, (min-width: 800px) 800px, 100vw';
  assert.equal(picture.querySelector('source').getAttribute('sizes'), expected);
  assert.equal(picture.querySelector('img').getAttribute('sizes'), expected);
});

test('lazy loading policy applies to non-priority images', () => {
  const img = picture.querySelector('img');
  assert.equal(img.getAttribute('loading'), 'lazy');
  assert.equal(img.getAttribute('decoding'), 'async');
  assert.equal(img.getAttribute('fetchpriority'), undefined);
});

test('the source element precedes the img element', () => {
  const children = picture.childNodes.filter((n) => n.tagName);
  assert.equal(children[0].tagName, 'SOURCE');
  assert.equal(children[children.length - 1].tagName, 'IMG');
});

test('every referenced derivative exists in public/ and is non-empty', () => {
  const urls = [];
  for (const source of picture.querySelectorAll('source')) {
    urls.push(...srcsetEntries(source.getAttribute('srcset')).map((e) => e.url));
  }
  const img = picture.querySelector('img');
  urls.push(img.getAttribute('src'));
  urls.push(...srcsetEntries(img.getAttribute('srcset')).map((e) => e.url));
  for (const url of urls) assert.ok(publishedNonEmpty(url), `missing derivative ${url}`);
});
