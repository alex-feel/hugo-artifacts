// A truncated list says so; an untruncated one keeps quiet.
//
// Three list sections cut rows -- the rollup and contributed lists by a
// derive-side cap each with its own shortcode parameter, the membership
// list by the query's fixed page size -- and before this contract every cut
// was silent: a reader could not tell a complete list from one whose rows
// went missing, and a headline metric above it could name a bigger number
// with nothing on the page explaining the difference. Now every list
// carries its true total in data-total, and a visible localized "and N
// more" note follows exactly when the rendered rows fall short of it.
//
// The contributed list's total is the CONNECTION's totalCount, not a length
// taken after the fetch: the canned response reports 20 repositories while
// returning 9 nodes, standing in for the truncation the API itself performs
// past its 100-node ceiling. That is why limits-off still shows its note --
// a cap of 0 keeps every fetched row, and 11 repositories were never
// fetched to keep.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDS,
  page,
  element,
  elementsByClass,
  attrValue,
  textOf,
  extractedText,
} from './helpers.js';

const ROLLUP_LIMITED_PAGE = 'rollup-limited/index.html';
const LIMITS_OFF_PAGE = 'limits-off/index.html';

function section(dir, rel, token) {
  const found = element(page(dir, rel), `github-profile__section--${token}`);
  assert.ok(found, `${rel} renders the ${token} section`);
  return found;
}

// The list, its rows, and the note beside it, with the shared arithmetic
// asserted once: rendered rows plus the note's remainder equal the list's
// declared total, whichever section this is.
function truncationSurfaces(sec, listClass, itemClass, token) {
  const list = element(sec.inner, listClass);
  assert.ok(list, `${token}: the list renders`);
  const total = attrValue(list.openTag, 'data-total');
  assert.ok(total !== null, `${token}: the list declares its total`);
  const rows = elementsByClass(list.inner, itemClass);
  const notes = elementsByClass(sec.inner, 'github-profile__more');
  if (notes.length > 0) {
    assert.equal(notes.length, 1, `${token}: at most one note`);
    const note = notes[0];
    assert.equal(note.name, 'p');
    assert.equal(attrValue(note.openTag, 'data-section'), token);
    assert.ok(
      !note.openTag.includes('aria-hidden'),
      `${token}: the note adds information, so it stays announced`,
    );
    const remainder = Number(attrValue(note.openTag, 'data-raw'));
    assert.equal(
      rows.length + remainder,
      Number(total),
      `${token}: rows plus remainder equal the declared total`,
    );
  }
  return {list, rows, notes, total: Number(total)};
}

for (const build of BUILDS) {
  test(`[${build.name}] the home rollup renders every canned owner and keeps quiet`, () => {
    const {rows, notes, total} = truncationSurfaces(
      section(build.dir, 'index.html', 'org-rollup'),
      'github-profile__org-rollup',
      'github-profile__org-roll',
      'org-rollup',
    );
    assert.equal(total, 4, 'four external owners roll up');
    assert.equal(rows.length, 4, 'and the default cap of 10 cuts none of them');
    assert.deepEqual(notes, [], 'nothing was cut, so nothing claims to have been');
  });

  test(`[${build.name}] org-rollup-limit="2" keeps the top two owners and says what it cut`, () => {
    const {rows, notes, total} = truncationSurfaces(
      section(build.dir, ROLLUP_LIMITED_PAGE, 'org-rollup'),
      'github-profile__org-rollup',
      'github-profile__org-roll',
      'org-rollup',
    );
    assert.equal(total, 4, 'the declared total is the PRE-cap owner count');
    assert.deepEqual(
      rows.map((r) => attrValue(r.openTag, 'data-org')),
      ['fixture-labs', 'open-fixture'],
      'the two rows that survive are the top two by total, in order',
    );
    assert.equal(notes.length, 1, 'the cut is visible');
    assert.equal(textOf(notes[0].inner), 'and 2 more', 'as real localized text');
  });

  test(`[${build.name}] the note reaches the text layer a reader extracts`, () => {
    // The note is worthless if only a DOM walker can see it: an
    // HTML-to-text reader of the section must get the sentence.
    const sec = section(build.dir, ROLLUP_LIMITED_PAGE, 'org-rollup');
    assert.ok(
      extractedText(sec.inner).endsWith('and 2 more'),
      'the extracted section text ends with the remainder note',
    );
  });

  test(`[${build.name}] limit 0 keeps every derived row, and only the API's own cut remains`, () => {
    const rollup = truncationSurfaces(
      section(build.dir, LIMITS_OFF_PAGE, 'org-rollup'),
      'github-profile__org-rollup',
      'github-profile__org-roll',
      'org-rollup',
    );
    assert.equal(rollup.rows.length, 4, 'limit 0 renders all four owners');
    assert.deepEqual(rollup.notes, [], 'with nothing cut and no note');

    const contributed = truncationSurfaces(
      section(build.dir, LIMITS_OFF_PAGE, 'contributed'),
      'github-profile__contributed',
      'github-profile__repo',
      'contributed',
    );
    assert.equal(contributed.total, 20, 'the total is the connection totalCount');
    assert.equal(contributed.rows.length, 9, 'every FETCHED repository renders');
    assert.equal(contributed.notes.length, 1, 'and the note names what was never fetched');
    assert.equal(attrValue(contributed.notes[0].openTag, 'data-raw'), '11');
    assert.equal(textOf(contributed.notes[0].inner), 'and 11 more');
  });

  test(`[${build.name}] the membership list names the memberships past the query's page`, () => {
    // The canned totalCount is 6 against 4 returned nodes -- the same
    // totalCount-against-fewer-nodes device the contributed list uses --
    // standing in for a membership count past the query's fixed page size.
    const {rows, notes, total} = truncationSurfaces(
      section(build.dir, 'index.html', 'orgs'),
      'github-profile__orgs',
      'github-profile__org',
      'orgs',
    );
    assert.equal(total, 6);
    assert.equal(rows.length, 4);
    assert.equal(notes.length, 1, 'the two invisible memberships are announced');
    assert.equal(textOf(notes[0].inner), 'and 2 more');
  });

  test(`[${build.name}] the home contributed list separates the API's cut from its own`, () => {
    const {rows, notes, total} = truncationSurfaces(
      section(build.dir, 'index.html', 'contributed'),
      'github-profile__contributed',
      'github-profile__repo',
      'contributed',
    );
    assert.equal(total, 20);
    assert.equal(rows.length, 9, 'nine canned nodes, under the default cap of 12');
    assert.equal(notes.length, 1);
    assert.equal(attrValue(notes[0].openTag, 'data-raw'), '11');
  });
}
