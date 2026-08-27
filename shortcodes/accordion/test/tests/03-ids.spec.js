// Deep-link ids: where they are placed, how they are minted, how collisions
// resolve, and how an author overrides or declines them.
//
// PLACEMENT is the load-bearing part and the least obvious. The HTML
// standard's ancestor details revealing algorithm walks UP from the
// navigation target and opens each details element the target is slotted
// into -- the walk excludes the starting node itself, so a fragment pointing
// at the <details> element (or at its <summary>, which sits in the summary
// slot rather than the content slot) scrolls to a closed item without
// opening it. Anchoring the BODY is what makes a deep link reveal the
// content.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, PAGES, read, items, attr} from './helpers.js';

const HTML_PAGES = Object.entries(PAGES).filter(([, rel]) => rel.endsWith('.html'));

for (const build of BUILDS) {
  test(`[${build.name}] the id sits on the body, never on the details or summary element`, () => {
    for (const [name, rel] of HTML_PAGES) {
      for (const item of items(read(rel, build.dir))) {
        assert.equal(attr(item.openTag, 'id'), null, `${name}: an id reached the details element`);
        assert.equal(
          attr(item.summary.openTag, 'id'),
          null,
          `${name}: an id reached the summary element`,
        );
      }
    }
    // A positive control: the assertions above hold vacuously if nothing
    // carries an id at all.
    const bodies = items(read(PAGES.home, build.dir)).map((i) => i.bodyId);
    assert.ok(
      bodies.every((id) => typeof id === 'string' && id.length > 0),
      'the home page items published no body ids, so the placement assertions prove nothing',
    );
  });

  test(`[${build.name}] ids are minted from the title the way Hugo mints heading anchors`, () => {
    const ids = items(read(PAGES.home, build.dir)).map((i) => [i.titleText, i.bodyId]);
    assert.deepEqual(ids, [
      ['Shipping', 'shipping'],
      ['Returns', 'returns'],
      ['Warranty', 'warranty'],
      ['Heading item', 'heading-item'],
      ['Standalone', 'standalone'],
    ]);
  });

  test(`[${build.name}] repeated titles take numbered collision suffixes`, () => {
    const same = items(read(PAGES.ids, build.dir))
      .filter((i) => i.titleText === 'Same title')
      .map((i) => i.bodyId);
    assert.deepEqual(
      same,
      ['same-title', 'same-title-1', 'same-title-2'],
      'three identically titled items did not resolve to three distinct ids',
    );
  });

  test(`[${build.name}] an author id wins verbatim and an empty one opts out`, () => {
    const all = items(read(PAGES.ids, build.dir));
    assert.equal(
      all.find((i) => i.titleText === 'Explicit').bodyId,
      'chosen-by-the-author',
      'an author-supplied id was not emitted verbatim',
    );
    assert.equal(
      all.find((i) => i.titleText === 'Opted out').bodyId,
      null,
      'id="" did not suppress the id attribute',
    );
  });

  test(`[${build.name}] a title that sanitizes to nothing still yields a usable id`, () => {
    const item = items(read(PAGES.ids, build.dir)).find((i) => i.titleText === '!!!');
    assert.ok(item, 'the punctuation-only item is missing');
    assert.equal(item.bodyId, 'accordion-item', 'a punctuation-only title produced no fallback id');
  });

  test(`[${build.name}] an id is minted from the title's SOURCE, not its rendered markup`, () => {
    const item = items(read(PAGES.ids, build.dir)).find((i) => i.title.inner.includes('<code>'));
    assert.ok(item, 'the inline-markdown title item is missing');
    assert.equal(
      item.bodyId,
      'inline-code-and-bold',
      'the minted id carried markup punctuation instead of the title text',
    );
  });

  test(`[${build.name}] every published id on a page is unique`, () => {
    // A duplicate id is invalid HTML and silently breaks fragment navigation
    // for BOTH targets, so this sweeps every id on the page -- the module's
    // own and the fixture's headings alike. The collision page is excluded
    // because a collision is precisely what it exists to demonstrate; the
    // spec below owns it.
    for (const [name, rel] of HTML_PAGES) {
      if (rel === PAGES.idCollision) continue;
      const html = read(rel, build.dir);
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      const seen = new Set();
      const duplicates = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
      assert.deepEqual(duplicates, [], `${name}: duplicate ids reached the published page`);
    }
  });

  test(`[${build.name}] a minted id can still collide with a page heading, and id= resolves it`, () => {
    // The documented caveat, given a subject. The module deduplicates against
    // its OWN page-scoped claims and cannot see the ids Hugo mints for
    // Markdown headings, so a heading whose text matches an item title
    // produces a duplicate. Pinning it here means the day that stops being
    // true, this spec says so rather than the behavior changing unnoticed.
    const html = read(PAGES.idCollision, build.dir);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(
      ids.filter((id) => id === 'shipping-options').length,
      2,
      'the heading/item id collision no longer reproduces, so the README caveat is stale',
    );
    // And the documented fix works: the item that names its own id takes it,
    // leaving the heading's alone.
    assert.equal(
      ids.filter((id) => id === 'returns-policy').length,
      1,
      'an explicit item id did not resolve the collision',
    );
    assert.equal(
      ids.filter((id) => id === 'returns-policy-item').length,
      1,
      'the explicit item id was not emitted',
    );
  });
}
