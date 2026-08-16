// What a card IS: a file at the URL the module published, carrying the format
// and the exact pixel dimensions the configuration asked for.
//
// The dimensions are read from the file header, never from the Resource's own
// .Width and .Height. A module that RETURNS 1200x630 and DRAWS 1200x628
// satisfies every consumer-side check, every markup assertion and every
// structured-data assertion, and fails only here. The two are then compared to
// each other, so a Resource that disagrees with its own bytes is caught as
// well.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, records, cardBytes, cardExists, moduleWarnings} from './helpers.js';
import {sniff} from './lib/raster.js';

const CARD_BEARING_PAGES = 46;
const CARDS_PUBLISHED = 47;
const MEDIA_TYPES = {png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp'};

test('every card the module returned is a real file of the configured size', () => {
  const all = records(configuredDir);
  let seen = 0;
  for (const [path, rec] of all) {
    for (const card of rec.cards) {
      seen += 1;
      assert.ok(cardExists(configuredDir, card.url), `${path}: no file at ${card.url}`);
      const head = sniff(cardBytes(configuredDir, card.url));
      assert.equal(head.width, 1200, `${path} ${card.url}: drawn width`);
      assert.equal(head.height, 630, `${path} ${card.url}: drawn height`);
      // The Resource agrees with its own bytes, which is what a consumer
      // writing og:image:width publishes.
      assert.equal(card.width, head.width, `${path}: the Resource's width matches the raster`);
      assert.equal(card.height, head.height, `${path}: the Resource's height matches the raster`);
      assert.equal(
        card.mediaType,
        MEDIA_TYPES[head.format],
        `${path}: media type agrees with the encoded bytes`,
      );
    }
  }
  assert.equal(seen, CARDS_PUBLISHED, 'cards published across the tree');
});

test('the card-bearing page count is exact, never a floor', () => {
  // A floor waves through a regression that costs whole classes of page:
  // narrowing the routing tier to regular pages alone costs the home page and
  // every section index and nothing else, and a floor of twenty would not
  // notice. The sorted list is in the failure message so the diff is readable.
  const bearing = [...records(configuredDir)]
    .filter(([, rec]) => rec.cards.length > 0)
    .map(([path]) => path)
    .sort();
  assert.equal(
    bearing.length,
    CARD_BEARING_PAGES,
    `card-bearing pages changed: ${bearing.join(', ')}`,
  );
});

test('the module serves list, home and taxonomy-adjacent kinds, not only regular pages', () => {
  // Named separately from the count above so a failure says WHICH kind was
  // lost. These are the kinds a routing regression takes first.
  const all = records(configuredDir);
  for (const [path, kind] of [
    ['/', 'home'],
    ['/blog', 'section'],
    ['/twins', 'section'],
  ]) {
    const rec = all.get(path);
    assert.equal(rec.kind, kind, `${path} is a ${kind}`);
    assert.equal(rec.cards.length, 1, `${path} carries a card`);
  }
});

test('one page can carry two cards, told apart by the variant it was asked for', () => {
  // page, language and variant together are a card's identity. A second call
  // that changes the template without changing the variant would get the first
  // call's card back, so the two URLs differing is the whole assertion.
  const rec = records(configuredDir).get('/blog/variant');
  assert.equal(rec.cards.length, 2);
  assert.equal(rec.cards[0].variant, '');
  assert.equal(rec.cards[1].variant, 'alt');
  assert.notEqual(rec.cards[0].url, rec.cards[1].url, 'two calls, two different cards');
  for (const card of rec.cards) {
    const head = sniff(cardBytes(configuredDir, card.url));
    assert.equal(head.width, 1200);
    assert.equal(head.height, 630);
  }
});

test('the working configuration produces no diagnostic of any kind', () => {
  // The runner already fails this build on any WARN line; stating it here as
  // well is what makes the assertion visible in the suite's own output rather
  // than only in a shell script.
  assert.deepEqual(moduleWarnings('configured'), []);
});
