// The worked-in row after the authorship request FAILS, which is the one
// degradation the module may never answer with an unweighted sum.
//
// The design under test: when no authorship map arrives, every contributed
// repository's numerator falls back to the snapshot's contribution-window
// commit count -- the same unit, a rolling year instead of all time -- over
// the same default-branch denominator, still clamped at 1, and a repository
// missing from both sources is excluded. The distorted row is not in the
// fallback chain at any point.
//
// The page under test carries a front-matter flag the fixture's canned-data
// seam reads, making it return authorshipOk false with an empty map -- the
// exact shape the module's fetch partial returns after its authorship
// retries are exhausted. Everything downstream of that seam is the module's
// real code, so the row this page publishes IS the fallback computation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  AUTHORSHIP_DEGRADED_PAGE,
  BUILDS,
  WORKED_IN_PAGE,
  attrValue,
  languageRow,
} from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));

const fixture = JSON.parse(
  readFileSync(join(here, '..', 'fixture', 'data', 'github-profile-fetch.json'), 'utf8'),
);

// Fallback corpus: 1,000,000 owned bytes at weight 1, plus toolkit at its
// window ratio 214/2000 (Go 32,100 and Rust 10,700), docs-site at 40/100
// (HTML 12,000 and CSS 2,000), rebase-lab at 25/50 (Zig 20,000 -- the same
// repository the primary page weights 0 by its resolved authorship entry),
// and pipeline CLAMPED to 1 (all 15,000 Python bytes; its window count 50
// exceeds its branch total 30). Monolith and gadget are absent from the
// window commit list, which a present list below the API's 100-repository
// ceiling makes a measured zero, and snippets still has no denominator, so
// the total is 1,091,800 bytes -- and Zig's 20,000 push Rust's 10,700 to
// ninth place, under the top-eight cap.
const DEGRADED = [
  ['Python', '38.0'],
  ['TypeScript', '22.9'],
  ['Go', '16.7'],
  ['HTML', '9.9'],
  ['Shell', '4.6'],
  ['CSS', '3.1'],
  ['Lua', '2.0'],
  ['Zig', '1.8'],
];

function row(dir, rel) {
  const found = languageRow(dir, rel);
  assert.ok(found, `no language row published in ${rel} under ${dir}`);
  return found;
}

const windowCount = (name) => {
  const entry = fixture.user.contributionsCollection.commitContributionsByRepository.find(
    (c) => c.repository.nameWithOwner === name,
  );
  return entry?.contributions.totalCount;
};
const branchTotal = (name) =>
  fixture.user.codeContributedTo.nodes.find((n) => n.nameWithOwner === name)?.defaultBranchRef
    ?.target?.all?.totalCount;

for (const build of BUILDS) {
  test(`[${build.name}] a failed authorship request degrades to window-count weighting`, () => {
    const {items} = row(build.dir, AUTHORSHIP_DEGRADED_PAGE);
    assert.deepEqual(
      items.map((i) => [i.name, i.pct]),
      DEGRADED,
    );
    for (const item of items) {
      assert.equal(item.text, `${item.pct}%`);
    }
  });

  test(`[${build.name}] the degraded row is still declared authorship-weighted`, () => {
    // Only the numerator's SOURCE degraded; the attribution model did not.
    // A consumer must not read the fallback as a whole-repository sum.
    const {list} = row(build.dir, AUTHORSHIP_DEGRADED_PAGE);
    assert.equal(attrValue(list.openTag, 'data-language-scope'), 'worked-in');
    assert.equal(attrValue(list.openTag, 'data-language-attribution'), 'authorship-weighted');
  });

  test(`[${build.name}] the fallback numerator is not the authorship numerator`, () => {
    // Anti-vacuity for the whole page: toolkit's window count differs from
    // its authorship count, so the degraded row cannot equal the primary
    // worked-in row unless the fallback silently stopped running -- the seam
    // ignoring the failure flag would otherwise leave every assertion here
    // passing against the wrong computation.
    assert.notEqual(
      windowCount('fixture-labs/toolkit'),
      fixture.authorship['fixture-labs/toolkit'],
    );
    const primary = row(build.dir, WORKED_IN_PAGE).items;
    const degraded = row(build.dir, AUTHORSHIP_DEGRADED_PAGE).items;
    assert.notDeepEqual(
      degraded.map((i) => [i.name, i.pct]),
      primary.map((i) => [i.name, i.pct]),
    );
    // The sharpest observable difference: rebase-lab's resolved authorship
    // zero holds Zig out of the primary row, while the window numerator the
    // fallback legitimately uses (25 of 50) lets it into this one.
    assert.ok(
      degraded.some((i) => i.name === 'Zig'),
      'the fallback row weights rebase-lab by its window count',
    );
    assert.ok(!primary.some((i) => i.name === 'Zig'));
  });

  test(`[${build.name}] a window count above the branch total clamps at 1`, () => {
    // The two counts are measured by different mechanisms over different
    // windows, so a default-branch change, rewritten history, or
    // squash-merge reattribution can leave pipeline's window count above
    // its branch's current total without either number being wrong.
    // Unclamped, 50/30 would attribute 25,000 Python bytes to a 15,000-byte
    // repository; the published Python share is the clamped one, already
    // pinned exactly by the whole-row assertion above.
    assert.ok(
      windowCount('another-org/pipeline') > branchTotal('another-org/pipeline'),
      'the fixture must carry a window count above the branch total',
    );
  });

  test(`[${build.name}] exclusion still holds when the numerator source degrades`, () => {
    // No denominator means no ratio under EITHER numerator source: snippets
    // and its unique Nix stay out of the fallback row too.
    const {items} = row(build.dir, AUTHORSHIP_DEGRADED_PAGE);
    assert.ok(
      !items.some((i) => i.name === 'Nix'),
      'Nix reached the degraded row, so a repository with no usable ratio was summed unweighted',
    );
  });
}
