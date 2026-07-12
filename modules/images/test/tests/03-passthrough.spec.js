// Passthrough matrix: SVG and GIF sources, static/ paths, and remote URLs
// never enter the pipeline -- they render as plain <img> elements with the
// image--static modifier, the true resolution origin in data-kind, correct
// dimension policy, and no srcset/picture machinery.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, warnCount} from './helpers.js';

const page = dom('bundle/index.html');

test('SVG renders as a bare passthrough img without invented dimensions', () => {
  const img = page.querySelector('#sc-svg');
  assert.equal(img.tagName, 'IMG');
  assert.match(img.getAttribute('class'), /\bimage--static\b/);
  assert.match(img.getAttribute('src'), /diagram\.svg$/);
  assert.equal(img.getAttribute('width'), undefined);
  assert.equal(img.getAttribute('height'), undefined);
  assert.equal(img.getAttribute('srcset'), undefined);
  assert.equal(img.getAttribute('data-kind'), 'page');
});

test('GIF renders as passthrough WITH intrinsic dimensions and no srcset', () => {
  const img = page.querySelector('#sc-gif');
  assert.equal(img.tagName, 'IMG');
  assert.match(img.getAttribute('class'), /\bimage--static\b/);
  assert.match(img.getAttribute('src'), /anim\.gif$/);
  assert.equal(img.getAttribute('width'), '10');
  assert.equal(img.getAttribute('height'), '10');
  assert.equal(img.getAttribute('srcset'), undefined);
  assert.equal(img.getAttribute('data-kind'), 'page');
});

test('a /static path renders as a warning-free passthrough', () => {
  const img = page.querySelectorAll('img').find((i) => i.getAttribute('alt') === 'Static icon');
  assert.ok(img, 'expected the static-icon hook image');
  assert.equal(img.getAttribute('src'), '/static-icon.png');
  assert.equal(img.getAttribute('data-kind'), 'static');
  assert.match(img.getAttribute('class'), /\bimage--static\b/);
  assert.equal(warnCount(/static-icon/), 0, 'static passthrough must not warn');
});

test('a remote URL is emitted untouched (shortcode and hook)', () => {
  const sc = page.querySelector('#sc-remote');
  assert.equal(sc.getAttribute('src'), 'https://example.com/r.jpg');
  assert.equal(sc.getAttribute('data-kind'), 'remote');
  assert.equal(sc.getAttribute('srcset'), undefined);
  const hook = page
    .querySelectorAll('img')
    .find((i) => i.getAttribute('alt') === 'Remote hook image');
  assert.equal(hook.getAttribute('src'), 'https://example.com/r.jpg');
  assert.equal(hook.getAttribute('data-kind'), 'remote');
});
