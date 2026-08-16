// WHAT the card says, and in what color.
//
// Drawn text lives in pixels, so it is read back the only way a raster allows:
// the fixture draws its monospace slots in a face whose every glyph advances
// by the same amount, the calibration page fixes that amount in-build from a
// title of known length, and every other title's ink extent divided by it is a
// character count. Nothing here is copied out of a font table, so the
// measurement stays true if the face or the renderer changes.
//
// The color assertions are not decoration. Hugo draws a color it cannot read
// as white and reports nothing, so a card whose text is invisible against its
// own background is a silent failure everywhere except in a pixel.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  configuredDir,
  records,
  cardImage,
  TITLE_REGION,
  DESCRIPTION_REGION,
  TITLE_BOX,
  TITLE_COLOR,
  DESCRIPTION_COLOR,
  MONO_EM_RATIO,
} from './helpers.js';
import {inkBands, inkColor, charsOn, hex} from './lib/raster.js';

// The advance is measured from the build under test rather than assumed: the
// calibration page draws ten glyphs of one token from the box's left edge, so
// its ink extent divided by ten is the advance every other page is read with.
function calibrate(all) {
  const rec = all.get('/blog/calibration');
  const img = cardImage(configuredDir, rec.cards[0].url);
  const bands = inkBands(img, {region: TITLE_REGION});
  assert.equal(bands.length, 1, 'the calibration title is one line');
  return (bands[0].right - TITLE_BOX.x + 1) / rec.title.length;
}

test('the calibrated advance is the one the face actually has', () => {
  const advance = calibrate(records(configuredDir));
  const nominal = TITLE_BOX.size * MONO_EM_RATIO;
  assert.ok(
    Math.abs(advance - nominal) / nominal < 0.02,
    `measured advance ${advance} against the face's own ${nominal}`,
  );
});

test('the card drew the title the caller handed in, not the one the page carries', () => {
  // The discriminator: this page's .Title is two characters and the caller
  // hands twenty. A module re-deriving the title draws a stub; one honoring
  // the contract draws the string that the head publishes as og:title beside
  // the card. Nothing else in the suite can tell those two apart.
  const all = records(configuredDir);
  const advance = calibrate(all);
  const rec = all.get('/blog/handed-vs-title');
  assert.equal(rec.title, 'ii', 'the page really does carry a short title');
  assert.equal(rec.handed_title.length, 20);

  const img = cardImage(configuredDir, rec.cards[0].url);
  const bands = inkBands(img, {region: TITLE_REGION});
  assert.equal(bands.length, 1);
  assert.equal(charsOn(bands[0], {anchorX: TITLE_BOX.x, advance}), 20, 'twenty glyphs were drawn');
});

test('every monospace title card drew exactly the string it was given', () => {
  const all = records(configuredDir);
  const advance = calibrate(all);
  // Explicit rather than derived from the records, so a page dropping out of
  // the fixture is a failure instead of a silently shorter loop.
  const expected = [
    ['/', 0, 8],
    ['/blog/calibration', 0, 10],
    ['/blog/handed-vs-title', 0, 20],
    ['/blog/no-overlay', 0, 8],
    ['/blog/wrong-size', 0, 8],
    ['/blog/variant', 0, 11],
    ['/blog/variant', 1, 11],
    ['/cascaded/inherits', 0, 9],
    ['/oversize/thing', 0, 8],
    ['/twins/twin-a', 0, 12],
    ['/twins/twin-b', 0, 12],
    ['/twins/twin-c', 0, 12],
  ];
  for (const [path, index, glyphs] of expected) {
    const rec = all.get(path);
    const card = rec.cards[index];
    assert.ok(card, `${path}: card ${index} exists`);
    const img = cardImage(configuredDir, card.url);
    const bands = inkBands(img, {region: TITLE_REGION});
    assert.equal(bands.length, 1, `${path}: one title line`);
    assert.equal(
      charsOn(bands[0], {anchorX: TITLE_BOX.x, advance}),
      glyphs,
      `${path}: glyph count`,
    );
    assert.equal(bands[0].left, TITLE_BOX.x, `${path}: the line starts at the box's left edge`);
  }
});

test('the two slots were drawn in the two colors they were configured with', () => {
  // One color cannot tell a slot that used its own value from a slot that used
  // the other slot's, so the fixture gives them different ones and each is read
  // inside its own box.
  const all = records(configuredDir);
  for (const path of ['/blog/short', '/blog/two-lines', '/blog/three-lines', '/blog/glyphs']) {
    const img = cardImage(configuredDir, all.get(path).cards[0].url);
    assert.equal(
      hex(inkColor(img, {region: TITLE_REGION})),
      hex(TITLE_COLOR),
      `${path}: title color`,
    );
    assert.equal(
      hex(inkColor(img, {region: DESCRIPTION_REGION})),
      hex(DESCRIPTION_COLOR),
      `${path}: description color`,
    );
  }
});

test('the description slot draws the description, and an absent one draws nothing', () => {
  const all = records(configuredDir);
  const withText = all.get('/blog/short');
  assert.ok(withText.description.length > 0);
  const img = cardImage(configuredDir, withText.cards[0].url);
  assert.equal(inkBands(img, {region: DESCRIPTION_REGION}).length, 1);

  // The plain template has no description slot at all, so its card carries
  // nothing in that part of the canvas -- which is what makes the assertion
  // above about the post template mean something.
  const plain = cardImage(configuredDir, all.get('/blog/no-overlay').cards[0].url);
  assert.equal(inkBands(plain, {region: DESCRIPTION_REGION}).length, 0);
});

test('a caller handing an empty string is honored, not overruled by the page', () => {
  // title and description are honored by PRESENCE, not by truthiness. This
  // page carries a real title and a real description and the caller hands two
  // empty strings, so a module reading them for truth draws the page's own
  // words instead -- and the card then disagrees with the og:title and
  // og:description tags published beside it, which is the exact failure the
  // contract exists to prevent. Its card is the template's overlay and nothing
  // else, so ANY ink in either box is that failure.
  const rec = records(configuredDir).get('/blog/handed-empty');
  assert.equal(rec.mode, 'handed', 'the caller used the dict form');
  assert.equal(rec.handed_title, '', 'and handed an empty title');
  assert.ok(rec.title.length > 0, 'while the page carries one of its own');
  assert.ok(rec.description.length > 0, 'and a description of its own');
  assert.equal(rec.cards.length, 1, 'the card is still composed, from its overlay');
  const img = cardImage(configuredDir, rec.cards[0].url);
  assert.deepEqual(inkBands(img, {region: TITLE_REGION}), [], 'no title was drawn');
  assert.deepEqual(inkBands(img, {region: DESCRIPTION_REGION}), [], 'and no description');
});

test('a page with no description of its own draws the summary of its content', () => {
  // The documented fallback, and the only description path no other page in
  // the fixture takes: every other page carries its own. The expected string is
  // the page's whole body, so the glyph count says the summary was plainified
  // and trimmed rather than handed over with its markup or its trailing
  // newline attached.
  const SUMMARY = 'Body words that stand in for a description.';
  const all = records(configuredDir);
  const advance = calibrate(all);
  const rec = all.get('/blog/summary-only');
  assert.equal(rec.description, '', 'the page really carries no description');
  const img = cardImage(configuredDir, rec.cards[0].url);
  const bands = inkBands(img, {region: DESCRIPTION_REGION});
  assert.equal(bands.length, 1, 'the description slot drew one line');
  assert.equal(
    charsOn(bands[0], {anchorX: TITLE_BOX.x, advance: advance / 2}),
    SUMMARY.length,
    'and it is the summary, at the description slot’s own half size',
  );
});

test('an OpenType face draws, and draws at its own widths', () => {
  // Hugo's own documentation lists OpenType as unsupported for images.Text
  // while the module's guard admits it. This build is warning-gated, so the
  // card existing at all is half the assertion; the other half is that the
  // glyphs are the OpenType face's rather than a silent fallback to the
  // built-in one, which a proportional face's much wider ink run shows.
  const all = records(configuredDir);
  const advance = calibrate(all);
  const rec = all.get('/blog/otf');
  assert.equal(rec.cards.length, 1, 'the OpenType card was composed');
  const img = cardImage(configuredDir, rec.cards[0].url);
  const bands = inkBands(img, {region: TITLE_REGION});
  assert.equal(bands.length, 1);
  const otfAdvance = (bands[0].right - TITLE_BOX.x + 1) / rec.title.length;
  assert.ok(
    Math.abs(otfAdvance - advance) / advance > 0.1,
    `the OpenType face measures ${otfAdvance} per glyph against the monospace ${advance}`,
  );
});

test('non-Latin text is laid out and drawn, not dropped', () => {
  // Cyrillic and Greek reach the width table as glyphs it does not name, so
  // they take the fallback width. The card still has to carry real ink inside
  // its box rather than nothing, or a blank line, or a run past the edge.
  const rec = records(configuredDir).get('/blog/glyphs');
  const img = cardImage(configuredDir, rec.cards[0].url);
  const bands = inkBands(img, {region: TITLE_REGION});
  assert.equal(bands.length, 1);
  assert.ok(bands[0].pixels > 1000, `real ink was drawn: ${bands[0].pixels} pixels`);
  assert.ok(bands[0].right < TITLE_BOX.x + TITLE_BOX.width, 'and it stayed inside the box');
});
