// Gallery contract: an ordered list with gapless 1-based indexes
// zero-padded to the item count's digit width, complete image blocks per
// item, resource-metadata alt/caption/credit, the alt-less degradation
// (alt="" without a lightbox anchor plus one warning), and uniform crop
// geometry with uncropped lightbox targets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, warnCount} from './helpers.js';

const page = dom('bundle/index.html');
const plain = page.querySelector('#gallery-plain');
const crop = page.querySelector('#gallery-crop');

test('the gallery is an ordered list with a matching count and gapless indexes', () => {
  assert.equal(plain.tagName, 'OL');
  const items = plain.querySelectorAll('li.image-gallery__item');
  assert.equal(plain.getAttribute('data-count'), String(items.length));
  assert.equal(items.length, 3);
  items.forEach((li, i) => {
    assert.equal(li.getAttribute('data-index'), String(i + 1));
  });
});

test('items with alt metadata are complete image blocks with lightbox anchors', () => {
  const items = plain.querySelectorAll('li.image-gallery__item');
  for (const li of items.slice(0, 2)) {
    const anchor = li.querySelector('a.image__link');
    assert.ok(anchor, 'expected a lightbox anchor');
    const img = li.querySelector('img');
    assert.notEqual(img.getAttribute('alt'), '');
    assert.ok(img.getAttribute('srcset'));
    assert.ok(img.getAttribute('width'));
  }
});

test('resource metadata surfaces as alt, caption, and credit', () => {
  const first = plain.querySelector('li.image-gallery__item');
  assert.equal(first.querySelector('img').getAttribute('alt'), 'Purple rectangle one');
  assert.equal(first.querySelector('.image__caption').textContent, 'Gallery one');
  assert.equal(first.querySelector('.image__credit').textContent, 'Ann Author');
});

test('an alt-less item renders alt="" without an anchor and warns once', () => {
  const third = plain.querySelectorAll('li.image-gallery__item')[2];
  assert.equal(third.querySelector('img').getAttribute('alt'), '');
  assert.equal(third.querySelector('a'), null, 'the lightbox anchor is suppressed');
  assert.equal(warnCount(/gallery\/g3\.png/), 1, 'deduplicated across all gallery calls');
});

test('crop="1x1" emits square tiles while anchors target uncropped derivatives', () => {
  const items = crop.querySelectorAll('li.image-gallery__item');
  assert.equal(items.length, 3);
  for (const li of items) {
    const img = li.querySelector('img');
    assert.equal(img.getAttribute('width'), img.getAttribute('height'), 'square tile');
  }
  const anchor = items[0].querySelector('a.image__link');
  assert.equal(anchor.getAttribute('data-full-width'), '300');
  assert.equal(anchor.getAttribute('data-full-height'), '200', 'the lightbox stays uncropped');
});

test('index_pad raises the data-index width to a fixed minimum', () => {
  const minpad = page.querySelector('#gallery-minpad');
  assert.equal(minpad.getAttribute('data-count'), '3');
  const items = minpad.querySelectorAll('li.image-gallery__item');
  assert.equal(items.length, 3);
  items.forEach((li, i) => {
    assert.equal(
      li.getAttribute('data-index'),
      String(i + 1).padStart(2, '0'),
      'index_pad="2" pads a three-item gallery to two digits',
    );
  });
});

test('a page-tier gallery.index_pad cascades without a call argument', () => {
  const padded = dom('padded/index.html');
  const cascade = padded.querySelector('#gallery-cascade');
  assert.equal(cascade.getAttribute('data-count'), '2');
  const items = cascade.querySelectorAll('li.image-gallery__item');
  items.forEach((li, i) => {
    assert.equal(
      li.getAttribute('data-index'),
      String(i + 1).padStart(2, '0'),
      'the front-matter img.gallery.index_pad value pads a two-item gallery',
    );
  });
});

test('a ten-item gallery zero-pads data-index to the count digit width', () => {
  const pad = page.querySelector('#gallery-pad');
  assert.equal(pad.getAttribute('data-count'), '10');
  const items = pad.querySelectorAll('li.image-gallery__item');
  assert.equal(items.length, 10);
  items.forEach((li, i) => {
    assert.equal(
      li.getAttribute('data-index'),
      String(i + 1).padStart(2, '0'),
      'lexicographic attribute order matches document order',
    );
  });
  assert.equal(pad.querySelector('a.image__link'), null, 'lightbox="false" suppresses anchors');
});
