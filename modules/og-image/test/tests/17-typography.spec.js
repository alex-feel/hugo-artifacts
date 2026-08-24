// Typography is the consuming site's, at three levels: a text slot, the card
// template that slot belongs to, and the module level -- most specific
// winning, with the module level itself still resolved through Hugo's four
// tiers.
//
// Every assertion here is arithmetic on the pixels rather than a report that a
// value resolved. Two instruments carry it:
//
//   PITCH. A wrapping slot places each line round(size * line_height) below
//   the one above it, so the distance between two band tops names the line
//   height that reached the slot. At size 64 the fixture's three values are
//   122, 70 and 96 pixels apart and the shipped 1.4 is 90 -- four numbers, no
//   two of them adjacent, so a cascade that collapsed two levels into one
//   lands on a pitch that belongs to a level it should not have read.
//
//   EXTENT. The same string at the same size inks the same horizontal run in
//   the same face and a visibly different one in another face, so which FACE
//   drew a line is the width of its ink. The monospace lines are compared to
//   each other for EQUALITY across cards -- an exact instrument -- and to the
//   face's own 1229/2048 advance for identity, so "identical" cannot be
//   satisfied by two cards that are identically wrong.
//
// The width TABLE is read the same way and separately, because it is neither
// the face nor the pitch: two slots in the same face and the same box break
// their lines in different places only if they were measured against
// different tables. That is the mistake the cascade exists to prevent -- a
// site that moves its face site-wide and leaves the table behind gets line
// breaks at the wrong words and no diagnostic at all -- so `metrics` travels
// with `font` and is asserted at all three levels.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  typographyDir,
  configuredDir,
  degradedDir,
  records,
  cardImage,
  moduleWarnings,
  bandPitch,
  expectedPitch,
  lineExtent,
  BACKGROUNDS,
  MONO_EM_RATIO,
  SHIPPED_LINE_HEIGHT,
} from './helpers.js';
import {inkBands} from './lib/raster.js';

// The module level of the typography environment: one face, one width table,
// one line height, named once in [params.ogcard] and repeated by no slot.
const MODULE_LINE_HEIGHT = 1.9;
// What a card template names, overriding the module level for its own slots.
const TEMPLATE_LINE_HEIGHT = 1.1;
// What one slot of one card template names, overriding both.
const SLOT_LINE_HEIGHT = 1.5;
// Every probe slot draws four monospace glyphs a line at this size.
const SIZE = 64;

// The base color a band is measured against defaults to the card's own top
// left pixel, which is the backdrop on every card here except one: the
// degraded build's overlay card carries a badge in that corner, and reading
// the badge as the backdrop would make the whole region one band.
const bandsOf = (dir, path, region, {index = 0, base} = {}) =>
  inkBands(cardImage(dir, records(dir).get(path).cards[index].url), {region, base});

// The boxes a probe template draws in: the upper one from y 40, the lower one
// from y 380 or y 300 depending on the template. UPPER is deliberately tall
// enough to hold three lines at the widest pitch in this build, so a card that
// resolved the wrong level still draws three bands and it is the PITCH that
// fails rather than the count -- which is what makes the failure name the
// level. UPPER_SHORT is for the one template whose second slot starts at y 300
// and would otherwise be read as part of the first.
const UPPER = {x: 0, y: 20, width: 1200, height: 340};
const UPPER_SHORT = {x: 0, y: 20, width: 1200, height: 250};
const LOWER = {x: 0, y: 365, width: 1200, height: 250};
const LOWER_MID = {x: 0, y: 280, width: 1200, height: 300};

// A line of N monospace glyphs, measured against the face's own advance
// rather than against another card. The ink stops one right side bearing short
// of the last full advance, so the extent is compared with the open range
// between N-1 and N advances -- a tolerance that admits any side bearing and
// still excludes every other face in the fixture, which differ from this one
// by a fifth of an em or more.
function assertMonospace(band, glyphs, size, label) {
  const advance = size * MONO_EM_RATIO;
  const extent = lineExtent(band);
  assert.ok(
    extent > advance * (glyphs - 1) && extent <= advance * glyphs,
    `${label}: ${glyphs} glyphs inked ${extent} pixels, outside the monospace ${advance * (glyphs - 1)}..${advance * glyphs}`,
  );
}

test('a face and a line height named once at the module level reach a slot that names neither', () => {
  // The twins section's card template names no typography and neither does
  // its slot, so everything this line was drawn with travelled from
  // [params.ogcard]. The pitch is the module's 1.9 rather than the shipped
  // 1.4, and the ink is the monospace face the module level named.
  const bands = bandsOf(typographyDir, '/twins/twin-a', UPPER);
  assert.equal(bands.length, 3, 'the slot wrapped to three lines');
  assert.equal(
    bandPitch(bands),
    expectedPitch(SIZE, MODULE_LINE_HEIGHT),
    'at the module level line height, not the shipped one',
  );
  assert.notEqual(
    bandPitch(bands),
    expectedPitch(SIZE, SHIPPED_LINE_HEIGHT),
    'and those two are different numbers',
  );
  assertMonospace(bands[0], 4, SIZE, 'the module level face');
});

test('and reaches a second card template, so it is the site rather than one template', () => {
  // The same claim at another size in another template. Without it, a module
  // level that had somehow been copied into one template's own keys would
  // satisfy the assertion above.
  const bands = bandsOf(typographyDir, '/docs/guide', {x: 0, y: 20, width: 1200, height: 300});
  assert.equal(bands.length, 3);
  assert.equal(bandPitch(bands), expectedPitch(48, MODULE_LINE_HEIGHT), 'round(48 * 1.9)');
  assertMonospace(bands[0], 3, 48, 'the module level face in a second template');
});

test('a card template outranks the module level, for both the face and the pitch', () => {
  // The aligned section's template names a face and a line height; its slot
  // names neither. Both of the module level's values are visible in the same
  // card as the two numbers this one is NOT.
  const bands = bandsOf(typographyDir, '/aligned/a', UPPER);
  assert.equal(bands.length, 3);
  assert.equal(bandPitch(bands), expectedPitch(SIZE, TEMPLATE_LINE_HEIGHT), "the template's 1.1");
  assert.notEqual(bandPitch(bands), expectedPitch(SIZE, MODULE_LINE_HEIGHT), 'not the module 1.9');

  const module = bandsOf(typographyDir, '/twins/twin-a', UPPER);
  assert.ok(
    Math.abs(lineExtent(bands[0]) - lineExtent(module[0])) > lineExtent(module[0]) * 0.15,
    `another face than the module level's: ${lineExtent(bands[0])} against ${lineExtent(module[0])}`,
  );
});

test('a text slot outranks its card template, on the same card', () => {
  // Two slots of ONE template: the first takes the template's face and pitch,
  // the second names its own. Reading them off the same picture is what makes
  // this a statement about precedence rather than about two builds.
  const inherited = bandsOf(typographyDir, '/fitting/a', UPPER_SHORT);
  const overriding = bandsOf(typographyDir, '/fitting/a', LOWER_MID);
  assert.equal(inherited.length, 3, 'the inheriting slot wrapped to three lines');
  assert.equal(overriding.length, 3, 'and so did the overriding one');

  assert.equal(bandPitch(inherited), expectedPitch(SIZE, TEMPLATE_LINE_HEIGHT), "the template's");
  assert.equal(bandPitch(overriding), expectedPitch(SIZE, SLOT_LINE_HEIGHT), "the slot's own");

  assertMonospace(overriding[0], 4, SIZE, 'the slot face');
  assert.ok(
    Math.abs(lineExtent(inherited[0]) - lineExtent(overriding[0])) >
      lineExtent(overriding[0]) * 0.15,
    `two faces on one card: ${lineExtent(inherited[0])} against ${lineExtent(overriding[0])}`,
  );
});

test('a monospace line is the same run of ink whichever level named the face', () => {
  // The exact half of the face instrument. Every one of these lines is four
  // glyphs at size 64 in the face SOME level named: the module level on the
  // first two cards -- the second of which overrides the width TABLE and
  // nothing else -- and a slot on the third. A level that resolved to a
  // different face is a different extent, to the pixel.
  const module = lineExtent(bandsOf(typographyDir, '/twins/twin-a', UPPER)[0]);
  const table = lineExtent(bandsOf(typographyDir, '/sources/a', UPPER)[0]);
  const slot = lineExtent(bandsOf(typographyDir, '/fitting/a', LOWER_MID)[0]);
  assert.equal(table, module, 'the metrics card drew the module level face');
  assert.equal(slot, module, 'and so did the slot that named it explicitly');
});

test('the width table travels with the face, at all three levels', () => {
  // Three slots, one face, one 450-pixel box, one string. The only thing that
  // can change how many lines they take is the table each was measured
  // against: the module level's `mono` puts two words on a line, and the
  // `wide` table twice its width puts one. A site that moved its face and
  // left the table behind would break its lines exactly like this, silently.
  const fromModule = bandsOf(typographyDir, '/twins/twin-a', LOWER);
  const fromTemplate = bandsOf(typographyDir, '/sources/a', UPPER);
  const fromSlot = bandsOf(typographyDir, '/sources/a', LOWER);

  assert.equal(fromModule.length, 2, 'the module level table takes two words a line');
  assert.equal(fromTemplate.length, 3, 'the card template table takes one');
  assert.equal(fromSlot.length, 2, 'and the slot puts the module level table back');

  // Same face throughout, so the line counts above are the TABLE and nothing
  // else: the first line of the two-word wraps is nine glyphs and of the
  // one-word wrap is four.
  assertMonospace(fromModule[0], 9, SIZE, 'the module level wrap');
  assertMonospace(fromTemplate[0], 4, SIZE, 'the card template wrap');
  assertMonospace(fromSlot[0], 9, SIZE, 'the slot wrap');
});

test('a bad value at a slot falls back to its card template, warning once', () => {
  // The fallback of a typography key is a LEVEL, not a fixed value: the slot's
  // value is dropped and the card template's applies. A module that fell all
  // the way back to the shipped default would draw 90 pixels apart, and one
  // that ignored the fault would not draw at all.
  const bands = bandsOf(typographyDir, '/overlays/asset-param', UPPER);
  assert.equal(bands.length, 3, 'the card still drew');
  assert.equal(bandPitch(bands), expectedPitch(SIZE, TEMPLATE_LINE_HEIGHT), "the template's 1.1");
  assert.notEqual(
    bandPitch(bands),
    expectedPitch(SIZE, SHIPPED_LINE_HEIGHT),
    'not the shipped 1.4',
  );
  assert.notEqual(bandPitch(bands), expectedPitch(SIZE, MODULE_LINE_HEIGHT), 'not the module 1.9');
});

test('a bad value on a card template falls back to the module level, warning once', () => {
  // Read over the taller region, because the pitch this card must draw at is
  // the module level's: three lines 122 apart reach further down the canvas
  // than the same three at the card template's 70.
  const bands = bandsOf(typographyDir, '/oversize/thing', UPPER);
  assert.equal(bands.length, 3, 'the card still drew');
  assert.equal(bandPitch(bands), expectedPitch(SIZE, MODULE_LINE_HEIGHT), "the module level's 1.9");
  assert.notEqual(
    bandPitch(bands),
    expectedPitch(SIZE, SHIPPED_LINE_HEIGHT),
    'not the shipped 1.4',
  );
});

test('a bad value at the module level falls back to what the module ships', () => {
  // The bottom of the same staircase, and the only level whose fallback is a
  // file rather than a level: the degraded build writes an unusable line
  // height in [params.ogcard], and the slot below neither names one nor
  // belongs to a template that does.
  const bands = bandsOf(
    degradedDir,
    '/deg-overlay/a',
    {x: 60, y: 280, width: 400, height: 220},
    {base: BACKGROUNDS.post},
  );
  assert.equal(bands.length, 2, 'the card still drew, wrapped');
  assert.equal(bandPitch(bands), expectedPitch(SIZE, SHIPPED_LINE_HEIGHT), 'at the shipped 1.4');
});

test('the typography build says exactly the two things it was built to say', () => {
  // The build carries two deliberate faults and no other configuration
  // mistake, so its whole diagnostic output is assertable line for line. That
  // is what makes every positive assertion above trustworthy in a build the
  // runner does not gate on silence -- and it is also the "warns ONCE" half of
  // the two assertions above, which a per-page or per-slot repetition would
  // fail here rather than nowhere.
  // Sorted before comparing: the two faults live in different sections, whose
  // pages render concurrently, so which line prints first is a race the
  // module does not promise -- observed both ways across otherwise identical
  // builds. Sorting keeps the count and the exact text assertable while
  // dropping only the inter-page order.
  const lines = moduleWarnings('typography').map((line) => line.replace(/^\[og-image\] /, ''));
  assert.deepEqual([...lines].sort(), [
    'Ignoring the line_height value "nope" set in text slot 0 of card template "tbadslot" (expected a number written as a plain decimal). That level\'s value is dropped, so the level below it applies.',
    'Ignoring the line_height value "wobbly" set in card template "tbadtpl" (expected a number written as a plain decimal). That level\'s value is dropped, so the level below it applies.',
  ]);
});

// The other end of the cascade, in the build whose module level names none of
// the nine keys. The `unstyled` template's slots name none either, so what
// they draw with is what the module SHIPS and nothing else.
const UNSTYLED_MONO = {x: 0, y: 20, width: 1200, height: 100};
const UNSTYLED_UNSET = {x: 0, y: 120, width: 1200, height: 100};
const UNSTYLED_EMPTY = {x: 0, y: 220, width: 1200, height: 100};
const UNSTYLED_WRAP = {x: 0, y: 400, width: 1200, height: 230};

test('a slot naming none of the nine anywhere still draws, in Hugo own built-in face', () => {
  // The module ships no font and must not invent one, so an unset face is
  // Hugo's decision rather than the module's. The three rows are the same
  // eight glyphs at the same size: the first names the monospace face, the
  // second names nothing at all, and the third names the empty string, which
  // the module documents as the same statement. The last two must ink
  // identically to the pixel and both must differ from the first.
  const mono = bandsOf(configuredDir, '/unstyled', UNSTYLED_MONO);
  const unset = bandsOf(configuredDir, '/unstyled', UNSTYLED_UNSET);
  const empty = bandsOf(configuredDir, '/unstyled', UNSTYLED_EMPTY);
  for (const [name, bands] of [
    ['mono', mono],
    ['unset', unset],
    ['empty', empty],
  ]) {
    assert.equal(bands.length, 1, `the ${name} row drew one line`);
  }
  assertMonospace(mono[0], 8, 48, 'the row that named the face');
  assert.equal(
    lineExtent(unset[0]),
    lineExtent(empty[0]),
    'an unset face and an explicitly empty one are the same statement',
  );
  assert.equal(unset[0].pixels, empty[0].pixels, 'to the ink pixel');
  assert.ok(
    Math.abs(lineExtent(unset[0]) - lineExtent(mono[0])) > lineExtent(mono[0]) * 0.1,
    `and neither is the monospace face: ${lineExtent(unset[0])} against ${lineExtent(mono[0])}`,
  );
});

test('and at the line height the module ships, which is the only number it ships', () => {
  // The shipped 1.4 is reached only from a build whose module level names no
  // line height, which is why this half lives in `configured` rather than in
  // the typography build.
  const bands = bandsOf(configuredDir, '/unstyled', UNSTYLED_WRAP);
  assert.equal(bands.length, 3, 'the slot wrapped against the shipped nominal width table');
  assert.equal(bandPitch(bands), expectedPitch(40, SHIPPED_LINE_HEIGHT), 'round(40 * 1.4)');
});

test('the module level itself is still resolved through Hugo four tiers', () => {
  // The three levels sit ON TOP of the four-tier cascade rather than beside
  // it: unstyled/a.md names a line height in its own front matter and its
  // sibling section page names none, so one card draws at the page's value and
  // the other at the shipped one, from the same template and the same slot.
  const fromPage = bandsOf(configuredDir, '/unstyled/a', UNSTYLED_WRAP);
  const shipped = bandsOf(configuredDir, '/unstyled', UNSTYLED_WRAP);
  assert.equal(fromPage.length, 3);
  assert.equal(bandPitch(fromPage), expectedPitch(40, 2.0), 'the front matter tier answered');
  assert.notEqual(
    bandPitch(fromPage),
    bandPitch(shipped),
    'and its sibling drew at the shipped 1.4',
  );
});
