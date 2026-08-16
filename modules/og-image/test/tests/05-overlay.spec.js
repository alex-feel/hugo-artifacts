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
import {configuredDir, records, cardImage, BADGE, BACKGROUNDS} from './helpers.js';
import {colorBounds, countColor, pixel, hex} from './lib/raster.js';

const BOX = {left: 1072, right: 1151, top: 502, bottom: 581};

// The overlaid template. Three squares of 80 pixels, one per source, each a
// flat color that appears nowhere else on the card: the parameter's image is
// blue, the page's own bundled image is green, and the badge at half opacity
// is neither red nor the backdrop.
const PARAM_IMAGE = {r: 0x00, g: 0x00, b: 0xfa};
const BUNDLED_IMAGE = {r: 0x00, g: 0xfa, b: 0x00};
const SQUARE = (x) => ({left: x, right: x + 79, top: 440, bottom: 519, pixels: 80 * 80});
const FADED = {x: 600, y: 440};

const overlaid = (all, path) => cardImage(configuredDir, all.get(path).cards[0].url);

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

test("an overlay reading a page parameter resolves that page's own value", () => {
  // The parameter holds a path, and the module resolves it against the page's
  // own bundle FIRST and assets/ second. Two pages take the two halves of that
  // rule: one names an assets/ path, one names its own bundled image, and the
  // colors say which resolution actually happened rather than merely that
  // something was drawn.
  const all = records(configuredDir);
  const fromAssets = overlaid(all, '/overlays/asset-param');
  assert.deepEqual(colorBounds(fromAssets, PARAM_IMAGE), SQUARE(200), 'the assets/ path resolved');
  assert.equal(countColor(fromAssets, BUNDLED_IMAGE), 0, 'and nothing else did');

  const fromBundle = overlaid(all, '/overlays/bundled');
  assert.equal(countColor(fromBundle, PARAM_IMAGE), 0, 'this page names no assets/ path');
  assert.equal(
    countColor(fromBundle, BUNDLED_IMAGE, {region: {x: 200, y: 440, width: 80, height: 80}}),
    80 * 80,
    "the page's own bundled image resolved instead",
  );
});

test("an overlay matching the page's own resources draws the image it matched", () => {
  // The documented per-page avatar: a glob against the page's bundle. The page
  // carrying the bundle draws it; the pages that do not carry one draw nothing
  // there and say nothing about it, because a page without the image is the
  // design rather than a mistake.
  const all = records(configuredDir);
  const bundled = overlaid(all, '/overlays/bundled');
  assert.equal(
    countColor(bundled, BUNDLED_IMAGE, {region: {x: 400, y: 440, width: 80, height: 80}}),
    80 * 80,
    'the glob matched the bundled image',
  );
  assert.deepEqual(
    colorBounds(bundled, BUNDLED_IMAGE),
    {...SQUARE(200), right: 479, pixels: 2 * 80 * 80},
    'and the two squares that image fills are the only ones',
  );
  for (const path of ['/overlays', '/overlays/asset-param', '/overlays/odd-param']) {
    assert.equal(countColor(overlaid(all, path), BUNDLED_IMAGE), 0, `${path} carries no bundle`);
  }
});

test('an overlay a page cannot resolve is dropped without a word, and the rest is drawn', () => {
  // Two pages whose parameter holds a value no lookup can turn into an image:
  // one path the operating system refuses outright and one value that is not a
  // matchable pattern. Both of those RAISE rather than returning nothing, so
  // an unguarded lookup takes the whole build down; caught, they mean what an
  // absent parameter means. This build's silence is gated by the runner, so
  // the card existing with its remaining overlay intact is the assertion.
  const all = records(configuredDir);
  for (const path of ['/overlays/odd-param', '/overlays/odd-glob', '/overlays']) {
    const img = overlaid(all, path);
    assert.equal(countColor(img, PARAM_IMAGE), 0, `${path}: nothing resolved from the parameter`);
    assert.equal(countColor(img, BUNDLED_IMAGE), 0, `${path}: and nothing from the bundle`);
    assert.notEqual(
      hex(pixel(img, FADED.x + 40, FADED.y + 40)),
      hex(BACKGROUNDS.post),
      `${path}: the overlay that could be resolved still was`,
    );
  }
});

test('an overlay given an opacity is blended with the backdrop, not stamped on it', () => {
  // The badge is a flat red and the backdrop is a flat dark red, so half
  // opacity has exactly one possible answer: a color that is neither, sitting
  // between them on every channel. An opacity that was parsed and then not
  // applied draws the badge's own color, which is why the assertion is that
  // NO pixel of the card carries it.
  const all = records(configuredDir);
  for (const path of ['/overlays', '/overlays/bundled', '/overlays/asset-param']) {
    const img = overlaid(all, path);
    assert.equal(countColor(img, BADGE), 0, `${path}: the badge is nowhere drawn opaque`);
    const blended = pixel(img, FADED.x + 40, FADED.y + 40);
    assert.ok(
      blended.r > BACKGROUNDS.post.r && blended.r < BADGE.r,
      `${path}: blended between the two: ${hex(blended)}`,
    );
    assert.deepEqual(
      colorBounds(img, blended),
      SQUARE(FADED.x),
      `${path}: and the blend covers exactly the square the overlay was placed in`,
    );
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
