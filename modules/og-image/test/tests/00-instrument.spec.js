/* global Buffer */
// The measuring instrument is itself under test. Every other spec in this
// suite reads a card through tests/lib/raster.js, so a decoder that is wrong
// makes every downstream assertion pass or fail for the wrong reason, and a
// suite failing that way is indistinguishable from a suite that passes.
//
// The subjects are the fixture's own COMMITTED rasters, whose contents are
// known before any build runs: flat single-color canvases whose every pixel
// is stated in tests/helpers.js, plus the file that is deliberately not an
// image at all. The band and bounding-box functions are exercised against a
// hand-built pixel buffer rather than a rendered card, because a rendered card
// would make the instrument's correctness depend on the module the instrument
// exists to measure.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureAsset, BACKGROUNDS, BADGE} from './helpers.js';
import {
  sniff,
  decodePng,
  pixel,
  hex,
  inkBands,
  inkColor,
  inkPixels,
  charsOn,
  colorBounds,
  countColor,
} from './lib/raster.js';

test('the header sniffer reads dimensions out of the bytes, not out of a decoder', () => {
  const post = sniff(fixtureAsset('og/post-bg.png'));
  assert.equal(post.format, 'png');
  assert.equal(post.width, 1200);
  assert.equal(post.height, 630);
  assert.equal(post.bitDepth, 8);
  assert.equal(post.interlace, 0);

  const wrong = sniff(fixtureAsset('og/wrong-size.png'));
  assert.equal(wrong.width, 800);
  assert.equal(wrong.height, 400);

  const badge = sniff(fixtureAsset('og/badge.png'));
  assert.equal(badge.width, 80);
  assert.equal(badge.height, 80);
  assert.equal(badge.colorType, 6, 'the badge carries an alpha channel');
});

test('a file that is not an image is a loud failure, never a silent zero', () => {
  // The same bytes the degraded environment feeds the module as a background
  // and as an overlay. An instrument that returned a plausible-looking header
  // for them would make the module's decode guard untestable.
  assert.throws(() => sniff(fixtureAsset('og/not-an-image.png')), /not a PNG, JPEG or WebP/);
});

test('a decoded flat raster returns the exact color it was written with', () => {
  const img = decodePng(fixtureAsset('og/post-bg.png'));
  assert.equal(img.width, 1200);
  assert.equal(img.height, 630);
  assert.equal(img.channels, 3);
  for (const [x, y] of [
    [0, 0],
    [1199, 629],
    [600, 315],
    [0, 629],
    [1199, 0],
  ]) {
    assert.deepEqual(
      {r: pixel(img, x, y).r, g: pixel(img, x, y).g, b: pixel(img, x, y).b},
      BACKGROUNDS.post,
      `pixel ${x},${y}`,
    );
  }
  assert.equal(hex(pixel(img, 0, 0)), '#1e0a14');
});

test('a four-channel raster decodes its alpha as well as its color', () => {
  const img = decodePng(fixtureAsset('og/badge.png'));
  assert.equal(img.channels, 4);
  assert.equal(hex(pixel(img, 40, 40)), '#fa0000');
  assert.equal(pixel(img, 40, 40).a, 255);
  assert.equal(countColor(img, BADGE), 80 * 80, 'every pixel of the badge is the badge color');
});

test('a flat raster has no ink at all, which is what makes an ink band mean something', () => {
  const img = decodePng(fixtureAsset('og/home-bg.png'));
  assert.equal(inkBands(img).length, 0);
  assert.equal(inkPixels(img).length, 0);
  assert.equal(inkColor(img), null);
});

// A hand-built canvas with a known layout: three horizontal marks separated by
// blank rows, and one solid square. Every number the band and bounding-box
// functions return for it is arithmetic anyone can check by reading this
// literal, which is exactly what an instrument test needs and what a rendered
// card cannot give.
function canvas() {
  const width = 200;
  const height = 100;
  const data = Buffer.alloc(width * height * 3, 0);
  const img = {width, height, channels: 3, data};
  const put = (x, y, [r, g, b]) => {
    const i = (y * width + x) * 3;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  };
  // Marks at rows 10, 30 and 50, each 5 rows tall, running x 20..59.
  for (const top of [10, 30, 50])
    for (let y = top; y < top + 5; y++) for (let x = 20; x < 60; x++) put(x, y, [255, 212, 0]);
  // A solid square at x 150..169, y 70..89.
  for (let y = 70; y < 90; y++) for (let x = 150; x < 170; x++) put(x, y, [250, 0, 0]);
  return img;
}

test('ink bands count the drawn lines and report where each one starts and ends', () => {
  const img = canvas();
  const bands = inkBands(img, {region: {x: 0, y: 0, width: 200, height: 60}});
  assert.equal(bands.length, 3, 'three separated marks are three bands');
  assert.deepEqual(
    bands.map((b) => [b.top, b.bottom, b.left, b.right]),
    [
      [10, 14, 20, 59],
      [30, 34, 20, 59],
      [50, 54, 20, 59],
    ],
  );
  assert.equal(bands[1].top - bands[0].top, 20, 'the distance between band tops is the pitch');
  assert.equal(bands[0].pixels, 40 * 5);
});

test('a region confines a measurement to one slot and excludes everything else', () => {
  const img = canvas();
  assert.equal(inkBands(img, {region: {x: 0, y: 0, width: 200, height: 20}}).length, 1);
  assert.equal(inkBands(img, {region: {x: 0, y: 60, width: 140, height: 40}}).length, 0);
  assert.deepEqual(inkColor(img, {region: {x: 0, y: 0, width: 200, height: 60}}), {
    r: 255,
    g: 212,
    b: 0,
    a: 255,
  });
});

test('a flat color reports its exact rectangle, or nothing when it is absent', () => {
  const img = canvas();
  assert.deepEqual(colorBounds(img, {r: 250, g: 0, b: 0}), {
    left: 150,
    right: 169,
    top: 70,
    bottom: 89,
    pixels: 400,
  });
  assert.equal(colorBounds(img, {r: 0, g: 255, b: 0}), null, 'a color nothing was drawn in');
});

test('a character count is recovered from a constant advance', () => {
  // The monospace arithmetic every text assertion rests on: an ink run reaching
  // x=455 from an anchor at x=72 with an advance of 38.4 is ten glyphs, which
  // is what the calibration page draws.
  assert.equal(charsOn({right: 455}, {anchorX: 72, advance: 38.4}), 10);
  assert.equal(charsOn({right: 839}, {anchorX: 72, advance: 38.4}), 20);
  assert.equal(charsOn({right: 262}, {anchorX: 72, advance: 38.4}), 5);
});
