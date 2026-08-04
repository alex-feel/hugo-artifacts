// The language row's percentages: one format for every value in the row.
//
// A share is computed as a float and a float prints its SHORTEST form, so a
// language landing on a whole number rendered "1%" beside its neighbors'
// "1.1%" and "0.7%". Invisible to a person reading the row; an exception to
// the format for anything reading it as homogeneous, which is exactly what
// the row is for -- a consumer that has learned "one-decimal percentages"
// from five values meets a sixth that is not one and either special-cases it
// or misreads it.
//
// The defect could not be seen here before, and the reason is worth stating:
// every language in the old fixture data landed on a nonzero decimal, so the
// broken and the fixed template emitted byte-identical rows. The counts were
// re-cut to make each shape a share can take actually occur -- values ON a
// whole number, values ROUNDING onto one, ordinary decimals, and a share
// under 0.05% -- and those cases are what these assertions stand on.
//
// The fix formats the share once, in derive.html, rather than at each render
// site, so all three surfaces of an item carry ONE string. That is asserted
// directly below: a fix reapplied at two of the three sites is a fix that
// drifts the moment a fourth surface is added.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, page, element, elementsByClass, textOf} from './helpers.js';

// Name and rendered share of every item the fixture's byte counts produce,
// in the order the row lists them (bytes descending).
const EXPECTED = [
  ['Go', '44.0'],
  ['TypeScript', '23.9'],
  ['Python', '14.2'],
  ['Rust', '9.0'],
  ['HTML', '4.0'],
  ['CSS', '3.0'],
  ['Shell', '1.8'],
  ['Lua', '0.0'],
];

// Attribute values are read quote-tolerantly: the minifier strips the quotes
// from data-pct and the space from the custom property, and both trees have
// to satisfy the same assertions.
const attr = (openTag, name) => {
  const match = new RegExp(`${name}="?([^"\\s>]+)"?`).exec(openTag);
  assert.ok(match, `the item must carry ${name}: ${openTag}`);
  return match[1];
};

const shareProperty = (openTag) => {
  const match = /--github-profile-lang-share:\s*([^;"'>]+)/.exec(openTag);
  assert.ok(match, `the item must carry the share custom property: ${openTag}`);
  return match[1];
};

const items = (dir) => elementsByClass(page(dir), 'github-profile__lang');

for (const build of BUILDS) {
  test(`[${build.name}] every share in the row carries exactly one decimal place`, () => {
    const rendered = items(build.dir).map((li) =>
      textOf(element(li.inner, 'github-profile__lang-pct').inner),
    );
    assert.ok(rendered.length > 0, 'the fixture must render a language row');

    // Stated as a shape over the whole row first, so the row is uniform even
    // if the fixture's numbers are later re-cut.
    for (const text of rendered) {
      assert.match(text, /^\d+\.\d%$/, `"${text}" is not a one-decimal percentage`);
    }
    assert.deepEqual(
      rendered,
      EXPECTED.map(([, pct]) => `${pct}%`),
    );
  });

  test(`[${build.name}] the fixture actually contains the case that produced this`, () => {
    // Without this the suite is vacuous the moment someone re-tunes the byte
    // counts: a row in which no share lands on a whole number satisfies every
    // assertion above against the BROKEN template too, which is precisely how
    // the defect shipped.
    // The zero case is excluded here and asserted on its own below, so this
    // test speaks only about a NONZERO share whose decimal is a zero.
    const whole = EXPECTED.filter(([, pct]) => pct.endsWith('.0') && pct !== '0.0');
    assert.ok(
      whole.length >= 2,
      'the fixture data must produce shares that land on a whole number',
    );
    const rendered = items(build.dir).map((li) =>
      textOf(element(li.inner, 'github-profile__lang-pct').inner),
    );
    for (const [name, pct] of whole) {
      assert.ok(
        rendered.includes(`${pct}%`),
        `${name} must render ${pct}% rather than dropping its decimal`,
      );
    }
  });

  test(`[${build.name}] the text, the data attribute and the custom property are one string`, () => {
    // The three surfaces of an item come from a single preformatted value, so
    // they cannot disagree. Formatting at the render sites instead would pass
    // this only for as long as every site kept applying the same format.
    for (const li of items(build.dir)) {
      const text = textOf(element(li.inner, 'github-profile__lang-pct').inner);
      const share = text.slice(0, -1);
      assert.equal(attr(li.openTag, 'data-pct'), share, `data-pct must equal the printed ${text}`);
      assert.equal(shareProperty(li.openTag), text, `the custom property must equal ${text}`);
    }
  });

  test(`[${build.name}] the row names the languages the byte counts rank`, () => {
    const listed = items(build.dir).map((li) => attr(li.openTag, 'data-lang'));
    assert.deepEqual(
      listed,
      EXPECTED.map(([name]) => name),
    );
    // Nine languages resolve and the module keeps the top eight, so the
    // smallest is absent -- the cap, and the reason a share can be tiny and
    // still make the row.
    assert.ok(!listed.includes('Ruby'), 'the ninth language must be cut by the top-eight cap');
  });

  test(`[${build.name}] a share under 0.05% renders 0.0% and keeps its entry`, () => {
    // The module ships a measurement, so a language it measured stays in the
    // row: dropping it because its rounded share reads oddly would quietly
    // curate the data, and the entry's presence is itself the signal that the
    // language is there at all. `bytes` carries the unrounded truth.
    const lua = items(build.dir).find((li) => attr(li.openTag, 'data-lang') === 'Lua');
    assert.ok(lua, 'the sub-0.05% language must still be listed');
    assert.equal(textOf(element(lua.inner, 'github-profile__lang-pct').inner), '0.0%');
    assert.equal(attr(lua.openTag, 'data-pct'), '0.0');
  });
}
