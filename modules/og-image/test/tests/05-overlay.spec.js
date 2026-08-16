// The overlay landed where it was configured to land, and stayed there.
//
// The badge is a flat color that appears nowhere else on any card, so its
// exact bounding box on the finished raster is the anchor arithmetic read
// back: 80 pixels square, anchored bottom right, moved 48 pixels inward on
// both axes, is (1200 - 80) - 48 = 1072 and (630 - 80) - 48 = 502. An overlay
// that landed a few pixels out, or measured its offsets from the wrong corner,
// or was composited before being resized, all produce a different rectangle
// while still being "an overlay on the card".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, records, cardImage, BADGE} from './helpers.js';
import {colorBounds, countColor, pixel, hex} from './lib/raster.js';

const BOX = {left: 1072, right: 1151, top: 502, bottom: 581};

test('the badge occupies exactly the rectangle its anchor and offsets name', () => {
  const rec = records(configuredDir).get('/blog/short');
  const img = cardImage(configuredDir, rec.cards[0].url);
  const bounds = colorBounds(img, BADGE);
  assert.ok(bounds, 'the overlay was composited at all');
  assert.deepEqual(
    {left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom},
    BOX,
    'the badge sits 48 pixels inward from the bottom right corner',
  );
  assert.equal(bounds.pixels, 80 * 80, 'at the width it was resized to, fully opaque');
});

test('nothing of the overlay appears outside that rectangle, anywhere on the card', () => {
  // The half a bounding box cannot state on its own: a stray copy of the badge
  // elsewhere on the canvas would leave the box unchanged.
  const rec = records(configuredDir).get('/blog/short');
  const img = cardImage(configuredDir, rec.cards[0].url);
  const inside = countColor(img, BADGE, {
    region: {x: BOX.left, y: BOX.top, width: 80, height: 80},
  });
  const total = countColor(img, BADGE);
  assert.equal(inside, 80 * 80);
  assert.equal(total - inside, 0, 'no badge-colored pixel outside the configured rectangle');
});

test('every card of the overlay-carrying template has the badge in the same place', () => {
  // A per-page overlay position would be a layout that depends on the words,
  // which is exactly what a template with fixed slots does not want.
  const all = records(configuredDir);
  const posts = [...all].filter(
    ([path, rec]) => rec.cards.length > 0 && path.startsWith('/blog/') && rec.section === 'blog',
  );
  let seen = 0;
  for (const [path, rec] of posts) {
    const img = cardImage(configuredDir, rec.cards[0].url);
    const bounds = colorBounds(img, BADGE);
    if (!bounds) continue; // pages routed by front matter to a template with no overlay
    seen += 1;
    assert.deepEqual(
      {left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom},
      BOX,
      `${path}: the badge moved`,
    );
  }
  assert.ok(seen >= 8, `the overlay was checked on every post card: ${seen}`);
});

test('a template with no overlay produces a card with no badge pixel at all', () => {
  // The negative control the rectangle assertions need: without it, "the badge
  // is in the right place" would also pass on a suite that painted the badge
  // unconditionally.
  const all = records(configuredDir);
  for (const path of ['/blog/no-overlay', '/twins/twin-a', '/', '/blog/wrong-size']) {
    const img = cardImage(configuredDir, all.get(path).cards[0].url);
    assert.equal(countColor(img, BADGE), 0, `${path} carries no overlay`);
    assert.equal(colorBounds(img, BADGE), null, `${path} really carries none`);
  }
});

test('an overlay larger than the canvas is clipped, and the card is still published', () => {
  // 1400 pixels wide on a 1200x630 canvas. The card has to exist, be the
  // configured size, and carry the overlay's color where the base color was --
  // a composition that failed here would either break the build or decline,
  // and the module promises neither.
  const rec = records(configuredDir).get('/oversize/thing');
  assert.equal(rec.cards.length, 1);
  const img = cardImage(configuredDir, rec.cards[0].url);
  assert.equal(img.width, 1200);
  assert.equal(img.height, 630);
  for (const [x, y] of [
    [0, 0],
    [1199, 0],
    [0, 629],
    [1199, 629],
  ]) {
    assert.equal(hex(pixel(img, x, y)), hex(BADGE), `the clipped overlay covers ${x},${y}`);
  }
});
