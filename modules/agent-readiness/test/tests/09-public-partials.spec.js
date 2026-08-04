// Two of the three PUBLIC partials -- twin-url.html and surfaces.html --
// asserted through the fixture-only twindump surface. The fixture's home page
// publishes /twindump.txt per language: one tab-separated line per page of
// the site recording what twin-url.html returned, a marker line, then one
// line per surfaces.html entry, then the build-time block that
// tests/11-build-stamp.spec.js reads. Every claim is checked against the
// published tree in BOTH directions across all seventeen environment builds,
// so neither partial can list a file the build withheld, nor withhold one
// the build published.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  read,
  exists,
  publicDir,
  configuredDir,
  minimalDir,
  notwinsDir,
  multilingualDir,
  llmsoffDir,
  edgeDir,
  offDir,
  badtablesDir,
  nsoffDir,
  nosectionpagesDir,
  nobuildtimeDir,
  llmsindexoffDir,
  unwiredDir,
  nolinkindexesDir,
  nocompactDir,
  nolinkmdDir,
  parseDump,
  publishedTwins,
  siteRelative,
} from './helpers.js';

// The edge build deploys under a subpath baseURL, which the published tree
// does not reflect: Hugo writes /docs/blog/... as blog/... under public/.
const stripBase = (url, base) => (base && url.startsWith(base) ? url.slice(base.length) : url);

// One row per fixture-environment build. `dumps` lists each published dump
// with the prefix its language's per-language surfaces publish under; the
// skills index is root = true and single-path, so it never takes a prefix.
const builds = [
  {name: 'baseline', dir: publicDir},
  {name: 'configured', dir: configuredDir},
  {name: 'minimal', dir: minimalDir},
  {name: 'notwins', dir: notwinsDir},
  {
    name: 'multilingual',
    dir: multilingualDir,
    dumps: [
      {rel: 'twindump.txt', prefix: ''},
      {rel: 'ru/twindump.txt', prefix: 'ru/'},
    ],
  },
  {name: 'llmsoff', dir: llmsoffDir},
  {name: 'edge', dir: edgeDir, base: '/docs'},
  {name: 'off', dir: offDir},
  {name: 'badtables', dir: badtablesDir},
  {name: 'nsoff', dir: nsoffDir},
  {name: 'nosectionpages', dir: nosectionpagesDir},
  {name: 'nobuildtime', dir: nobuildtimeDir},
  {name: 'llmsindexoff', dir: llmsindexoffDir},
  {name: 'unwired', dir: unwiredDir},
  {name: 'nolinkindexes', dir: nolinkindexesDir},
  // The one build in which the enumeration must report a llms_index surface
  // WITHOUT a llms one. Every other build either publishes both link indexes
  // or publishes the compact one alone, so a surfaces.html that resolved the
  // complete index's URL through the compact index's format would pass
  // everywhere else.
  {name: 'nocompact', dir: nocompactDir},
  // `nolinkmd` was built by both runners and read by other specs but was never
  // in this list, so the both-directions invariant went unproven on the one
  // environment where llms.txt withholds its derived twin entry -- exactly the
  // shape this file asserts about.
  {name: 'nolinkmd', dir: nolinkmdDir},
];

for (const {name, dir, base = '', dumps = [{rel: 'twindump.txt', prefix: ''}]} of builds) {
  test(`${name}: the non-empty twin-url results equal exactly the published twin set`, () => {
    // Both directions at once: a URL the dump lists without a published
    // file fails the equality, and so does a published twin no page's
    // twin-url reported -- the drift twin-url.html exists to prevent.
    const listed = [];
    for (const {rel} of dumps) {
      for (const [path, url] of parseDump(rel, dir).twins) {
        if (url === '') continue;
        assert.match(url, /^https:\/\//, `${name}: ${path} must report an absolute URL`);
        listed.push(stripBase(siteRelative(url), base));
      }
    }
    assert.deepEqual(listed.sort(), publishedTwins(dir));
  });

  test(`${name}: the surfaces set equals exactly the surfaces present in the tree`, () => {
    // llms.txt, llms-index.txt and about.md publish per language, so each
    // language's dump answers for its own prefix; the skills index is
    // root = true and single-path, so every language answers with the root
    // file.
    for (const {rel, prefix} of dumps) {
      const {surfaces} = parseDump(rel, dir);
      const paths = new Map([
        ['llms', `${prefix}llms.txt`],
        ['llms_index', `${prefix}llms-index.txt`],
        ['facts', `${prefix}about.md`],
        ['skills', '.well-known/agent-skills/index.json'],
      ]);
      for (const [key, target] of paths) {
        assert.equal(
          surfaces.has(key),
          exists(target, dir),
          `${name}/${rel}: the ${key} entry must be listed iff ${target} is published`,
        );
      }
      for (const [key, url] of surfaces) {
        assert.ok(paths.has(key), `${name}/${rel}: unknown surface key ${key}`);
        assert.equal(
          stripBase(siteRelative(url), base),
          `/${paths.get(key)}`,
          `${name}/${rel}: the ${key} URL must address its published file`,
        );
      }
    }
  });
}

test('baseline: home keeps its twin under the non-empty sections allow-list', () => {
  // The allow-list applies to section kind only, never home. A membership
  // gate that applied it to home would empty this value while /index.md
  // still publishes, and only the home line can catch that.
  const {twins} = parseDump('twindump.txt', publicDir);
  assert.equal(twins.get('/'), 'https://fixture.example/index.md');
});

test('notwins and off: every twin-url result is empty', () => {
  // notwins keeps the markdown format WIRED while markdown.enable = false,
  // so a twin-url that consulted the format alone would report a URL for
  // every page here; off proves the master-switch conjunct the same way.
  for (const [name, dir] of [
    ['notwins', notwinsDir],
    ['off', offDir],
  ]) {
    const {twins} = parseDump('twindump.txt', dir);
    assert.ok(twins.size > 0, `${name}: the dump still enumerates every page`);
    for (const [path, url] of twins) {
      assert.equal(url, '', `${name}: ${path} must publish no twin`);
    }
  }
});

// ---- The llms.txt Agent Skills auto-entry ----
//
// llms.html appends the module's own index entry to `## Optional` when the
// index actually publishes, through the same lib/skills-index-url.html gate
// set surfaces.html reads, so these assertions and the surfaces assertions
// above cannot drift apart.

const AUTO_ENTRY =
  /^- \[Agent Skills index\]\(https:\/\/fixture\.example\/\.well-known\/agent-skills\/index\.json\): Machine-readable index of this site's published agent skills$/m;

test('the auto-entry appears exactly once where the skills index publishes', () => {
  for (const [name, dir] of [
    ['baseline', publicDir],
    ['configured', configuredDir],
  ]) {
    const text = read('llms.txt', dir);
    assert.match(text, AUTO_ENTRY, `${name}: llms.txt must list the Agent Skills index`);
    assert.equal(
      text.split('https://fixture.example/.well-known/agent-skills/index.json').length - 1,
      1,
      `${name}: the index URL must appear exactly once`,
    );
    assert.ok(
      text.indexOf('## Optional') < text.search(AUTO_ENTRY),
      `${name}: the entry belongs to the Optional section`,
    );
  }
});

test('a build whose index does not publish gets no index entry in llms.txt', () => {
  // minimal resolves zero skills, notwins and badtables coerce the skills
  // value empty, and nsoff falls back to defaults that declare none -- in
  // all four the format stays WIRED, which is exactly the state in which a
  // wired-not-published confusion would advertise a 404.
  for (const [name, dir] of [
    ['minimal', minimalDir],
    ['notwins', notwinsDir],
    ['badtables', badtablesDir],
    ['nsoff', nsoffDir],
  ]) {
    assert.ok(
      !read('llms.txt', dir).includes('.well-known/agent-skills'),
      `${name}: llms.txt must not mention the unpublished index`,
    );
  }
});

test('edge: the consumer-authored duplicate suppresses the derived entry', () => {
  // The dedup lock, at the URL the subpath deployment actually publishes:
  // the consumer's own wording survives, the derived entry is withheld,
  // and the URL keeps the baseURL's /docs/ path.
  const text = read('llms.txt', edgeDir);
  assert.equal(
    text.split('https://example.org/docs/.well-known/agent-skills/index.json').length - 1,
    1,
    'the subpath-correct index URL appears exactly once',
  );
  assert.match(
    text,
    /^- \[Skills\]\(https:\/\/example\.org\/docs\/\.well-known\/agent-skills\/index\.json\): Consumer-authored entry for the Agent Skills index\.$/m,
    "the surviving entry is the consumer's, not the module's",
  );
  assert.ok(!text.includes('[Agent Skills index]'), 'the derived entry is suppressed, not doubled');
});
