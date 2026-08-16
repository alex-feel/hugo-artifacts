// The text engine, locked to arithmetic rather than to a rendered picture.
//
// The title box is 1040 pixels wide, the base size is 64, the safety
// multiplier is 0.98 and the width table gives every glyph 600 per mille, so
// the budget at the base size is floor(1040 * 1000 * 0.98 / 64) = 15925 per
// mille, which is 26 glyphs. Every expected line count below is that number
// applied to a title written out of five- to eight-letter words, so a failure
// says which step of the engine moved rather than "the picture changed".
//
// The size the engine settled on is recovered from the pixels too: lines are
// drawn one pitch apart, pitch is round(size * line_height), so the distance
// across the bands divided by the gaps between them names the rung of the
// shrink ladder the fitter stopped at.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  configuredDir,
  records,
  cardImage,
  TITLE_REGION,
  DESCRIPTION_REGION,
  TITLE_BOX,
  bandPitch,
  expectedPitch,
} from './helpers.js';
import {inkBands} from './lib/raster.js';

const titleBands = (all, path, index = 0) =>
  inkBands(cardImage(configuredDir, all.get(path).cards[index].url), {region: TITLE_REGION});

test('a title wraps to the number of lines the budget allows', () => {
  // 26 glyphs a line at the base size. "Alpha bravo charlie delta" is 25 and
  // takes the next word over, so each of these titles has exactly one wrapping
  // outcome and no other.
  const all = records(configuredDir);
  for (const [path, lines] of [
    ['/blog/short', 1],
    ['/blog/two-lines', 2],
    ['/blog/three-lines', 3],
  ]) {
    assert.equal(titleBands(all, path).length, lines, `${path}: drawn lines`);
  }
});

test('a wrapped slot keeps its base size, and its lines one pitch apart', () => {
  // A title that fits does not walk the ladder, so its pitch has to be the
  // base size's. This is what makes the shrink assertion below evidence of the
  // ladder rather than of a differently sized fixture.
  const bands = titleBands(records(configuredDir), '/blog/three-lines');
  assert.equal(bands.length, 3);
  assert.equal(bandPitch(bands), expectedPitch(TITLE_BOX.size), 'pitch at the base size 64');
  assert.equal(bands[0].left, TITLE_BOX.x, 'and the first line starts at the box');
});

test('a title that does not fit shrinks by one rung and then fits', () => {
  // At 64 the last word has nowhere to go on the third line; at 60 the budget
  // is 28 glyphs and it does. The ladder therefore has to stop at 60, not fall
  // through to its floor -- a fitter that gave up and jumped to the smallest
  // rung would draw the same three lines at a visibly smaller size, and only
  // the pitch tells them apart.
  const bands = titleBands(records(configuredDir), '/blog/shrink');
  assert.equal(bands.length, 3, 'still within max_lines');
  assert.equal(bandPitch(bands), expectedPitch(60), 'one rung down from the base size');
});

test('a title too long for the whole ladder truncates at the floor instead of overflowing', () => {
  // min_scale 0.7 of 64 puts the floor at ceil(64 * 0.7) = 45, and a step of 4
  // steps 64, 60, 56, 52, 48 and then lands on the floor, because a step that
  // does not divide the distance would otherwise stop short of it. This title
  // fits no rung, so the engine draws the FLOOR rung's wrap with the last line
  // truncated: exactly max_lines bands, never more, and never a line running
  // past the box. The distinction is not cosmetic -- a ladder stopping at 48
  // truncates text that fits whole at 45.
  const bands = titleBands(records(configuredDir), '/blog/overflow');
  assert.equal(bands.length, TITLE_BOX.maxLines, 'capped at max_lines');
  assert.equal(
    bandPitch(bands),
    expectedPitch(Math.ceil(TITLE_BOX.size * 0.7)),
    'at the ladder floor',
  );
  for (const band of bands) {
    assert.ok(
      band.right < TITLE_BOX.x + TITLE_BOX.width,
      `a truncated line stayed inside the box: right ${band.right}`,
    );
  }
});

test('a single unbreakable token is hard-split inside the box, never run past its edge', () => {
  // Ninety characters with nowhere to break. Hugo's own behavior for a token
  // wider than the canvas is not something a template can predict, so the
  // engine has to split the word itself; this page exists to prove that path is
  // taken and that the case is never reached.
  const bands = titleBands(records(configuredDir), '/blog/unbreakable');
  assert.equal(bands.length, 3, 'split across the lines the slot allows');
  for (const band of bands) {
    assert.equal(band.left, TITLE_BOX.x, 'every piece starts at the box');
    assert.ok(
      band.right < TITLE_BOX.x + TITLE_BOX.width,
      `and ends inside it: right ${band.right} against ${TITLE_BOX.x + TITLE_BOX.width}`,
    );
  }
  // Thirty glyphs a line at the size the fitter settled on, three lines, and
  // the token is ninety characters: nothing was dropped on the way.
  assert.equal(bandPitch(bands), expectedPitch(56));
});

test('no wrapped line anywhere in the tree runs past the box it was given', () => {
  // The whole-tree form of the same promise. A width estimate that drifted
  // wider than the face actually draws would show up here first, on whichever
  // page happened to be closest to the edge.
  const all = records(configuredDir);
  let checked = 0;
  for (const [path, rec] of all) {
    for (const card of rec.cards) {
      // The lossy cards are excluded, not because their layout differs -- it
      // does not -- but because a JPEG's antialiased ink bleeds a few pixels
      // past the glyph and would turn a layout assertion into an encoder one.
      // tests/11-format.spec.js reads those cards for what they are.
      if (card.mediaType !== 'image/png') continue;
      const img = cardImage(configuredDir, card.url);
      for (const band of inkBands(img, {region: TITLE_REGION})) {
        checked += 1;
        assert.ok(
          band.right < TITLE_BOX.x + TITLE_BOX.width,
          `${path} ${card.url}: a title line reached ${band.right}`,
        );
        assert.ok(
          band.left >= TITLE_BOX.x,
          `${path} ${card.url}: a title line started at ${band.left}`,
        );
      }
    }
  }
  assert.ok(checked > 30, `every published card was measured: ${checked} lines`);
});

// The aligned template: the same ten glyphs in the same box at three
// alignments, one row per alignment, all below the title box.
const ALIGNED = {x: 72, width: 1000, region: {x: 0, y: 400, width: 1200, height: 230}};

test('a wrapped slot anchors its lines on the edge its alignment names', () => {
  // A wrapped slot draws one filter per LINE, so the module computes the
  // alignment anchor itself -- x for left, x + width/2 for center, x + width
  // for right -- and hands Hugo an absolute coordinate. Nothing else in a card
  // reveals that arithmetic: a centered title anchored on the wrong edge is
  // still a card with a centered-looking line on it, half a box out of place.
  const bands = inkBands(
    cardImage(configuredDir, records(configuredDir).get('/aligned/a').cards[0].url),
    {region: ALIGNED.region},
  );
  assert.equal(bands.length, 3, 'one row per alignment');
  const [left, center, right] = bands;

  assert.equal(left.left, ALIGNED.x, 'the left row starts at the left edge of the box');
  assert.ok(
    right.right <= ALIGNED.x + ALIGNED.width && right.right > ALIGNED.x + ALIGNED.width - 8,
    `the right row ends at the right edge of the box: ${right.right} against ${ALIGNED.x + ALIGNED.width}`,
  );
  const middle = (center.left + center.right) / 2;
  assert.ok(
    Math.abs(middle - (ALIGNED.x + ALIGNED.width / 2)) <= 2,
    `the center row is centered in the box: ${middle} against ${ALIGNED.x + ALIGNED.width / 2}`,
  );
  // The same statement without reference to the glyphs' own side bearings: the
  // three rows are the same run of ink at three positions, so the two steps
  // between them are equal.
  assert.ok(
    Math.abs(center.left - left.left - (right.left - center.left)) <= 1,
    `evenly stepped across the box: ${left.left}, ${center.left}, ${right.left}`,
  );
  for (const band of bands) assert.equal(band.pixels, left.pixels, 'the same ink, moved');
});

test("overflow='truncate' truncates at the base size instead of walking the ladder", () => {
  // The same title that walks the ladder to its floor under `shrink` -- so the
  // rung the engine drew at is the whole difference between the two policies,
  // and a truncate slot quietly shrinking would be invisible in the words.
  const all = records(configuredDir);
  const region = {x: 60, y: 20, width: 1050, height: 260};
  const bands = inkBands(cardImage(configuredDir, all.get('/fitting/a').cards[0].url), {region});
  assert.equal(bands.length, 2, "capped at the slot's own max_lines");
  const pitch = bandPitch(bands);
  assert.ok(
    Math.abs(pitch - expectedPitch(TITLE_BOX.size)) <= 2,
    `drawn at the base size: pitch ${pitch} against ${expectedPitch(TITLE_BOX.size)}`,
  );
  // The shrink slot on the same title, for contrast: it lands on the floor.
  assert.equal(bandPitch(titleBands(all, '/blog/overflow')), expectedPitch(45));
});

test('the ellipsis a truncating slot appends is the one it was given', () => {
  // Two rows, one unbreakable sixty-character token each, identical but for
  // the ellipsis: one explicitly empty, one four capital Ms. Both fill the
  // same budget, so the WIDTH of the two rows says nothing -- the amount of
  // ink does, because four Ms carry far more of it than the four characters
  // they displaced. A hardcoded ellipsis draws the two rows identically.
  const bands = inkBands(
    cardImage(configuredDir, records(configuredDir).get('/fitting/a').cards[0].url),
    {region: {x: 60, y: 290, width: 1050, height: 300}},
  );
  assert.equal(bands.length, 2, 'one row per ellipsis');
  const [empty, wide] = bands;
  assert.ok(
    wide.pixels > empty.pixels * 1.05,
    `the four-M ellipsis inks more than no ellipsis at all: ${wide.pixels} against ${empty.pixels}`,
  );
  for (const band of bands) {
    assert.ok(
      band.right < TITLE_BOX.x + TITLE_BOX.width,
      `and the truncated line stayed inside the box: ${band.right}`,
    );
  }
});

test('the second slot wraps against its own narrower box and its own line bound', () => {
  // The description slot is 960 wide at size 32 with max_lines 2, so it is the
  // only place a per-slot budget and a per-slot bound are visible: a fitter
  // that shared one geometry across slots would draw this one to the title's.
  const bands = inkBands(
    cardImage(configuredDir, records(configuredDir).get('/blog/overflow').cards[0].url),
    {region: DESCRIPTION_REGION},
  );
  assert.equal(bands.length, 2, "capped at the description slot's own max_lines");
  assert.equal(bandPitch(bands), expectedPitch(32), "and drawn at the description slot's own size");
});
