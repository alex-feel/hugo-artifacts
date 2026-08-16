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

test('a page rendered more than once in a build gets one card, not one per render', () => {
  // The fixture calls the entry twice on every page: once from the recorder
  // and once from the standalone renderer in the head. Both calls have to
  // resolve to the same card, or a site publishing several output formats
  // would compose the same picture again for each of them.
  const all = records(configuredDir);
  const urls = new Set();
  for (const [, rec] of all) for (const card of rec.cards) urls.add(card.url);
  const totalCards = [...all.values()].reduce((n, rec) => n + rec.cards.length, 0);
  // The twins deliberately share one file, and so do the pages whose titles
  // match on the same template, so the distinct count is lower than the total
  // by exactly the number of shared cards rather than by an arbitrary amount.
  assert.ok(urls.size < totalCards, 'identical inputs really do share a file');
  assert.equal(totalCards - urls.size, 1, 'and only the twins share one');
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
