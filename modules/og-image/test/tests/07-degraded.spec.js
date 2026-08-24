// Every fault class at once, and the two things that only their being together
// can show: each mistake gets its OWN diagnostic, and none of them masks
// another. A suite that provoked one fault per build would pass with a
// deduplication key that collapsed half of them, because whichever one it kept
// would be the only one there.
//
// The build exits 0. That is the module's central promise -- it never breaks a
// consuming site's build over an image -- so each fault is asserted twice
// here: the diagnostic it emits, and the pixel-side consequence beside it,
// which is either a card still drawn or a page cleanly declined.
//
// The counting is by fault CLASS and again by LOG LINE, and the second one is
// the sharper instrument. Deduplicating a warning means reading a sentinel and
// then writing it, which is two operations while Hugo renders pages
// concurrently: several pages can pass the read before any of them writes, and
// the mistake then prints once per racer. That failure is invisible to a
// class count -- every class is still present -- and shows up only as a line
// count that drifts between otherwise identical builds. Asserting one line per
// fault pins the deduplication itself, not merely its coverage.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {degradedDir, records, cardImage, moduleWarnings, BADGE, MONO_EM_RATIO} from './helpers.js';
import {inkBands, inkColor, countColor, colorBounds, hex} from './lib/raster.js';

// One entry per deliberate fault in config/degraded/. Each pattern must match
// at least one warning, every warning must match some pattern, and the two
// counts must agree -- which is what "N faults, N diagnostics, none masked"
// reduces to.
const FAULTS = [
  ['module format', /^Unknown ogcard\.format value "gif"/],
  ['module quality', /^Ignoring ogcard\.quality value "400"/],
  ['module anchor', /^Unknown ogcard\.anchor value "middle"/],
  // A typography key is the one class whose fallback is a LEVEL rather than a
  // fixed value, and the module level is the only one whose level below is the
  // shipped data file. tests/17-typography.spec.js reads the pitch it fell
  // back to; this is the diagnostic beside it.
  [
    'module typography: unusable line height',
    /^Ignoring the line_height value "wobbly" set in params\.ogcard for language "en"/,
  ],

  [
    'route: unknown template from a section',
    /^ogcard\.sections\.deg-ghost names the card template "ghostsection"/,
  ],
  [
    'route: unknown template from a kind',
    /^ogcard\.kinds\.taxonomy names the card template "ghostkind"/,
  ],
  ['route: unknown template from front matter', /^ogcard\.template names the card template "otf"/],

  ['background: path names nothing', /^The card background "og\/nope\.png" was not found/],
  [
    'background: path the operating system refuses',
    /^The card background "og\/\*\.png" was not found/,
  ],
  [
    'background: bytes are not an image',
    /^The card background "og\/not-an-image\.png" carries no image/,
  ],
  ['background: template defines none', /^Card template "emptybg" defines no background/],

  ['font: name not registered', /^No font named "ghostface" is registered/],
  [
    'font: registered path names nothing',
    /^The font "fonts\/DoesNotExist\.ttf" registered as "missing" was not found/,
  ],
  [
    'font: registered path the operating system refuses',
    /^The font "fonts\/\*\.ttf" registered as "odd" was not found/,
  ],
  [
    'font: rejected format',
    /^The font "fonts\/webfont\.woff2" registered as "web" is not a TrueType/,
  ],
  ['font: bytes are not a font', /^A font used by card template "badfont" could not be read/],

  ['slot: unreadable color', /^Ignoring the color value "rebeccapurple" on text slot 0/],
  ['slot: unparseable size', /^Ignoring the size value "abc" on text slot 1/],
  ['slot: unparseable x', /^Ignoring the x value "left" on text slot 2/],
  [
    'slot: unparseable safety',
    /^Ignoring the safety value "lots" set in text slot 3 of card template "badslots"/,
  ],
  ['slot: unknown align', /^Unknown align value "middle" on text slot 4/],
  ['slot: unknown case', /^Unknown card text case "camel"/],
  [
    'slot: unknown overflow',
    /^Unknown overflow value "clip" set in text slot 6 of card template "badslots"/,
  ],
  ['slot: unknown source token', /^Unknown card text source "autor"/],
  [
    'slot: parameter holding a table',
    /^The card text slot in template "badslots" reads the page parameter "contact", which holds a table rather than a value a slot can draw/,
  ],
  [
    'slot: data key holding a table',
    /^The card text slot in template "badslots" reads the data key "facts\.values\.identity", which holds a table rather than a value a slot can draw/,
  ],
  [
    'slot: data list with a table inside',
    /^The card text slot in template "badslots" reads the data key "facts\.values\.identity\.links", which holds a list with a table or a list inside it/,
  ],
  ['slot: unknown metrics table', /^No metrics table named "nosuch"/],
  [
    'slot: float knob too large for a float64',
    /^Ignoring the width_factor value "9{300,}" set in text slot 14 of card template "badslots"/,
  ],

  // Every level of a hand-written width table. A wrong shape at any of them
  // raises inside `range` or `index`, so each of these is a build the module
  // would otherwise have stopped rather than a card it drew coarsely.
  [
    'metrics: named table is not a table',
    /^Ignoring the width table "scalartable" in data\/og-image\/metrics-local/,
  ],
  ['metrics: and no table of that name is found', /^No metrics table named "scalartable"/],
  ['metrics: classes is not a list', /^Ignoring the classes key of the width table "badclasses"/],
  ['metrics: glyphs is not a table', /^Ignoring the glyphs key of the width table "badglyphs"/],
  [
    'metrics: a classes entry names no characters',
    /^Ignoring entry 0 of the classes list in the width table "badclassentry"/,
  ],

  ['overlay: path names nothing', /^The overlay "og\/nope-overlay\.png" .* was not found/],
  [
    'overlay: path the operating system refuses',
    /^The overlay "og\/\*\.png" .* was not found under assets\//,
  ],
  ['overlay: bytes are not an image', /^The overlay "og\/not-an-image\.png" .* carries no image/],
  ['overlay: unknown source token', /^Unknown overlay source "bundle"/],
  ['overlay: no src at all', /^Overlay 3 of card template "badoverlay" names no image/],
  [
    'overlay: no key at all',
    /^Overlay 9 of card template "badoverlay" names no image: an overlay reading from a page parameter/,
  ],
  [
    'overlay: no match at all',
    /^Overlay 10 of card template "badoverlay" names no image: an overlay reading from the page's own resources/,
  ],
  [
    'overlay: a pattern Hugo cannot match with',
    /^The overlay pattern "cover-\[1\.png" in card template "badoverlay"/,
  ],
  ['overlay: unknown anchor', /^Unknown overlay anchor "northeast"/],
  ['overlay: unparseable width', /^Ignoring the width value "wide" on overlay 5/],
  ['overlay: unparseable opacity', /^Ignoring the opacity value "half" on overlay 6/],
  [
    'overlay: opacity too large for a float64',
    /^Ignoring the opacity value "9{300,}" on overlay 11/,
  ],

  // The data source on the overlay side. The key and the value are both the
  // site's own, so unlike param there is no silent page-absence class: every
  // fault warns, and each drops only its own overlay.
  [
    'overlay data: entry names no key',
    /^Overlay 12 of card template "badoverlay" names no image: an overlay reading from a data file/,
  ],
  [
    'overlay data: key names no value',
    /^Overlay 13 of card template "badoverlay" reads the data key "facts\.values\.identity\.name\.deeper", which names no value in data\//,
  ],
  [
    'overlay data: value is a list of tables',
    /^Overlay 14 of card template "badoverlay" reads the data key "facts\.values\.identity\.links", which holds a table or a list rather than a path/,
  ],
  [
    'overlay data: path names nothing',
    /^The overlay "og\/data-nowhere\.png" named in data\/ by card template "badoverlay" was not found in the page's resources or under assets\//,
  ],

  [
    'text array: an entry that is not a table',
    /^Ignoring entry 0 of the text of card template "badentry"/,
  ],
  ['text array: written as a bare scalar', /^Ignoring the text of card template "badwhole"/],

  // The background SOURCE form. Its faults divide the same way the overlay's
  // do -- by who made the mistake -- with one class the overlay does not have:
  // a page that carries no image is silent for an overlay and, for the raster
  // the whole card stands on, either takes a fallback or is worth saying.
  [
    'background source: nothing on the page matches, and no fallback',
    /^Card template "bgabsent" reads its background from the page itself.* so they get no card/,
  ],
  [
    'background source: a pattern Hugo cannot match with, rescued by the fallback',
    /^The background pattern "cover-\[1\.png" in card template "bgbadmatch" .* are carded on its fallback "og\/post-bg\.png" instead/,
  ],
  [
    'background source: a source naming no locator',
    /^The background of card template "bgnolocator" reads from resource and needs a match pattern/,
  ],
  ['background source: unknown token', /^Unknown card background source "bundle"/],
  // Two faults from one template, which is the only shape that shows the
  // primary's diagnostic and the fallback's are separate sentinels.
  [
    'background source: the declared fallback names nothing',
    /^The background fallback "og\/nope-fallback\.png" of card template "bgbadfb" was not found/,
  ],
  [
    'background source: and the page it was to rescue says so too',
    /^Card template "bgbadfb" reads its background from the page itself/,
  ],
  [
    'background source: a fallback that is a list rather than a path',
    /^The background fallback of card template "bgfbshape" is a table, a list or a boolean/,
  ],
  [
    'background source: and that page is uncarded in consequence',
    /^Card template "bgfbshape" reads its background from the page itself/,
  ],

  // The data source's background faults. None declares a fallback, so each
  // warns AND declines its pages, which 19-background-source.spec.js reads on
  // the pixel side.
  [
    'background data: entry names no key',
    /^The background of card template "bgdatanokey" reads from data and needs a key naming the value that holds its path/,
  ],
  [
    'background data: key names no value',
    /^The background of card template "bgdatanovalue" reads the data key "facts\.values\.identity\.nickname", which names no value in data\//,
  ],
  [
    'background data: value is a table',
    /^The background of card template "bgdatabadvalue" reads the data key "facts\.values\.identity", which holds a table or a list rather than a path/,
  ],
  [
    'background data: path names nothing',
    /^The card background "og\/data-nowhere\.png" named in data\/ was not found in the page's resources or under assets\//,
  ],
];

const strip = (line) => line.replace(/^\[og-image\] /, '');

test('the build survived every fault at once', () => {
  // The runner already fails on an ERROR line or a non-zero exit; the cards
  // below are the positive half, and the tree existing at all is the rest.
  const all = records(degradedDir);
  assert.ok(all.size > 40, `the whole site still built: ${all.size} pages`);
});

test('each fault produced its own diagnostic', () => {
  const lines = moduleWarnings('degraded').map(strip);
  assert.ok(lines.length > 0, 'the degraded build warns about something');
  for (const [name, pattern] of FAULTS) {
    assert.ok(
      lines.some((line) => pattern.test(line)),
      `no diagnostic for ${name}`,
    );
  }
});

test('and no fault produced a diagnostic that is not one of them', () => {
  // The half that keeps the list above honest: a new warning the module starts
  // emitting has to be named here rather than absorbed silently, and a
  // diagnostic that changed wording fails as an unmatched line rather than as
  // a quietly missing assertion.
  const lines = moduleWarnings('degraded').map(strip);
  const unmatched = lines.filter((line) => !FAULTS.some(([, pattern]) => pattern.test(line)));
  assert.deepEqual([...new Set(unmatched)], [], 'warnings the fault list does not account for');
});

test('the number of distinct diagnostics equals the number of faults', () => {
  // Not implied by the two assertions above: without this, two faults sharing
  // one deduplication key would still satisfy both -- every pattern matched,
  // no line unmatched -- while one of the two mistakes went unreported.
  const lines = moduleWarnings('degraded').map(strip);
  const classes = new Set();
  for (const line of lines)
    for (const [name, pattern] of FAULTS) if (pattern.test(line)) classes.add(name);
  assert.equal(classes.size, FAULTS.length);
});

test('and each of them was reported exactly once, not once per page that hit it', () => {
  // The assertion the three above cannot make between them: they all pass when
  // one fault prints six times, because every pattern is still matched, no
  // line is unaccounted for, and every class is present. A count that equals
  // the fault list is what says the deduplication held, and it is the only one
  // here that a broken sentinel turns red -- non-deterministically, since the
  // surplus lines come from a race, which is why it names the offenders.
  const lines = moduleWarnings('degraded').map(strip);
  const seen = new Map();
  for (const line of lines) seen.set(line, (seen.get(line) ?? 0) + 1);
  assert.deepEqual(
    [...seen].filter(([, n]) => n > 1),
    [],
    'diagnostics emitted more than once',
  );
  assert.equal(lines.length, FAULTS.length, `${lines.length} lines for ${FAULTS.length} faults`);
});

test('an unreadable color still draws the card, in the white Hugo falls back to', () => {
  // Hugo accepts a color it cannot parse and draws white without saying
  // anything, so the warning is the only diagnostic that exists and the white
  // ink is what a consumer would otherwise discover on a social platform.
  const rec = records(degradedDir).get('/deg-slots/a');
  assert.equal(rec.cards.length, 1, 'the card was still produced');
  const img = cardImage(degradedDir, rec.cards[0].url);
  const region = {x: 60, y: 40, width: 1050, height: 90};
  assert.equal(inkBands(img, {region}).length, 1, 'the slot drew its line');
  assert.equal(
    hex(inkColor(img, {region})),
    '#ffffff',
    'in Hugo`s own default, not a module fallback',
  );
});

test('a font file that is not a font costs the face, not the card', () => {
  // The whole filter chain fails at the images.Filter call rather than at
  // construction or at publication, so only the try net can catch it. The
  // retry then redraws every slot with the font key removed: the words survive
  // in a fallback face, which the much wider ink run of a proportional face
  // shows.
  const rec = records(degradedDir).get('/deg-badfont/a');
  assert.equal(rec.cards.length, 1, 'the page kept its card');
  const img = cardImage(degradedDir, rec.cards[0].url);
  const region = {x: 60, y: 100, width: 1050, height: 300};
  const bands = inkBands(img, {region});
  assert.equal(bands.length, 1);
  const advance = (bands[0].right - 72 + 1) / rec.title.length;
  const mono = 64 * MONO_EM_RATIO;
  assert.ok(
    advance > mono * 1.1,
    `drawn in another face: ${advance} per glyph against the monospace ${mono}`,
  );
});

test('a background fault declines the whole card; an overlay fault drops one overlay', () => {
  // The difference between a backdrop and a badge. A card is composed ON a
  // raster, so a background that cannot be read leaves nothing to compose on;
  // an overlay that cannot be read leaves a card that is merely missing a
  // logo, which is far better than no card.
  const all = records(degradedDir);
  // The last of these is routed by KIND rather than by section, and its
  // background is a path the operating system refuses to look up at all:
  // resources.Get raises on it instead of returning nil, so an uncaught raise
  // here would be the whole build rather than one card.
  for (const path of ['/deg-missingbg/a', '/deg-textbg/a', '/deg-nobgkey/a', '/tags/alpha']) {
    assert.deepEqual(all.get(path).cards, [], `${path} declined`);
  }
  assert.equal(all.get('/deg-overlay/a').cards.length, 1, 'the overlay page kept its card');
});

test('the overlays that survived are exactly the four that named a usable image', () => {
  // Twelve of the sixteen overlays are dropped, each for its own reason. The
  // four that remain are placed by the anchors they name -- one at the top
  // left corner from the rejected anchor's fallback, one at the bottom left,
  // one at the top right, one at the bottom right -- so the count and the
  // bounding box together say that the right twelve were dropped rather than
  // merely that twelve were. Two of the four carry a value the module
  // rejected (a width and an opacity) and are drawn at their own size, fully
  // opaque, which is what those two fallbacks promise.
  const rec = records(degradedDir).get('/deg-overlay/a');
  const img = cardImage(degradedDir, rec.cards[0].url);
  assert.equal(countColor(img, BADGE), 4 * 80 * 80, 'four badges, none of them resized or faded');
  const bounds = colorBounds(img, BADGE);
  assert.deepEqual(
    {left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom},
    {left: 0, right: 1179, top: 0, bottom: 609},
    'the four corners each named, at the offsets each named',
  );
});

test('a text array Go could not range over would have stopped the build; here it declines', () => {
  // A `text` key written as a bare scalar is the shape that aborts template
  // execution outright, which would take a consuming site's whole build down.
  // Both spellings survive as a warning plus a page with no card.
  const all = records(degradedDir);
  assert.deepEqual(all.get('/deg-badentry/a').cards, []);
  assert.deepEqual(all.get('/deg-badwhole/a').cards, []);
});

test('rejected module-level values fall back to the shipped mechanical ones', () => {
  // The resolved options say which value survived. An unknown format falls to
  // png, an out-of-range quality to 75 and an unknown anchor to Center, and
  // every card in the tree is encoded accordingly.
  const rec = records(degradedDir).get('/deg-slots/a');
  assert.equal(rec.opts.format, 'png');
  assert.equal(rec.opts.quality, 75);
  assert.equal(rec.opts.anchor, 'Center');
  assert.ok(rec.cards[0].url.endsWith('.png'));
  assert.equal(rec.cards[0].mediaType, 'image/png');
});
