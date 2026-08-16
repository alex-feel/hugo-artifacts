// WHICH background raster was composited, read from the card itself.
//
// Every fixture background is a flat single color, and no two are the same, so
// a corner pixel names the template that composed the card. That is the only
// way to tell routing apart from luck: a card exists and is the right size
// whichever backdrop it was built on, and a route that quietly sends every
// page to one template looks identical in every other assertion.
//
// Both corners are read, because a filter chain that drew over one of them
// would otherwise pass.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, records, cardImage, BACKGROUNDS} from './helpers.js';
import {pixel, hex} from './lib/raster.js';

const corners = (img) => [hex(pixel(img, 0, 0)), hex(pixel(img, img.width - 1, img.height - 1))];

test('each route composited its own template background', () => {
  const all = records(configuredDir);
  const expected = [
    ['/', BACKGROUNDS.home, 'the home kind routes to the home template'],
    ['/blog/short', BACKGROUNDS.post, 'the blog section routes to the post template'],
    ['/blog', BACKGROUNDS.post, 'and so does the section index page itself'],
    ['/twins/twin-a', BACKGROUNDS.post, 'the twins section routes to the plain template'],
    ['/blog/no-overlay', BACKGROUNDS.post, 'front matter can name a different template'],
    [
      '/blog/wrong-size',
      BACKGROUNDS.wrongSize,
      'a background of the wrong size is normalized, not rejected',
    ],
  ];
  for (const [path, background, why] of expected) {
    const rec = all.get(path);
    assert.equal(rec.cards.length, 1, `${path} has a card`);
    const img = cardImage(configuredDir, rec.cards[0].url);
    assert.equal(img.width, 1200);
    assert.equal(img.height, 630);
    assert.deepEqual(corners(img), [hex(background), hex(background)], `${path}: ${why}`);
  }
});

test('an 800x400 background is filled up to the canvas rather than left short', () => {
  // The committed raster is 800x400, so the card can only be 1200x630 if the
  // module normalized it, and it can only carry that flat color everywhere if
  // the fill covered the whole canvas.
  const rec = records(configuredDir).get('/blog/wrong-size');
  const img = cardImage(configuredDir, rec.cards[0].url);
  for (const [x, y] of [
    [0, 0],
    [1199, 0],
    [0, 629],
    [1199, 629],
    [600, 500],
  ]) {
    assert.equal(hex(pixel(img, x, y)), hex(BACKGROUNDS.wrongSize), `pixel ${x},${y}`);
  }
});

test("a page's second card is composed on the template that call named, not on the first one's", () => {
  // The call tier is the only place a variant can name a template, so this is
  // where a resolver that ignored it would show: both cards would sit on the
  // post background.
  const rec = records(configuredDir).get('/blog/variant');
  const [primary, alternate] = rec.cards.map((c) => cardImage(configuredDir, c.url));
  assert.equal(hex(pixel(primary, 0, 0)), hex(BACKGROUNDS.post), 'the section route answers first');
  assert.equal(
    hex(pixel(alternate, 0, 0)),
    hex(BACKGROUNDS.home),
    'the call-tier template answers second',
  );
});

test('a page no route names composited nothing at all', () => {
  // The negative half: not "a smaller card" and not "the default background",
  // but no card, because a generator with no template for a page has nothing
  // to say about it.
  const all = records(configuredDir);
  for (const path of ['/docs/guide', '/docs', '/promo/thing']) {
    assert.deepEqual(all.get(path).cards, [], `${path} declined`);
  }
});
