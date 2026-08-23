// The extra breadcrumb trails a page declares through seo.breadcrumb_trails.
//
// Nothing in this fixture set that trails at all until this file arrived, so
// the whole second half of seo/jsonld/breadcrumb.html -- the coercion guards,
// the per-trail length gate, the @id numbering -- was shipped by a suite that
// never built it once.
//
// The numbering is the part worth locking. Both this module's README and the
// two templates that produce the suffix promise a GAPLESS run, and the
// counter used to advance on every configured trail rather than on every
// emitted one, so a middle trail too short to qualify published #breadcrumb-2
// beside #breadcrumb-4. The fixture therefore declares three trails with the
// short one in the MIDDLE: a two-trail fixture, or one whose short trail sat
// last, prints the same digits whether the counter is right or wrong.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graph, nodesOfType, subpathDir, publicDir} from './helpers.js';

const PAGE = 'blog/breadcrumb-trails/index.html';
const URL = 'https://seo-fixture.example/blog/breadcrumb-trails/';
const SUBPATH_URL = 'https://seo-fixture.example/docs/blog/breadcrumb-trails/';

const finalName = (node) => node.itemListElement.at(-1).name;

test('every declared trail that qualifies is published, and the short one is not', () => {
  const trails = nodesOfType(PAGE, 'BreadcrumbList');
  assert.equal(trails.length, 3, 'the derived trail plus the two qualifying declared ones');

  // Named rather than counted, so a failure says WHICH trail went missing.
  assert.deepEqual(
    trails.map(finalName),
    ['Breadcrumb Trails', 'Deploying', 'Config keys'],
    'the derived trail comes first, then the declared ones in their configured order',
  );

  const lonely = graph(PAGE).filter((n) => JSON.stringify(n).includes('Lonely'));
  assert.deepEqual(lonely, [], 'a trail with fewer than two items publishes no node at all');
});

test('the @id suffixes form a gapless run, and a suppressed trail consumes no number', () => {
  const ids = nodesOfType(PAGE, 'BreadcrumbList').map((n) => n['@id']);
  assert.deepEqual(
    ids,
    [`${URL}#breadcrumb`, `${URL}#breadcrumb-2`, `${URL}#breadcrumb-3`],
    'the derived trail is unnumbered and the declared ones continue 2, 3 with no gap',
  );

  // The specific regression: the second declared trail is the THIRD entry in
  // the configured list, so a counter advancing per configured trail would
  // print 4 here and every assertion above about names and counts would still
  // pass.
  assert.equal(ids.includes(`${URL}#breadcrumb-4`), false, 'the skipped trail took no number');
});

test('a declared trail carries gapless positions and omits item on its last crumb', () => {
  const trail = nodesOfType(PAGE, 'BreadcrumbList').find((n) => finalName(n) === 'Deploying');
  assert.ok(trail, 'the declared trail is present');
  assert.deepEqual(
    trail.itemListElement.map((li) => li.position),
    [1, 2],
    'positions are 1-based and gapless within the trail',
  );
  assert.equal(
    trail.itemListElement[0].item,
    'https://example.com/guides/',
    'a non-final crumb carries its configured URL',
  );
  assert.equal(
    Object.hasOwn(trail.itemListElement.at(-1), 'item'),
    false,
    'the final crumb omits item so Google substitutes the page URL',
  );
  assert.equal(trail.name, 'Deploying', 'the node is named after its final crumb');
});

test('a declared trail anchors its @id on the served URL, not a bare permalink', () => {
  // The subpath build is the only one that can tell those apart: at a domain
  // root the two spellings are byte-identical.
  const ids = nodesOfType(PAGE, 'BreadcrumbList', subpathDir).map((n) => n['@id']);
  assert.deepEqual(ids, [
    `${SUBPATH_URL}#breadcrumb`,
    `${SUBPATH_URL}#breadcrumb-2`,
    `${SUBPATH_URL}#breadcrumb-3`,
  ]);
});

test('the WebPage node points at the derived trail, not at a declared one', () => {
  const webpage = nodesOfType(PAGE, 'WebPage', publicDir)[0];
  assert.ok(webpage, 'the page emits a WebPage node');
  assert.equal(
    webpage.breadcrumb['@id'],
    `${URL}#breadcrumb`,
    'the cross-reference names the unnumbered derived trail',
  );
});
