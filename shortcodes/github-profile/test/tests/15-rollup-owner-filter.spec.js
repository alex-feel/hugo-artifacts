// The rollup's owner filter drops user-owned rows before any counting.
//
// org-rollup-owners="organizations" exists for the consumer presenting the
// rollup under an organizations-framed heading: the canned response rolls
// up four external owners -- three organizations and one user account
// (solo-maintainer) -- and the filter must remove the user row from the
// GROUPING, not from the rendering, so the declared total, the cap, and
// the remainder note never count what the list would not show. The page
// under test pulls the cap below the kept count on purpose: a total of 3
// with two rows and an "and 1 more" note proves the remainder is the cut
// organization, not the filtered user.
//
// The default stays "all", pinned against the limits-off page: the
// user-owned row is still rendered and the list says data-owners="all",
// so existing consumers keep the rows they render today.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, page, element, elementsByClass, attrValue, textOf} from './helpers.js';

const FILTERED_PAGE = 'rollup-organizations/index.html';
const LIMITS_OFF_PAGE = 'limits-off/index.html';

function rollup(dir, rel) {
  const sec = element(page(dir, rel), 'github-profile__section--org-rollup');
  assert.ok(sec, `${rel} renders the org-rollup section`);
  const list = element(sec.inner, 'github-profile__org-rollup');
  assert.ok(list, `${rel}: the list renders`);
  return {
    list,
    rows: elementsByClass(list.inner, 'github-profile__org-roll'),
    notes: elementsByClass(sec.inner, 'github-profile__more'),
  };
}

for (const build of BUILDS) {
  test(`[${build.name}] organizations-only drops the user row before the total, the cap, and the note`, () => {
    const {list, rows, notes} = rollup(build.dir, FILTERED_PAGE);
    assert.equal(
      attrValue(list.openTag, 'data-owners'),
      'organizations',
      'the list names its selection',
    );
    assert.equal(
      Number(attrValue(list.openTag, 'data-total')),
      3,
      'the declared total never counted the user row',
    );
    assert.deepEqual(
      rows.map((r) => attrValue(r.openTag, 'data-org')),
      ['fixture-labs', 'open-fixture'],
      'the cap then keeps the top two organizations, in order',
    );
    for (const row of rows) {
      assert.equal(
        attrValue(row.openTag, 'data-owner-type'),
        'Organization',
        'every rendered row is organization-owned',
      );
    }
    assert.equal(notes.length, 1, 'the cut organization is visible');
    assert.equal(
      Number(attrValue(notes[0].openTag, 'data-raw')),
      1,
      'and the remainder is that one organization, not the filtered user',
    );
    assert.equal(textOf(notes[0].inner), 'and 1 more', 'as real localized text');
  });

  test(`[${build.name}] the default keeps user-owned rows and says so`, () => {
    const {list, rows} = rollup(build.dir, LIMITS_OFF_PAGE);
    assert.equal(
      attrValue(list.openTag, 'data-owners'),
      'all',
      'the unfiltered list names its selection too',
    );
    assert.ok(
      rows.some((r) => attrValue(r.openTag, 'data-owner-type') === 'User'),
      'the user-owned row is still rendered under the default',
    );
  });
}
