// Three defects a single-language build cannot see.
//
// The first is a configuration read through the RENDERING language instead of
// through the page's own. Inside a page's own render the two are the same
// language, so the difference only exists when a card is composed for a page
// of one language while another is rendering -- which the fixture's home page
// does deliberately, under a variant no other caller uses so that no memoized
// card can answer for it. The two languages carry different background
// rasters, so the answer is a corner pixel.
//
// The second is a deduplication key that names only the fault class: both
// languages configure a color Hugo cannot read, and the two values differ, so
// a key that dropped the value would report whichever language rendered first
// and say nothing about the other.
//
// The third is where derivatives are published. They share one site-root
// directory rather than being copied per language, and a page whose content
// differs between languages must get a card of its own rather than its
// translation's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  multilingualDir,
  records,
  crossLanguage,
  cardImage,
  cardExists,
  moduleWarnings,
  BACKGROUNDS,
  TITLE_REGION,
  TITLE_BOX,
  MONO_EM_RATIO,
} from './helpers.js';
import {pixel, hex, inkBands, charsOn} from './lib/raster.js';

const corner = (dir, url) => hex(pixel(cardImage(dir, url), 0, 0));

test('each language composited its own configured background', () => {
  const en = records(multilingualDir, 'en');
  const de = records(multilingualDir, 'de');
  assert.equal(corner(multilingualDir, en.get('/blog/short').cards[0].url), hex(BACKGROUNDS.post));
  assert.equal(
    corner(multilingualDir, de.get('/blog/short').cards[0].url),
    hex(BACKGROUNDS.german),
  );
});

test('a card composed while ANOTHER language is rendering still reads its own language', () => {
  // The lock. The English home page composes every German page's card under a
  // variant nothing else uses, so this composition definitely happened with
  // English as the rendering language. A configuration read through the global
  // site would hand it the English template and the English backdrop.
  const foreign = crossLanguage(multilingualDir, 'en').filter((p) => p.lang === 'de');
  const carded = foreign.filter((p) => p.cards.length > 0);
  assert.ok(
    carded.length >= 3,
    `German pages were composed from the English render: ${carded.length}`,
  );
  for (const page of carded) {
    if (page.path === '/') continue; // the home template is not one the German language overrides
    assert.equal(
      corner(multilingualDir, page.cards[0].url),
      hex(BACKGROUNDS.german),
      `${page.path}: composed with the German configuration, not the rendering language's`,
    );
    assert.equal(page.cards[0].width, 1200);
    assert.equal(page.cards[0].height, 630);
  }
});

test('a language that overrides only part of the table inherits the rest', () => {
  // The German language sets a background and a slot and nothing else, so its
  // canvas size, its format and its routing all come from the root table. The
  // home template it never mentions is the root's, which is why its home card
  // sits on the English home backdrop.
  const de = records(multilingualDir, 'de');
  const blog = de.get('/blog/short');
  assert.equal(blog.opts.width, 1200, 'canvas size from the root table');
  assert.equal(blog.opts.height, 630);
  assert.equal(blog.opts.format, 'png');
  assert.equal(blog.cards[0].mediaType, 'image/png');
  assert.equal(
    corner(multilingualDir, de.get('/').cards[0].url),
    hex(BACKGROUNDS.home),
    'the home template it does not override is the root one',
  );
});

test('translations whose content differs get cards of their own', () => {
  const en = records(multilingualDir, 'en');
  const de = records(multilingualDir, 'de');
  const enCard = en.get('/blog/short').cards[0].url;
  const deCard = de.get('/blog/short').cards[0].url;
  assert.notEqual(enCard, deCard, 'the same page in two languages, two cards');
  assert.ok(cardExists(multilingualDir, enCard));
  assert.ok(cardExists(multilingualDir, deCard));

  // And the German card really carries the German words: the face is the same
  // monospace one, so the glyph count is read the same way.
  const advance = TITLE_BOX.size * MONO_EM_RATIO;
  const rec = de.get('/blog/short');
  const bands = inkBands(cardImage(multilingualDir, deCard), {region: TITLE_REGION});
  assert.equal(bands.length, 1);
  assert.equal(charsOn(bands[0], {anchorX: TITLE_BOX.x, advance}), rec.title.length);
});

test('derivatives are published once, at the site root, not copied per language', () => {
  // Both languages address their cards through the same directory. A per
  // language copy would double every card a site publishes, and a URL carrying
  // a language prefix would break the moment a translation shares a card with
  // its original.
  for (const lang of ['en', 'de']) {
    for (const [path, rec] of records(multilingualDir, lang)) {
      for (const card of rec.cards) {
        assert.ok(card.url.startsWith('/og/'), `${lang} ${path}: ${card.url}`);
        assert.ok(cardExists(multilingualDir, card.url), `${lang} ${path}: no file at ${card.url}`);
      }
    }
  }
});

test('two languages carrying two different bad values are both reported', () => {
  // A build-scoped sentinel keyed by fault class alone would report one of
  // these and mask the other, and the masked language would ship cards of
  // invisible text with nothing said about it.
  const lines = moduleWarnings('multilingual');
  for (const value of ['#gg0000', '#hh0000']) {
    assert.ok(
      lines.some((line) => line.includes(`color value "${value}"`)),
      `the ${value} language was reported`,
    );
  }
  const unmatched = lines.filter((line) => !/color value "#(gg|hh)0000"/.test(line));
  assert.deepEqual(
    [...new Set(unmatched)],
    [],
    'this build carries only the two colors it exists to prove',
  );
});
