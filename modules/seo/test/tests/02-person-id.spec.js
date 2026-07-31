// The person @id surface.
//
// The whole value of $seo.ids.person is that it is CONSTANT across the site:
// a consumer emitting Person-graph nodes through the jsonld-extra hook used
// to hand-build the anchor, which desynchronizes silently when the author
// slug or the module's fragment convention changes. A page-derived value
// would also break the partialCached cache-safety invariant that
// jsonld/organization.html documents for the publisher builder, which is why
// constancy is asserted across three unrelated page shapes rather than one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredDir, personAnchor, nodesOfType, PAGES} from './helpers.js';

for (const dir of [undefined, configuredDir]) {
  const label = dir ? 'configured' : 'unset';

  test(`${label}: the person anchor is byte-identical on every page`, () => {
    const author = personAnchor(PAGES.author, dir);
    const post = personAnchor(PAGES.blogPost, dir);
    const home = personAnchor(PAGES.home, dir);
    const promo = personAnchor(PAGES.promo, dir);

    assert.ok(author, 'the person anchor must resolve at all');
    assert.match(author, /#person$/, 'the anchor keeps the #person fragment');
    assert.equal(post, author, 'an unrelated blog post must see the identical anchor');
    assert.equal(home, author, 'the home page must see the identical anchor');
    assert.equal(promo, author, 'the promo-shaped page must see the identical anchor');
  });

  test(`${label}: the anchor equals the ProfilePage mainEntity @id`, () => {
    const profile = nodesOfType(PAGES.author, 'ProfilePage', dir);
    assert.equal(profile.length, 1, 'exactly one ProfilePage node on the author page');
    assert.equal(
      profile[0].mainEntity['@id'],
      personAnchor(PAGES.author, dir),
      'the resolver and the ProfilePage builder must agree on one anchor',
    );
  });

  test(`${label}: person and organization stay DIFFERENT anchors`, () => {
    // [seo.organization] type is 'Person' in this fixture, which is exactly
    // the case where conflating the two would describe one human as two
    // entities. The publisher node keeps #organization; the author's
    // ProfilePage mainEntity keeps #person.
    const person = personAnchor(PAGES.home, dir);
    const publisher = nodesOfType(PAGES.home, 'Person', dir);
    assert.ok(publisher.length >= 1, 'the home page emits a Person publisher node');
    for (const node of publisher) {
      assert.notEqual(node['@id'], person, 'the publisher anchor must not equal the person anchor');
      assert.match(node['@id'], /#organization$/);
    }
  });
}
