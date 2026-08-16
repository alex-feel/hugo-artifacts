// The fourth routing tier, and the precedence walk above it.
//
// default_template is the card template for a page NO route names, and it is
// the one tier the configured environment cannot hold: that build's decline
// set is the proof of the opposite statement, that an unnamed page gets
// nothing at all. Both claims are true of the module and only one can be true
// of a build, which is why this environment exists.
//
// Every tier is answered by a template with its own flat background, so which
// candidate won is a corner pixel rather than an inference: front matter beats
// a section route, a section route beats a kind route, a kind route beats
// default_template, and a page that switched cards off keeps none of them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routingDir, records, cardImage, moduleWarnings, BACKGROUNDS} from './helpers.js';
import {pixel, hex} from './lib/raster.js';

const corner = (all, path) => hex(pixel(cardImage(routingDir, all.get(path).cards[0].url), 0, 0));

test('a page no route names gets the default template, not nothing', () => {
  // The same four pages the configured environment lists as declining, on the
  // same content, with one key added. Nothing else about them changed.
  const all = records(routingDir);
  for (const path of ['/docs/guide', '/docs', '/tags', '/tags/alpha']) {
    const rec = all.get(path);
    assert.equal(rec.opts.default_template, 'fallback', `${path}: the tier resolved`);
    assert.equal(rec.cards.length, 1, `${path}: and answered`);
    assert.equal(corner(all, path), hex(BACKGROUNDS.wrongSize), `${path}: from the fallback table`);
  }
});

test('every tier above it still wins, in the order the module documents', () => {
  // A default_template that answered a page some other tier had already named
  // would be invisible in the assertion above -- every page would have a card
  // either way -- and would silently replace every routed card in a consuming
  // site with the fallback.
  const all = records(routingDir);
  assert.equal(
    corner(all, '/blog/no-overlay'),
    hex(BACKGROUNDS.german),
    'front matter names plain, which beats the blog section route',
  );
  assert.equal(
    corner(all, '/blog/short'),
    hex(BACKGROUNDS.post),
    'the blog section route beats default_template',
  );
  assert.equal(
    corner(all, '/'),
    hex(BACKGROUNDS.home),
    'the home kind route beats default_template',
  );
});

test('a page that switched cards off gets none, default template or not', () => {
  // enable is read before any route is walked, so the last tier must not be a
  // way back in for a page that opted out.
  const all = records(routingDir);
  const off = all.get('/promo/thing');
  assert.equal(off.opts.enable, false);
  assert.deepEqual(off.cards, [], 'no card from any tier');
  assert.equal(
    all.get('/docs/guide').opts.enable,
    true,
    'and the fallback-carded page really was enabled',
  );
});

test('adding the last tier earns no diagnostic of any kind', () => {
  // The runner already fails this build on any WARN line. Stating it here too
  // keeps the claim in the suite's own output: a routing tier that answered by
  // warning would be a tier no site could use quietly.
  assert.deepEqual(moduleWarnings('routing'), []);
});
