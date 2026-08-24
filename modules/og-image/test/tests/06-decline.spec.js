// Declining publishes nothing, anywhere, and says nothing.
//
// That is the module's contract for a page it has no template for: the caller
// falls through to whatever it would have used, and no diagnostic implies the
// site did something wrong. Half-keeping the promise is the failure worth
// catching -- a card composed and then not returned still costs the build and
// still lands in public/, and a warning about a page nobody misconfigured
// trains a maintainer to ignore the module's diagnostics.
//
// The page set is taken from the inventory the fixture writes out of Hugo's
// own pages, so this is a claim about everything that was built rather than
// about a list someone remembered to update.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {join, relative} from 'node:path';
import {configuredDir, records, moduleWarnings} from './helpers.js';

// Every page of the fixture that gets no card in the configured environment,
// and the reason it gets none.
const DECLINED = new Map([
  ['/docs', 'no route names the docs section'],
  ['/docs/guide', 'no route names the docs section'],
  ['/promo', 'no route names the promo section'],
  ['/promo/thing', 'the page switched the card off in front matter'],
  ['/tags', 'no route names the taxonomy kind'],
  ['/tags/alpha', 'no route names the term kind'],
  [
    '/cascaded/own-map',
    'the page writes its own ogcard map, which replaces the cascaded one whole',
  ],
  ...[
    'deg-badentry',
    'deg-badfont',
    'deg-badwhole',
    'deg-bgabsent',
    'deg-bgbadmatch',
    'deg-bgdatabadvalue',
    'deg-bgdatamissing',
    'deg-bgdatanokey',
    'deg-bgdatanovalue',
    'deg-bgfbshape',
    'deg-bgnofallback',
    'deg-bgnolocator',
    'deg-bgunknownsource',
    'deg-ghost',
    'deg-missingbg',
    'deg-nobgkey',
    'deg-overlay',
    'deg-slots',
    'deg-textbg',
  ].flatMap((section) => [
    [`/${section}`, 'a degraded-environment section, unrouted here'],
    [`/${section}/a`, 'a degraded-environment section, unrouted here'],
  ]),
]);

test('every page Hugo built is either carded or documented as declining', () => {
  const all = records(configuredDir);
  const unexplained = [];
  for (const [path, rec] of all) {
    if (rec.cards.length > 0) {
      assert.ok(
        !DECLINED.has(path),
        `${path} is listed as declining but published ${rec.cards.length} cards`,
      );
      continue;
    }
    if (!DECLINED.has(path)) unexplained.push(path);
  }
  assert.deepEqual(unexplained, [], 'pages that stopped getting a card');
  assert.equal(DECLINED.size, 45, 'the documented decline set changed size');
  for (const path of DECLINED.keys()) {
    assert.ok(all.has(path), `${path} is listed as declining but Hugo no longer builds it`);
  }
});

test('a page that switched the card off in front matter is switched off, not merely unrouted', () => {
  // Its section is unrouted too, so the two reasons would look the same. The
  // resolved options are what separates them: enable is false for this page
  // and true for every other one.
  const all = records(configuredDir);
  assert.equal(all.get('/promo/thing').opts.enable, false);
  assert.equal(all.get('/docs/guide').opts.enable, true, 'the unrouted page is still enabled');
  assert.deepEqual(all.get('/docs/guide').cards, []);
});

test('a page writing its own ogcard map replaces a cascaded one whole, it does not merge with it', () => {
  // Hugo's semantic, not the module's, and the trap a consumer falls into
  // once: the section cascades a template onto its pages, and a page that adds
  // any ogcard key of its own loses the cascaded template with it. The sibling
  // page that adds nothing keeps its card, which is what makes this a
  // statement about replacement rather than about the section.
  const all = records(configuredDir);
  assert.equal(
    all.get('/cascaded/inherits').cards.length,
    1,
    'the cascaded template still applies',
  );
  assert.deepEqual(
    all.get('/cascaded/own-map').cards,
    [],
    'and is gone from the page that overwrote it',
  );
  assert.equal(all.get('/cascaded/own-map').opts.enable, true, 'the page did set a key of its own');
});

test('a declining page leaves no file behind and no line in the log', () => {
  // The two ways a decline can be incomplete. A composed-then-discarded card
  // still lands in public/, and a warning naming a page nobody misconfigured
  // is the noise that makes real diagnostics invisible.
  assert.deepEqual(moduleWarnings('configured'), [], 'the configured build says nothing at all');

  const published = new Set();
  for (const entry of readdirSync(join(configuredDir, 'og'), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile()) {
      published.add(
        `/og/${relative(join(configuredDir, 'og'), join(entry.parentPath, entry.name)).split('\\').join('/')}`,
      );
    }
  }
  const returned = new Set();
  for (const [, rec] of records(configuredDir))
    for (const card of rec.cards) returned.add(card.url);
  // Every derivative in the tree is a card some page actually received. The
  // background rasters themselves are never published, so a composed card that
  // was dropped on the way back would be the only thing left over.
  const orphans = [...published].filter((url) => !returned.has(url));
  assert.deepEqual(orphans, [], 'derivatives in the tree that no page received');
});
