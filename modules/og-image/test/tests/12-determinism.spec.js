// A card is a function of its inputs.
//
// Two pages whose title, template and geometry are identical resolve to the
// SAME published card, and a page differing by a single character resolves to
// a different one. That pair is a sharper statement than byte equality
// between two files: a module that ignored its inputs and drew one card for
// the whole site passes an equality check between twins and fails the moment
// the third page is asked for.
//
// It is also what makes a card cheap. A site whose section headings repeat
// publishes one file, not one per page, and that only holds while the card
// depends on nothing outside its own inputs -- no counter, no timestamp, no
// render order.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, records, cardBytes} from './helpers.js';

test('two pages with identical content resolve to the identical card', () => {
  const all = records(configuredDir);
  const a = all.get('/twins/twin-a');
  const b = all.get('/twins/twin-b');
  assert.equal(a.title, b.title, 'the two pages really do draw the same words');
  assert.notEqual(a.url, b.url, 'and really are two different pages');
  assert.equal(a.cards.length, 1);
  assert.equal(b.cards.length, 1);
  assert.equal(a.cards[0].url, b.cards[0].url, 'one file serves both');
});

test('one character of difference is a different card', () => {
  // Without this, the assertion above is also satisfied by a module that
  // composes the same card for every page it touches.
  const all = records(configuredDir);
  const a = all.get('/twins/twin-a');
  const c = all.get('/twins/twin-c');
  assert.equal(a.title.length, c.title.length, 'the same length, one character apart');
  assert.notEqual(a.title, c.title);
  assert.notEqual(a.cards[0].url, c.cards[0].url, 'a different URL');
  assert.notDeepEqual(
    cardBytes(configuredDir, a.cards[0].url),
    cardBytes(configuredDir, c.cards[0].url),
    'and different bytes behind it',
  );
});

// Every set of pages in the configured tree that resolves to ONE file, and the
// reason each set does. Naming them is what makes the sharing a statement
// rather than an arithmetic coincidence: a module that started drawing one
// card for the whole site would collapse every page into one group here, and a
// module that stopped content-addressing would empty the list.
const SHARED = [
  // The aligned template draws a literal, so its two pages differ in nothing
  // the card is a function of.
  ['/aligned', '/aligned/a'],
  // The same words at the same quality, with the format spelled two ways.
  ['/jpeg-low/sample', '/jpeg-upper/sample'],
  // The same words, and the same badge named relative on one page and
  // site-absolutely on the other: the leading-slash trim resolves both
  // spellings to the SAME resource, and the identical bytes are the proof.
  ['/overlays/asset-param', '/overlays/slash-param'],
  // The same words, and neither page's overlay parameter resolves to anything.
  ['/overlays/odd-glob', '/overlays/odd-param'],
  // The pair the fixture exists to state.
  ['/twins/twin-a', '/twins/twin-b'],
];

test('a page rendered more than once in a build gets one card, not one per render', () => {
  // The fixture calls the entry twice on every page: once from the recorder
  // and once from the standalone renderer in the head. Both calls have to
  // resolve to the same card, or a site publishing several output formats
  // would compose the same picture again for each of them.
  const all = records(configuredDir);
  const byUrl = new Map();
  for (const [path, rec] of all)
    for (const card of rec.cards) byUrl.set(card.url, [...(byUrl.get(card.url) ?? []), path]);
  const totalCards = [...all.values()].reduce((n, rec) => n + rec.cards.length, 0);
  assert.ok(byUrl.size < totalCards, 'identical inputs really do share a file');

  const shared = [...byUrl.values()]
    .filter((paths) => paths.length > 1)
    .map((paths) => [...paths].sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(shared, SHARED, 'the pages that share a card, and only those');
  assert.equal(
    totalCards - byUrl.size,
    SHARED.reduce((n, group) => n + group.length - 1, 0),
    'and nothing else is shared with anything',
  );
});

test('the same title on two different templates is two different cards', () => {
  // Content addressing has to take the whole filter chain into account, not
  // just the words: the variant page and the home page draw different strings
  // on the home template, and the variant page draws the same string on two
  // templates.
  const all = records(configuredDir);
  const variant = all.get('/blog/variant');
  const home = all.get('/');
  assert.notEqual(variant.cards[1].url, home.cards[0].url, 'same template, different words');
  assert.notEqual(variant.cards[0].url, variant.cards[1].url, 'same words, different template');
});
