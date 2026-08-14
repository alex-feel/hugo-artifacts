// Which repositories the language row measures, how much of each one it
// attributes to the person, and whether the heading it carries is true of
// both answers.
//
// Two defect shapes hide in this row, and they fail independently. The first
// is SET membership: a repository once entered the aggregation on any
// contribution at all, an ISSUE included, so 22 MB of someone else's Go was
// charted on the strength of one filed issue. The second is WEIGHT: bounding
// the set does not bound a member's size, and a repository's whole byte
// count stands in for the person's share of it -- three unmerged pull
// requests into a 23 MB Go project once published a 64% Go row for someone
// who had never written Go. This spec holds three truths apart:
//
//   1. The DEFAULT measures repositories the person owns, whole, where a
//      repository's byte counts at least approximate what they wrote.
//   2. The opt-in that widens the set relabels the section, and it scales
//      every contributed repository by the authorship ratio f =
//      min(mine/all, 1) over its default branch, so membership alone gives a
//      repository no weight.
//   3. Neither scope counts a repository whose only contribution was an
//      issue, and a contributed repository with NO usable ratio is excluded
//      rather than summed unweighted.
//
// The fixture is built so that none of these can pass by accident. One
// external repository, mega-org/monolith, is ten times the size of
// everything the person owns put together AND sits at authorship zero (the
// unmerged-pull-request shape), so any path that admits its bytes unweighted
// -- the old default, or a weighting that leaks -- tops the row with Go.
// issue-only-org/tracker is 4,000,000 bytes of Kotlin, a language present in
// no other repository, so "Kotlin is absent" is an exact fact about set
// membership. And quiet-user/snippets is 500,000 bytes of Nix -- again
// unique -- behind a null defaultBranchRef, so "Nix is absent" is an exact
// fact about the no-usable-ratio exclusion.
//
// One thing here is NOT covered, deliberately: derive.html normalizes an
// unrecognized scope back to "owned" so data-language-scope cannot publish a
// value the row does not match, and nothing below reaches that branch. No
// caller can -- the HTML entry validates the parameter and errorfs, and the
// Markdown variant renders no language row -- so the branch is unobservable
// through the module's own surfaces and a mutation of it survives this spec
// by being equivalent, not by escaping it.
//
// Two companions carry the rest of this surface: spec 10 pins the GraphQL
// requests (the contribution-type narrowing, the denominator in the
// snapshot, the authorship query itself), and spec 11 pins the row this same
// fixture publishes after the authorship request FAILS, which is where the
// fallback numerator lives.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUILDS, WORKED_IN_PAGE, attrValue, decodeEntities, languageRow, textOf} from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));

// Read out of the fixture data rather than restated here, so a later re-cut
// that removes a case cannot leave these assertions passing over data that no
// longer contains it.
const fixture = JSON.parse(
  readFileSync(join(here, '..', 'fixture', 'data', 'github-profile-fetch.json'), 'utf8'),
);

// The two rows the fixture publishes, each as [language, rendered share] in
// the order the row lists them.
const OWNED = [
  ['Python', '40.0'],
  ['TypeScript', '25.0'],
  ['Go', '15.0'],
  ['HTML', '9.6'],
  ['Shell', '5.0'],
  ['CSS', '3.2'],
  ['Lua', '2.2'],
  ['HCL', '0.0'],
];

// Weighted corpus: 1,000,000 owned bytes at weight 1, plus toolkit at 0.6
// (Go 180,000 and Rust 60,000 of its 300,000 and 100,000), gadget at 0.5
// (TypeScript 30,000 of 60,000), docs-site at its FALLBACK ratio 40/100
// (HTML 12,000 and CSS 2,000 -- it is absent from the authorship map), and
// pipeline at 30/30 (all 15,000 Python bytes). Monolith multiplies by zero
// and snippets is excluded, so the total is 1,299,000 bytes.
const WORKED_IN = [
  ['Python', '31.9'],
  ['Go', '25.4'],
  ['TypeScript', '21.6'],
  ['HTML', '8.3'],
  ['Rust', '4.6'],
  ['Shell', '3.8'],
  ['CSS', '2.6'],
  ['Lua', '1.7'],
];

const SCOPES = [
  {
    scope: 'owned',
    rel: 'index.html',
    expected: OWNED,
    label: 'Languages by code volume',
    attribution: 'repository',
  },
  {
    scope: 'worked-in',
    rel: WORKED_IN_PAGE,
    expected: WORKED_IN,
    label: 'Languages in repositories worked in',
    attribution: 'authorship-weighted',
  },
];

function row(dir, rel) {
  const found = languageRow(dir, rel);
  assert.ok(found, `no language row published in ${rel} under ${dir}`);
  return found;
}

function attr(openTag, name) {
  const value = attrValue(openTag, name);
  assert.ok(value, `the element must carry ${name}: ${openTag}`);
  return value;
}

const codeNode = (name) =>
  fixture.user.codeContributedTo.nodes.find((n) => n.nameWithOwner === name);
const branchTotal = (name) => codeNode(name)?.defaultBranchRef?.target?.all?.totalCount;

for (const build of BUILDS) {
  for (const {scope, rel, expected, label, attribution} of SCOPES) {
    test(`[${build.name}] the ${scope} row measures the repositories it names`, () => {
      const {items} = row(build.dir, rel);
      assert.deepEqual(
        items.map((i) => [i.name, i.pct]),
        expected,
      );
      // The three surfaces still agree, under both scopes: the fix that made
      // them one string is what a second scope could most easily undo.
      for (const item of items) {
        assert.equal(item.text, `${item.pct}%`);
      }
    });

    test(`[${build.name}] the ${scope} row says which question it answers`, () => {
      const {list, title} = row(build.dir, rel);
      assert.equal(attr(list.openTag, 'data-language-scope'), scope);

      // The attribution marker is the machine-readable half of the weighting
      // claim: "repository" means whole byte counts, "authorship-weighted"
      // means contributed repositories are scaled by the person's share of
      // default-branch commits. A consumer that cannot read this cannot tell
      // a weighted row from the whole-repository one it replaced.
      assert.equal(attr(list.openTag, 'data-language-attribution'), attribution);

      // The heading and the accessible name are the claim. A row measuring
      // repositories the person merely worked in may not carry a heading that
      // says the bytes are theirs, which is the defect in one sentence.
      const ariaMatch = /aria-label="([^"]*)"/.exec(list.openTag);
      assert.ok(ariaMatch, `the list must carry an aria-label: ${list.openTag}`);
      assert.equal(decodeEntities(ariaMatch[1]), label);
      assert.ok(title, 'the section must carry a visible title');
      assert.equal(textOf(title.inner), label);
    });

    test(`[${build.name}] the ${scope} row counts no issue-only repository`, () => {
      const {items} = row(build.dir, rel);
      // Anti-vacuity first: the assertion below is a search for something
      // absent, and a fixture that stopped carrying it would satisfy that
      // search while proving nothing.
      const tracker = fixture.user.repositoriesContributedTo.nodes.find(
        (n) => n.nameWithOwner === 'issue-only-org/tracker',
      );
      assert.ok(tracker, 'the fixture must carry an issue-only external repository');
      assert.ok(
        !fixture.user.codeContributedTo.nodes.some(
          (n) => n.nameWithOwner === 'issue-only-org/tracker',
        ),
        'and it must be absent from codeContributedTo, which is what an issue-only contribution looks like',
      );
      assert.equal(
        tracker.primaryLanguage.name,
        'Kotlin',
        'the issue-only repository is the only source of Kotlin in the fixture',
      );

      assert.ok(
        !items.some((i) => i.name === 'Kotlin'),
        `Kotlin reached the ${scope} row, so a repository whose only contribution was an issue was counted as code`,
      );
    });
  }

  test(`[${build.name}] a dominant external repository at authorship zero contributes nothing`, () => {
    // The case that produced the report, made unmissable: one external
    // repository larger than everything the person owns put together, whose
    // only contributions are unmerged pull requests -- enrolled in the set,
    // absent from the default branch the byte counts describe. Both rows are
    // read from the same build, so this is a statement about the scope
    // rather than about two differently configured fixtures.
    const owned = row(build.dir, 'index.html').items;
    const workedIn = row(build.dir, WORKED_IN_PAGE).items;

    const monolith = codeNode('mega-org/monolith');
    assert.ok(monolith, 'the fixture must carry the oversized external repository');
    const bytesOf = (nodes) =>
      nodes.reduce((sum, n) => sum + (n.languages?.edges ?? []).reduce((s, e) => s + e.size, 0), 0);
    const external = bytesOf([monolith]);
    const ownedBytes = bytesOf(fixture.user.repositories.nodes);
    assert.ok(
      external > ownedBytes * 10,
      `the external repository must be an order of magnitude larger than everything owned (${external} vs ${ownedBytes})`,
    );
    // Authorship zero over a USABLE denominator: the repository is weighted,
    // not excluded, and its weight is genuinely 0 -- the unmerged-pull-request
    // shape, where enrollment exists but none of the person's commits are on
    // the branch whose bytes the row measures.
    assert.equal(fixture.authorship['mega-org/monolith'], 0);
    assert.ok(branchTotal('mega-org/monolith') > 0, 'the monolith must have a usable denominator');

    // With the monolith multiplied by zero, Go moves only as far as the
    // genuinely authored share of other repositories carries it, and the top
    // of the widened row is still what the person writes. Summed whole, the
    // monolith's Go alone would out-byte the entire weighted corpus.
    const goOwned = owned.find((i) => i.name === 'Go');
    const goWorkedIn = workedIn.find((i) => i.name === 'Go');
    assert.ok(goOwned && goWorkedIn, 'both rows list Go');
    assert.equal(goOwned.pct, '15.0');
    assert.equal(goWorkedIn.pct, '25.4');
    assert.equal(owned[0].name, 'Python', 'the default row is topped by what the person writes');
    assert.equal(workedIn[0].name, 'Python', 'and so is the widened row');
  });

  test(`[${build.name}] a partial authorship ratio contributes proportionally`, () => {
    // toolkit's ratio is a real fraction (1200 of 2000), so its Rust -- a
    // language no owned repository carries -- lands at 0.6 of its 100,000
    // bytes. Rust's presence marks the widened set, its share proves the
    // scaling, and its absence from the default row proves the set boundary.
    const mine = fixture.authorship['fixture-labs/toolkit'];
    const all = branchTotal('fixture-labs/toolkit');
    assert.ok(mine > 0 && mine < all, `the fixture must carry a partial ratio (${mine}/${all})`);

    const owned = row(build.dir, 'index.html').items;
    const workedIn = row(build.dir, WORKED_IN_PAGE).items;
    const rust = workedIn.find((i) => i.name === 'Rust');
    assert.ok(
      rust,
      'Rust exists only in externally contributed repositories, so it marks the widened set',
    );
    assert.equal(rust.pct, '4.6');
    assert.ok(!owned.some((i) => i.name === 'Rust'), 'and its absence marks the default one');
    assert.notDeepEqual(
      owned.map((i) => i.name),
      workedIn.map((i) => i.name),
    );
  });

  test(`[${build.name}] a repository the authorship response nulled falls back per repository`, () => {
    // docs-site is deliberately absent from the authorship map while the
    // request as a whole succeeded, so its numerator comes from the
    // snapshot's contribution-window commit count (40 of 100). Its HTML and
    // CSS bytes therefore reach the row at 0.4 -- already pinned by the
    // whole-row assertion above -- and this test keeps the CASE in the
    // fixture: were docs-site quietly added to the map, or dropped from the
    // window list, the fallback path would run in no build at all.
    assert.ok(
      !Object.hasOwn(fixture.authorship, 'fixture-labs/docs-site'),
      'docs-site must be absent from the authorship map',
    );
    const windowEntry = fixture.user.contributionsCollection.commitContributionsByRepository.find(
      (c) => c.repository.nameWithOwner === 'fixture-labs/docs-site',
    );
    assert.ok(windowEntry, 'and present in the contribution-window commit list');
    assert.ok(windowEntry.contributions.totalCount > 0, 'with a usable fallback numerator');
    assert.ok(branchTotal('fixture-labs/docs-site') > 0, 'and a usable denominator');

    const workedIn = row(build.dir, WORKED_IN_PAGE).items;
    const html = workedIn.find((i) => i.name === 'HTML');
    assert.ok(html, 'the row lists HTML, part of which only docs-site contributes');
    assert.equal(html.pct, '8.3');
  });

  test(`[${build.name}] a repository with no usable ratio is excluded, never summed unweighted`, () => {
    // snippets sits behind a null defaultBranchRef: no denominator, so no
    // ratio, so exclusion -- the same skip-not-guess treatment restricted
    // repositories get. Its 500,000 bytes of Nix are half the owned corpus,
    // so an implementation that summed the unratioed repository whole would
    // put Nix near the top of the row, not below the cap.
    const snippets = codeNode('quiet-user/snippets');
    assert.ok(snippets, 'the fixture must carry the no-usable-ratio repository');
    assert.equal(snippets.defaultBranchRef, null, 'with a null defaultBranchRef');
    assert.deepEqual(
      snippets.languages.edges.map((e) => e.node.name),
      ['Nix'],
      'and Nix is its only language',
    );
    assert.ok(
      !fixture.user.repositories.nodes.some((n) =>
        (n.languages?.edges ?? []).some((e) => e.node.name === 'Nix'),
      ),
      'which no owned repository carries',
    );
    assert.ok(snippets.languages.edges[0].size * 2 >= 1000000, 'at half the owned corpus or more');

    const workedIn = row(build.dir, WORKED_IN_PAGE).items;
    assert.ok(
      !workedIn.some((i) => i.name === 'Nix'),
      'Nix reached the worked-in row, so a repository with no usable authorship ratio was summed unweighted',
    );
  });

  test(`[${build.name}] a resolved authorship zero wins over a nonzero window count`, () => {
    // rebase-lab's authorship entry is PRESENT with value 0 while its window
    // commit count is 25 of branch total 50 -- the shape a default-branch
    // replacement leaves behind. A resolved zero is a measurement, not an
    // absence, so the primary page must weight it 0; only an existence test
    // on the authorship map keeps that true, because a truthiness test reads
    // the zero as missing, routes the repository into the window fallback,
    // and publishes half its bytes. Zig is unique to rebase-lab, so its
    // absence here is exact; spec 11 asserts the complementary presence on
    // the degraded page, where the window numerator legitimately applies.
    assert.equal(fixture.authorship['open-fixture/rebase-lab'], 0);
    const windowEntry = fixture.user.contributionsCollection.commitContributionsByRepository.find(
      (c) => c.repository.nameWithOwner === 'open-fixture/rebase-lab',
    );
    assert.ok(windowEntry, 'the fixture must carry a nonzero window count for rebase-lab');
    assert.ok(windowEntry.contributions.totalCount > 0, 'and it must be nonzero');
    assert.ok(branchTotal('open-fixture/rebase-lab') > 0, 'over a usable denominator');
    assert.deepEqual(
      codeNode('open-fixture/rebase-lab').languages.edges.map((e) => e.node.name),
      ['Zig'],
      'and Zig is its only language',
    );

    const workedIn = row(build.dir, WORKED_IN_PAGE).items;
    assert.ok(
      !workedIn.some((i) => i.name === 'Zig'),
      'Zig reached the primary worked-in row, so a resolved authorship zero was treated as missing',
    );
  });
}
