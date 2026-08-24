// WHERE a slot's text comes from, and what happens to it on the way.
//
// Eleven source tokens, four case transforms and a prefix/suffix pair are the
// whole of a slot's vocabulary, and every one of them resolves to a string a
// card draws. Two of them -- title and description -- are what the caller
// handed in and are read in tests/03-text.spec.js; the other nine are read
// out of the page, the site, the clock and the data directory, and this is
// where they are drawn.
//
// The card is one row per source in a monospace face at a constant advance, so
// a row's ink extent divided by that advance is a character count and the
// NUMBER of rows is the count of sources that resolved to anything at all.
// The row that reads a parameter no page carries draws nothing, prefix and
// suffix included, which is what makes twelve rows rather than thirteen the
// statement that a prefix glues only to a value that exists.
//
// The case rows are read by ink rather than by width: 'anon crux' has no
// letter reaching above the x-height and 'ANON CRUX' is all caps, so the
// distance from a row's configured y to the top of its ink says which of the
// two was drawn, and the amount of ink separates 'Anon Crux' from both.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, records, cardImage, MONO_EM_RATIO, SHIPPED_LINE_HEIGHT} from './helpers.js';
import {inkBands, charsOn} from './lib/raster.js';

// The sources template: every row at x = 72, size 28, the first at y = 16 and
// one every 44 pixels after it. Row 8 draws nothing, so the bands are the
// other twelve rows in order.
const ROW = {x: 72, size: 28, top: 16, pitch: 44};
const ADVANCE = ROW.size * MONO_EM_RATIO;
const rowY = (index) => ROW.top + index * ROW.pitch;

const bandsOf = (all, path) => inkBands(cardImage(configuredDir, all.get(path).cards[0].url));
const glyphs = (band) => charsOn(band, {anchorX: ROW.x, advance: ADVANCE});

// Row index -> the string that row must draw on /sources/a. The slot that
// reads `nosuchparam` is absent from this list because it draws nothing.
const DRAWN = [
  [0, 'sources', 'the section the page is in'],
  [1, 'Sourcebook', "the section page's link title"],
  [2, 'page', "the page's kind"],
  [3, 'OG Image Fixture', "the site's title"],
  [4, 'og-fixture.example', "the host of the site's base URL"],
  [5, '2019-03-04', "the page's date under the layout the slot named"],
  [6, '<<mid>>', 'a literal with a prefix and a suffix glued to it'],
  [7, 'mid', 'the same literal without them'],
  [9, 'anon crux', 'a literal drawn as written'],
  [10, 'ANON CRUX', 'the same literal upper-cased'],
  [11, 'anon crux', 'a capitalized literal lower-cased'],
  [12, 'Anon Crux', 'a literal title-cased'],
];

test('every text source resolves to the string it names, and an absent one draws nothing', () => {
  const bands = bandsOf(records(configuredDir), '/sources/a');
  assert.equal(bands.length, DRAWN.length, 'one band per row that resolved to something');
  DRAWN.forEach(([index, text, why], position) => {
    const band = bands[position];
    assert.ok(
      band.top >= rowY(index) && band.top < rowY(index) + ROW.pitch,
      `row ${index} (${why}) drew inside its own row: ink top ${band.top} against y ${rowY(index)}`,
    );
    assert.equal(glyphs(band), text.length, `row ${index} (${why}) drew ${JSON.stringify(text)}`);
    assert.ok(band.left >= ROW.x, `row ${index} starts at the left edge of the slot`);
  });
});

test('the kind slot draws the kind of the page it was composed for', () => {
  // The section page and the page inside it share one template and differ in
  // exactly one resolved value, so a `kind` slot reading a constant -- or
  // reading the rendering page rather than the carded one -- shows up here and
  // nowhere else. Their `section` and `section_title` rows agree, which is
  // what says only the kind moved.
  const all = records(configuredDir);
  const page = bandsOf(all, '/sources/a');
  const section = bandsOf(all, '/sources');
  assert.equal(glyphs(page[2]), 'page'.length);
  assert.equal(glyphs(section[2]), 'section'.length);
  assert.equal(glyphs(section[0]), 'sources'.length, 'the same section either way');
  assert.equal(glyphs(section[1]), 'Sourcebook'.length, 'and the same section title');
});

test('a case transform is visible in the ink, not only in the width', () => {
  // Every one of these four rows is nine characters wide, so a glyph count
  // cannot tell them apart at all. 'anon crux' has no ascender, so its ink
  // starts lower in the row than a capital's; and 'Anon Crux' carries two
  // capitals, so it inks more than the lower-case row and less than the
  // upper-case one. Together the two measurements pin all four transforms:
  // any transform doing nothing, or doing another one's job, moves one of
  // them onto another's numbers.
  const bands = bandsOf(records(configuredDir), '/sources/a');
  const [plain, upper, lower, titled] = bands.slice(8);
  const offset = (band, index) => band.top - rowY(index);

  assert.equal(offset(lower, 11), offset(plain, 9), 'lower-cased text sits on the x-height');
  assert.equal(lower.pixels, plain.pixels, 'and inks exactly as much as the same text drawn plain');
  assert.ok(
    offset(upper, 10) < offset(plain, 9),
    `upper-cased text reaches the cap height: ${offset(upper, 10)} against ${offset(plain, 9)}`,
  );
  assert.ok(offset(titled, 12) < offset(plain, 9), 'title-cased text reaches the cap height too');
  assert.ok(
    plain.pixels < titled.pixels && titled.pixels < upper.pixels,
    `two capitals ink more than none and less than nine: ${plain.pixels}, ${titled.pixels}, ${upper.pixels}`,
  );
});

// The datafacts template on /facts/a: the `data` rows on the same monospace
// terms, plus the one `param` row that proves a flat front-matter list draws
// by the same rule. The two list rows draw TWO lines each at the shipped
// pitch of round(28 * 1.4) = 39, which is why the template hands each of them
// an 88-pixel window where a scalar row gets 44. The two rows that resolve to
// nothing carry a prefix and a suffix, so the band count doubling as the row
// count is also the statement that the glue dropped with the value.
const FACTS_PITCH = Math.round(ROW.size * SHIPPED_LINE_HEIGHT);
const FACTS = [
  {y: 16, lines: ['anon crux'], why: 'a string three segments into data/'},
  {y: 60, lines: ['2019'], why: 'a number drawn as its digits'},
  {y: 104, lines: ['first role', 'second line'], why: 'a flat data list, one item per line'},
  {y: 192, lines: ['alpha row', 'beta'], why: 'a flat front-matter list through param'},
  {y: 280, lines: [], why: 'a key no data file carries'},
  {y: 324, lines: [], why: 'a dotted path that runs through a scalar'},
];

test('a data slot draws what its key names, a flat list one item per line, an absent path nothing', () => {
  const bands = bandsOf(records(configuredDir), '/facts/a');
  const expected = FACTS.flatMap(({y, lines, why}) =>
    lines.map((text, line) => ({top: y + line * FACTS_PITCH, text, why})),
  );
  assert.equal(bands.length, expected.length, 'one band per line that resolved to something');
  expected.forEach(({top, text, why}, position) => {
    const band = bands[position];
    assert.ok(
      band.top >= top && band.top < top + FACTS_PITCH,
      `${why}: ink top ${band.top} against line top ${top}`,
    );
    assert.equal(glyphs(band), text.length, `${why}: drew ${JSON.stringify(text)}`);
    assert.ok(band.left >= ROW.x, `${why}: starts at the left edge of the slot`);
  });
});

test('a list in an unwrapped slot draws at the resolved line pitch, not at images.Text spacing', () => {
  // Both lines of each list start with an ascender-height glyph, so the two
  // ink tops sit at the same offset inside their lines and their distance IS
  // the pitch the module drew at. Handing the joined string to images.Text
  // instead would space the lines by its own default, which at this size is a
  // different number -- that regression moves the second band out of this
  // assertion before it moves anything else.
  const bands = bandsOf(records(configuredDir), '/facts/a');
  assert.equal(bands[3].top - bands[2].top, FACTS_PITCH, 'the data list');
  assert.equal(bands[5].top - bands[4].top, FACTS_PITCH, 'the param list');
});

test('the section sources are empty on the home page and drawn everywhere else', () => {
  // ONE template, two pages. Hugo hands back the home page itself for its own
  // .CurrentSection, so a section_title slot reading it draws the site's own
  // title where the module promises nothing at all -- the title twice on the
  // one card that can least afford it. The blog page asking for the same
  // template is what says the two probe rows work at all, rather than being
  // two slots that never draw anywhere.
  const all = records(configuredDir);
  const probe = {x: 0, y: 410, width: 1200, height: 220};
  const home = inkBands(cardImage(configuredDir, all.get('/').cards[0].url), {region: probe});
  assert.deepEqual(home, [], 'the home card draws neither its section nor its section title');

  const variant = all.get('/blog/variant');
  assert.equal(variant.cards[1].variant, 'alt', 'the second card is the one on the home template');
  const away = inkBands(cardImage(configuredDir, variant.cards[1].url), {region: probe});
  assert.equal(away.length, 2, 'a page that IS in a section draws both rows');
  assert.equal(glyphs(away[0]), 'blog'.length, 'the section');
  assert.equal(glyphs(away[1]), 'Blog'.length, 'and the section title');
});
