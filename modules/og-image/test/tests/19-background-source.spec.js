// A card composed ON the page's own artwork.
//
// Before the background key took a source table, the only way to reach a
// page's own image was to pass it as a full-bleed overlay -- and an overlay is
// not a background. A background is normalized with .Fill, which crops to fill
// at any source aspect ratio; an overlay is resized to a width with its aspect
// preserved and then composited, so it covers the canvas only when the source
// happens to be tall enough afterwards. The overlay route therefore works for
// a square source and fails silently for a wide one, publishing a card with
// the base raster showing through while the build exits 0.
//
// The two fixture tiles are 400x40 and 40x400 against a 1200x630 canvas, which
// is what makes these assertions about .Fill rather than about luck: no
// aspect-preserving resize of either one covers the canvas, so a card whose
// FOUR CORNERS carry the tile's color can only have been filled.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  configuredDir,
  degradedDir,
  records,
  cardImage,
  BACKGROUNDS,
  moduleWarnings,
} from './helpers.js';
import {pixel, hex} from './lib/raster.js';

const CORNERS = [
  [0, 0],
  [1199, 0],
  [0, 629],
  [1199, 629],
];

function cardOf(dir, path) {
  const rec = records(dir).get(path);
  assert.ok(rec, `${path} was built`);
  assert.equal(rec.cards.length, 1, `${path} has exactly one card`);
  return cardImage(dir, rec.cards[0].url);
}

function assertFilledWith(img, color, why) {
  assert.equal(img.width, 1200, `${why}: canvas width`);
  assert.equal(img.height, 630, `${why}: canvas height`);
  for (const [x, y] of CORNERS) {
    assert.equal(hex(pixel(img, x, y)), hex(color), `${why}: pixel ${x},${y}`);
  }
  // A corner is where an aspect-preserving composite leaves the base showing;
  // the middle is where it does not, so reading both is what separates "the
  // fill covered the canvas" from "something was drawn in the corners".
  assert.equal(hex(pixel(img, 600, 315)), hex(color), `${why}: the middle`);
}

test('the fixture keeps the three candidate colors distinct', () => {
  // Without this every assertion below could pass on the wrong background.
  const {pageTile, pageCover, post, home} = BACKGROUNDS;
  const seen = [pageTile, pageCover, post, home].map(hex);
  assert.equal(new Set(seen).size, seen.length, `two backgrounds share a color: ${seen}`);
});

test('a page-bundle resource becomes the background, filled to the canvas', () => {
  // 400x40. Resized to the canvas width with its aspect preserved it would be
  // 120 pixels tall on a 630-pixel canvas, so this card is 510 pixels of
  // evidence that .Fill ran.
  assertFilledWith(
    cardOf(configuredDir, '/bgsource/wide'),
    BACKGROUNDS.pageTile,
    'the wide tile the page carries',
  );
});

test('and so does one named through a front-matter key', () => {
  // 40x400, the other extreme: aspect-preserved to the canvas height it would
  // be 63 pixels wide.
  assertFilledWith(
    cardOf(configuredDir, '/bgparam/cover'),
    BACKGROUNDS.pageCover,
    'the tall cover the page names',
  );
});

test('a background whose path lives in data/ resolves and fills, leading slash and all', () => {
  // The value is stored as '/og/home-bg.png' on purpose: the module trims one
  // leading slash from a param or data value before the assets/ lookup, so
  // the site-absolute spelling a data file tends to carry still resolves.
  // The template declares no fallback, so a card filled with the home color
  // is the primary source answering -- and the value is the site's rather
  // than the page's, so the section page and the leaf both get one.
  for (const path of ['/bgdata', '/bgdata/a']) {
    assertFilledWith(
      cardOf(configuredDir, path),
      BACKGROUNDS.home,
      `${path} composed on the data-named backdrop`,
    );
  }
});

test('a routed page carrying no artwork is carded on the declared fallback', () => {
  // The case the fallback exists for, and the one that used to force a
  // placeholder background whose only job was to be covered up.
  for (const path of ['/bgsource/plain', '/bgsource']) {
    assertFilledWith(cardOf(configuredDir, path), BACKGROUNDS.post, `${path} took the fallback`);
  }
});

test('taking the fallback is silent, because carrying no artwork is not a mistake', () => {
  // The configured build is warning-gated as a whole; this names the reason so
  // a failure here says which contract broke.
  assert.deepEqual(moduleWarnings('configured'), []);
});

test('a template mistake still cards the page when a fallback is declared', () => {
  // The degraded environment's bad-match template: the pattern is the
  // template's mistake and warns, but the fallback means the page is not
  // punished for it. The warning is asserted in 07-degraded.spec.js; this is
  // the pixel-side half.
  assertFilledWith(
    cardOf(degradedDir, '/deg-bgbadmatch/a'),
    BACKGROUNDS.post,
    'the unmatchable pattern fell through to the fallback',
  );
});

test('without a fallback the same page is declined rather than half-composed', () => {
  // The other half of the pair, and the module's central promise: a background
  // that cannot be resolved declines the card instead of publishing one drawn
  // on nothing.
  for (const path of ['/deg-bgabsent/a', '/deg-bgnolocator/a', '/deg-bgunknownsource/a']) {
    const rec = records(degradedDir).get(path);
    assert.ok(rec, `${path} was built`);
    assert.deepEqual(rec.cards, [], `${path} publishes no card`);
  }
});

test('every data-source background fault declines its page the same way', () => {
  // The pixel side of the four data diagnostics 07-degraded.spec.js asserts:
  // a missing key, a key naming no value, a table where a path should be, and
  // a fine path naming a file that exists nowhere. None declares a fallback,
  // so each page is declined rather than half-composed.
  for (const path of [
    '/deg-bgdatanokey/a',
    '/deg-bgdatanovalue/a',
    '/deg-bgdatabadvalue/a',
    '/deg-bgdatamissing/a',
  ]) {
    const rec = records(degradedDir).get(path);
    assert.ok(rec, `${path} was built`);
    assert.deepEqual(rec.cards, [], `${path} publishes no card`);
  }
});
