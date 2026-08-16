// A baseURL that carries a path.
//
// At a domain root a card URL that keeps the base path and one that drops it
// are byte-identical, so nothing else in this suite can see the difference.
// Here they cannot both be right: the published URL has to carry /docs/
// exactly once, and it has to name a file that is really at that address. A
// URL missing the segment resolves to nothing on the deployed site, and a URL
// carrying it twice resolves to nothing either -- and both look perfectly
// normal in the markup.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subpathDir, records, cardExists, cardBytes, moduleWarnings} from './helpers.js';
import {sniff} from './lib/raster.js';

const BASE_PATH = '/docs';
const SITE = 'https://og-fixture.example';

test('every published card URL carries the base path exactly once', () => {
  const all = records(subpathDir);
  let seen = 0;
  for (const [path, rec] of all) {
    for (const card of rec.cards) {
      seen += 1;
      assert.ok(card.url.startsWith(`${BASE_PATH}/`), `${path}: ${card.url} lost the base path`);
      const occurrences = card.url.split(`${BASE_PATH}/`).length - 1;
      assert.equal(occurrences, 1, `${path}: ${card.url} repeats the base path`);
      assert.equal(
        card.permalink,
        `${SITE}${card.url}`,
        `${path}: the absolute URL agrees with the relative one`,
      );
    }
  }
  assert.ok(seen >= 15, `the whole card set was checked: ${seen}`);
});

test('and names a file that really is at that address', () => {
  // The half a URL shape cannot state. Hugo writes the tree without the base
  // path, so the file the URL names is the URL minus that segment -- and if the
  // module had built the URL some other way, the two would stop agreeing.
  const all = records(subpathDir);
  for (const [path, rec] of all) {
    for (const card of rec.cards) {
      assert.ok(cardExists(subpathDir, card.url, BASE_PATH), `${path}: nothing at ${card.url}`);
      const head = sniff(cardBytes(subpathDir, card.url, BASE_PATH));
      assert.equal(head.width, 1200, `${path}: ${card.url}`);
      assert.equal(head.height, 630, `${path}: ${card.url}`);
    }
  }
});

test('the same content set behaves the same under a subpath as at a domain root', () => {
  // The base path changes addresses, not decisions: the pages that decline
  // here are the pages that decline anywhere, so a URL-handling change cannot
  // quietly cost a page its card.
  const all = records(subpathDir);
  assert.deepEqual(all.get('/docs/guide').cards, []);
  assert.deepEqual(all.get('/promo/thing').cards, []);
  assert.equal(all.get('/blog/short').cards.length, 1);
  assert.equal(all.get('/').cards.length, 1);
  assert.deepEqual(moduleWarnings('subpath'), [], 'and it is as quiet here as it is there');
});
