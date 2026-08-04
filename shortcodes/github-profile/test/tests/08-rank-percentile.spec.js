// The activity-score percentile: the same one-format rule as the language
// row, on the module's other derived figure.
//
// `rankPercentile` is computed with the IDENTICAL round-to-one-decimal idiom
// the language shares use -- math.Div (math.Round (math.Mul x 1000)) 10 --
// and reached data-rank-percentile as a bare float, so a percentile landing
// on a whole number published "8" where every other profile publishes "7.4".
//
// It is worth stating why this is not merely cosmetic even though ONE
// profile carries ONE percentile, so nothing on the page looks inconsistent.
// The attribute exists to be read by a machine, and a machine reading it
// reads it across pages and sites -- which is exactly where the shape
// changes. A consumer that has learned "one-decimal percentile" from every
// profile it has seen meets one that is not, and either special-cases it or
// misreads it. The visible level beside it (`S` through `C`) cannot stand in:
// it is a coarse bucket, and the percentile is the figure the module
// documents as "the whole story -- no black box".
//
// The fixture could not see this before. Its snapshot resolved to 7.4, and a
// value with a nonzero decimal renders identically whether or not the fix is
// present. `followers` is the one rank input the module never displays --
// it feeds the score and nothing else -- so it is tuned to put the percentile
// exactly on a whole number without disturbing any other assertion.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS, page, element, decodeEntities} from './helpers.js';

// The percentile the fixture's snapshot resolves to, and the reason the
// snapshot has the followers count it has: 8.0 exercises the case, 7.4 could
// not. The level is unchanged either way -- both sit under the 12.5
// threshold, so the rank still reads A+.
const EXPECTED_PERCENTILE = '8.0';
const EXPECTED_LEVEL = 'A+';

const attr = (openTag, name) => {
  const match = new RegExp(`${name}="?([^"\\s>]+)"?`).exec(openTag);
  assert.ok(match, `the rank element must carry ${name}: ${openTag}`);
  return match[1];
};

for (const build of BUILDS) {
  test(`[${build.name}] the percentile keeps its decimal on a whole number`, () => {
    const rank = element(page(build.dir), 'github-profile__rank');
    assert.ok(rank, 'the fixture opts into the rank, so the element must render');

    const percentile = attr(rank.openTag, 'data-rank-percentile');
    assert.match(percentile, /^\d+\.\d$/, `"${percentile}" is not a one-decimal percentile`);

    // Named explicitly, because the shape assertion above passes against the
    // broken template for any value that happens to carry a nonzero decimal.
    // This value does not: it is the case the defect produced.
    assert.ok(
      EXPECTED_PERCENTILE.endsWith('.0'),
      'the fixture must resolve to a percentile that lands ON a whole number, or this spec is vacuous',
    );
    assert.equal(percentile, EXPECTED_PERCENTILE);
  });

  test(`[${build.name}] the level still agrees with the percentile beside it`, () => {
    // A guard on the fixture change itself: the percentile moved to reach the
    // whole-number case, and it had to stay inside the same threshold bucket
    // so the rank the rest of the suite reads is unchanged.
    const rank = element(page(build.dir), 'github-profile__rank');
    // Decoded because the plain build escapes the level's plus sign as
    // A&#43; while the minified build leaves A+ alone -- the two trees only
    // compare after decoding.
    assert.equal(decodeEntities(attr(rank.openTag, 'data-rank-level')), EXPECTED_LEVEL);
    assert.ok(
      Number.parseFloat(EXPECTED_PERCENTILE) <= 12.5,
      `${EXPECTED_LEVEL} is the bucket at or below the 12.5 threshold`,
    );
  });
}
