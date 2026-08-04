// Which repositories the language row measures, and whether the heading it
// carries is true of them.
//
// The row used to aggregate owned repositories and every externally
// contributed one together, under the fixed heading "Languages by code
// volume". A repository entered that set on any contribution at all, an
// ISSUE included, and what entered was the REPOSITORY's byte count rather
// than the person's share of it. On a real profile 90.5% of the charted bytes
// came from repositories the person had never committed to, and the row
// published 20.7% Go for someone who has never written a line of Go -- 22 MB
// of it arriving from a single repository they had filed one issue on.
//
// Two things had to become true, and this spec holds them apart because they
// fail independently:
//
//   1. The DEFAULT measures repositories the person owns, where a repository's
//      byte counts at least approximate what they wrote.
//   2. The opt-in that widens the set relabels the section, and even it never
//      counts a repository whose only contribution was an issue.
//
// The fixture is built so that neither assertion can pass by accident. One
// external repository, mega-org/monolith, is ten times the size of everything
// the person owns put together, so a default that admitted it would not
// merely shift the row -- it would take it from 15.0% Go to 82.8% Go. And
// issue-only-org/tracker is 4,000,000 bytes of Kotlin, a language present in
// no other repository in the fixture, so "Kotlin is absent" is an exact fact
// about one repository rather than a judgement about a share that moved.
//
// One thing here is NOT covered, deliberately: derive.html normalizes an
// unrecognized scope back to "owned" so data-language-scope cannot publish a
// value the row does not match, and nothing below reaches that branch. No
// caller can -- the HTML entry validates the parameter and errorfs, and the
// Markdown variant renders no language row -- so the branch is unobservable
// through the module's own surfaces and a mutation of it survives this spec
// by being equivalent, not by escaping it.
//
// The other half of this change lives in spec 10: the contribution types that
// decide which repositories carry language counts at all are settled in the
// GraphQL query, which the offline fixture would otherwise never execute.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  BUILDS,
  WORKED_IN_PAGE,
  page,
  element,
  elementsByClass,
  textOf,
  decodeEntities,
} from './helpers.js';

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

const WORKED_IN = [
  ['Go', '82.8'],
  ['Rust', '9.2'],
  ['Python', '3.5'],
  ['TypeScript', '2.6'],
  ['HTML', '1.0'],
  ['Shell', '0.4'],
  ['CSS', '0.3'],
  ['Lua', '0.2'],
];

const SCOPES = [
  {
    scope: 'owned',
    rel: 'index.html',
    expected: OWNED,
    label: 'Languages by code volume',
  },
  {
    scope: 'worked-in',
    rel: WORKED_IN_PAGE,
    expected: WORKED_IN,
    label: 'Languages in repositories worked in',
  },
];

// The language list of a published page, plus the section title beside it.
//
// Both are looked up INSIDE the languages section rather than from the top of
// the document. The home page renders org-rollup first and it carries a
// section title of its own, so a page-wide lookup finds that one and compares
// the wrong heading -- which is exactly what the first run of this spec did.
function row(dir, rel) {
  const section = element(page(dir, rel), 'github-profile__section--languages');
  assert.ok(section, `no languages section published in ${rel} under ${dir}`);
  const list = element(section.inner, 'github-profile__languages');
  assert.ok(list, `no language list published in ${rel} under ${dir}`);
  const title = element(section.inner, 'github-profile__section-title');
  return {
    list,
    title,
    items: elementsByClass(list.inner, 'github-profile__lang').map((li) => ({
      name: attr(li.openTag, 'data-lang'),
      pct: attr(li.openTag, 'data-pct'),
      text: textOf(element(li.inner, 'github-profile__lang-pct').inner),
    })),
  };
}

// Quote-tolerant, because the minified build drops the quotes.
function attr(openTag, name) {
  const match = new RegExp(`${name}="?([^"\\s>]+)"?`).exec(openTag);
  assert.ok(match, `the element must carry ${name}: ${openTag}`);
  return match[1];
}

for (const build of BUILDS) {
  for (const {scope, rel, expected, label} of SCOPES) {
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

  test(`[${build.name}] the default excludes an external repository that would swamp it`, () => {
    // The case that produced the report, made unmissable: one external
    // repository larger than everything the person owns put together. Both
    // rows are read from the same build, so this is a statement about the
    // scope rather than about two differently configured fixtures.
    const owned = row(build.dir, 'index.html').items;
    const workedIn = row(build.dir, WORKED_IN_PAGE).items;

    const goOwned = owned.find((i) => i.name === 'Go');
    const goWorkedIn = workedIn.find((i) => i.name === 'Go');
    assert.ok(goOwned && goWorkedIn, 'both rows list Go');

    // The monolith is Go, so admitting it moves Go from a minor share to a
    // dominant one. If these two were equal the fixture would have stopped
    // containing the case.
    assert.equal(goOwned.pct, '15.0');
    assert.equal(goWorkedIn.pct, '82.8');
    assert.equal(owned[0].name, 'Python', 'the default row is topped by what the person writes');
    assert.equal(
      workedIn[0].name,
      'Go',
      'the widened row is topped by the repository they visited',
    );

    const monolith = fixture.user.codeContributedTo.nodes.find(
      (n) => n.nameWithOwner === 'mega-org/monolith',
    );
    assert.ok(monolith, 'the fixture must carry the oversized external repository');
    const bytesOf = (nodes) =>
      nodes.reduce((sum, n) => sum + (n.languages?.edges ?? []).reduce((s, e) => s + e.size, 0), 0);
    const external = bytesOf([monolith]);
    const ownedBytes = bytesOf(fixture.user.repositories.nodes);
    assert.ok(
      external > ownedBytes * 10,
      `the external repository must be an order of magnitude larger than everything owned (${external} vs ${ownedBytes})`,
    );
  });

  test(`[${build.name}] the two scopes are not the same row`, () => {
    // A guard against the whole spec passing because both pages rendered the
    // same widget -- a shortcode that silently ignored language-scope would
    // otherwise satisfy every per-scope assertion above except the labels.
    const owned = row(build.dir, 'index.html');
    const workedIn = row(build.dir, WORKED_IN_PAGE);
    assert.notDeepEqual(
      owned.items.map((i) => i.name),
      workedIn.items.map((i) => i.name),
    );
    assert.ok(
      workedIn.items.some((i) => i.name === 'Rust'),
      'Rust exists only in externally contributed repositories, so it marks the widened set',
    );
    assert.ok(!owned.items.some((i) => i.name === 'Rust'), 'and its absence marks the default one');
  });
}
