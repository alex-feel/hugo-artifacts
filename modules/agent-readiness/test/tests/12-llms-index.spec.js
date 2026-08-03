// The two documents one page walk produces: the COMPACT /llms.txt and the
// COMPLETE /llms-index.txt, plus the per-section selection principle that is
// the only difference between them.
//
// Every assertion here is RELATIONAL, between two documents of ONE build,
// because the acceptance criteria are relations rather than existence facts.
// "Adding a page shows up in both files" cannot be checked by adding a page
// at assertion time, and two independent existence checks would pass against
// two renderers that agree today and drift tomorrow -- which is precisely the
// objection the shared page walk has to answer. What is checkable, and what
// is checked, is that the complete index's listing for a section IS the
// shared filter's admitted set for it (cross-checked against a third document
// rendered separately), and that the compact file's listing is a subset
// selected from that same set. A page added to the content tree changes the
// first, and the second follows from it.
//
// The selection specs assert WHICH pages each shape picks, never how many.
// The fixture is built so the shapes disagree: blog/post-one.md is the only
// flagged page and the OLDEST admitted post, while blog/post-two.md is the
// only weighted one and therefore heads the default order. A count-only spec
// would pass against a `flagged` implementation that silently returned the
// first N.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  read,
  exists,
  minimalDir,
  notwinsDir,
  llmsoffDir,
  edgeDir,
  offDir,
  multilingualDir,
  llmsindexoffDir,
  unwiredDir,
  nolinkindexesDir,
  markdownLinks,
  sectionsWithTopLevelBullets,
  siteRelative,
  urlResolves,
  warnCount,
  BASE_URL,
} from './helpers.js';

const COMPACT = 'llms.txt';
const COMPLETE = 'llms-index.txt';

// The bullets under one `## ` heading, as link URLs, in document order.
const urlsUnder = (text, heading) =>
  (sectionsWithTopLevelBullets(text).get(heading) ?? []).map((line) => markdownLinks(line)[0]?.url);

// The same bullets as link TEXTS, which for a page entry is its title. Titles
// are what make a selection spec readable: "Post One, not Post Two" says what
// the principle picked, while "1, not 1" says nothing.
const titlesUnder = (text, heading) =>
  (sectionsWithTopLevelBullets(text).get(heading) ?? []).map(
    (line) => markdownLinks(line)[0]?.text,
  );

// A twin URL reduced to the page it belongs to, so a listing that links twins
// can be compared with one that links HTML pages.
const pageOf = (url) => siteRelative(url).replace(/index\.md$/, '');

test('the complete index publishes beside the compact one, under a name that is not llms-full.txt', () => {
  // The name is a decision, not a detail. `llms-full.txt` is a platform
  // convention for a document carrying the linked pages' CONTENT, and the
  // `llms-<qualifier>.txt` slot beside it is already used for content-volume
  // variants, so publishing a LINK index there would promise an agent that
  // knows the convention the wrong thing. `index` names the form instead.
  assert.ok(exists(COMPACT), 'the compact index still publishes');
  assert.ok(exists(COMPLETE), 'and the complete one beside it');
  assert.ok(!exists('llms-full.txt'), 'the module ships no full-CONTENT file');
  assert.ok(!exists('llms-index.md'), 'text/plain publishes .txt, not .md');
});

test('ONE PAGE WALK: each complete-index section IS the shared filter admitted set', () => {
  // about.md is rendered by a different renderer from a different output
  // format, and it lists EVERY page the shared filter admits for a section --
  // complete by design, with no limit key to set. So it is an independent
  // observation of the same walk, and equality with it is what "one page walk
  // produces both files" means in practice. A page added to the content tree
  // enters both sets or neither.
  const complete = read(COMPLETE);
  const facts = read('about.md');
  for (const name of ['Blog', 'Projects']) {
    const fromIndex = urlsUnder(complete, name).map(pageOf).sort();
    // The facts document's first link per bullet is the page's HTML URL.
    const fromFacts = (sectionsWithTopLevelBullets(facts).get(name) ?? [])
      .map((line) => siteRelative(markdownLinks(line)[0].url))
      .sort();
    assert.ok(fromIndex.length > 0, `the fixture must list ${name} pages`);
    assert.deepEqual(fromIndex, fromFacts, `${name} must hold the same pages in both documents`);
  }
});

test('ONE PAGE WALK: every compact listing is a subset of the complete one', () => {
  // Holds for EVERY configured heading, whatever selection principle it uses,
  // which is the general form of "a narrower selection costs reach, not
  // access". An uncapped, unselected section is the equality case and is
  // asserted separately below.
  const compact = read(COMPACT);
  const complete = read(COMPLETE);
  const sections = sectionsWithTopLevelBullets(compact);
  sections.delete('Optional');
  sections.delete('Start here');
  let checked = 0;
  for (const name of sections.keys()) {
    const inComplete = new Set(urlsUnder(complete, name));
    assert.ok(inComplete.size > 0, `${name} must be listed in the complete index too`);
    for (const url of urlsUnder(compact, name)) {
      assert.ok(
        inComplete.has(url),
        `${name}: the compact file lists ${url}, the complete one does not`,
      );
    }
    checked += 1;
  }
  assert.ok(checked >= 6, 'the fixture must configure the shapes this sweep exists to cover');
});

test('an uncapped, unselected section is IDENTICAL in both documents', () => {
  // The byte-level statement of the default: with no `select`, `order` or
  // positive `limit`, the compact file's section is the complete one.
  const compact = read(COMPACT);
  const complete = read(COMPLETE);
  for (const name of ['Blog', 'Projects']) {
    assert.deepEqual(
      sectionsWithTopLevelBullets(compact).get(name),
      sectionsWithTopLevelBullets(complete).get(name),
      `${name} must render the same lines in both documents`,
    );
  }
});

test('NEVER TRUNCATED: the complete index ignores every cap and selection key', () => {
  // The same section, four different selection principles, one build. Every
  // one of them is complete in the complete index, and the listing is
  // byte-identical to the plain `Blog` entry's -- so no `limit`, `select` or
  // `order` value can reach that document.
  const compact = read(COMPACT);
  const complete = read(COMPLETE);
  const blog = sectionsWithTopLevelBullets(complete).get('Blog');
  assert.equal(blog.length, 3, 'the fixture admits three blog pages');
  for (const [name, compactCount] of [
    ['Recent Blog', 1],
    ['Featured Blog', 1],
    ['Blog By Date', 2],
    ['Blog By Title', 2],
  ]) {
    assert.equal(
      sectionsWithTopLevelBullets(compact).get(name).length,
      compactCount,
      `${name} must be narrowed in the compact file`,
    );
    assert.deepEqual(
      sectionsWithTopLevelBullets(complete).get(name),
      blog,
      `${name} must be complete, and identical to the section, in the complete index`,
    );
  }
});

// ---- The selection principle ----

test('each selection shape picks what it claims, and the shapes disagree', () => {
  // The fixture's blog holds three admitted pages. post-two carries the only
  // authored weight and post-one the only `llms_featured` flag, so the four
  // listings below are pairwise different rather than four spellings of one
  // result. If they ever collapse, this spec stops proving anything and says
  // so through the final assertion.
  const compact = read(COMPACT);
  const TWO = 'Post Two\\] With A Stray Bracket';
  const ONE = 'Post One';
  const NOINDEX = 'Noindexed but explicitly included';

  assert.deepEqual(
    titlesUnder(compact, 'Blog'),
    [TWO, NOINDEX, ONE],
    'the documented default: weight ascending with unweighted pages last, then date descending',
  );
  assert.deepEqual(titlesUnder(compact, 'Recent Blog'), [TWO], 'first N over that same order');
  assert.deepEqual(
    titlesUnder(compact, 'Featured Blog'),
    [ONE],
    'the flagged page, whichever it is',
  );
  assert.deepEqual(titlesUnder(compact, 'Blog By Date'), [NOINDEX, TWO], 'date descending');
  assert.deepEqual(titlesUnder(compact, 'Blog By Title'), [NOINDEX, ONE], 'title ascending');

  assert.notDeepEqual(
    titlesUnder(compact, 'Featured Blog'),
    titlesUnder(compact, 'Recent Blog'),
    'flagged and first-N must pick DIFFERENT pages here, or the flagged spec passes for the wrong reason',
  );
  assert.notDeepEqual(
    titlesUnder(compact, 'Blog By Date'),
    titlesUnder(compact, 'Blog By Title'),
    'the two orderings must disagree, or the order key proves nothing',
  );
});

test('select = all lists the section whole and raises no complaint', () => {
  // The value must be part of the vocabulary rather than merely tolerated: an
  // entry naming it must not trip the unknown-select guard.
  const compact = read(COMPACT);
  assert.deepEqual(
    sectionsWithTopLevelBullets(compact).get('All Projects'),
    sectionsWithTopLevelBullets(compact).get('Projects'),
  );
  assert.equal(warnCount(/unrecognized `select`/), 0, 'no build may report `all` as unknown');
});

test('the default keeps the pages a cap is meaningless without knowing', () => {
  // A cap tells a consumer nothing unless they know what it keeps. The
  // documented default is Hugo's own page order -- weight ascending with
  // UNWEIGHTED pages last, then date descending, then title -- so a section
  // whose pages carry authored weights keeps its most important entries and
  // one without keeps its newest. Both halves appear here: blog mixes a
  // weighted page with unweighted ones, projects carries no weight at all and
  // therefore degrades to newest-first.
  const compact = read(COMPACT);
  assert.deepEqual(
    titlesUnder(compact, 'Projects'),
    ['Project Beta: a title, with punctuation', 'Project Alpha'],
    'unweighted pages degrade to newest first: beta is dated after alpha',
  );
});

// ---- The guards ----

test('an unrecognized select falls back to first N rather than deleting the section', () => {
  // A typo in a brand-new key must not delete content: the entry keeps the
  // consumer's own `limit` and the behavior they had before they reached for
  // the key.
  assert.equal(warnCount(/unrecognized `select`/, 'edge'), 1);
  assert.deepEqual(titlesUnder(read(COMPACT, edgeDir), 'Bad Select'), [
    'Post Two\\] With A Stray Bracket',
  ]);
});

test('an unrecognized order never reaches sort, and keeps the site page order', () => {
  // This is the guard whose absence would be FATAL rather than merely wrong:
  // `sort` takes a field name, and a name no page carries aborts template
  // execution and stops the consuming site's build. That the edge build
  // completed at all is half the assertion; the runner fails on any ERROR
  // line, so a reached sort could not produce a published file to read here.
  assert.equal(warnCount(/unrecognized `order`/, 'edge'), 1);
  const edge = read(COMPACT, edgeDir);
  assert.deepEqual(titlesUnder(edge, 'Bad Order'), titlesUnder(edge, 'Blog').slice(0, 2));
});

test('a flag matching no page omits the heading, with a message naming the flag', () => {
  // Distinct from the section-matches-nothing message, because the remedies
  // differ: that one sends the consumer to the content tree, this one to the
  // flag name. Both fire in this build, so a single generic message would
  // show up as a count of two here.
  const edge = read(COMPACT, edgeDir);
  assert.ok(!edge.includes('## Flagged Projects'), 'no heading over an empty selection');
  assert.equal(warnCount(/carries a truthy "llms_featured" front-matter key/, 'edge'), 1);
  // The section-matches-nothing message still fires in this build for the
  // facts document's own 'Matches Nothing' entry, and it is a DIFFERENT line:
  // one generic message for both failures would show up here as a count of
  // two, because the two entries fail for two different reasons.
  assert.equal(warnCount(/matches no page/, 'edge'), 1, 'the other message, unchanged');
});

test('select = all beats a positive limit, and says which key won', () => {
  assert.equal(warnCount(/sets `select = "all"` together with `limit = 1`/, 'edge'), 1);
  assert.equal(
    sectionsWithTopLevelBullets(read(COMPACT, edgeDir)).get('All Blog').length,
    3,
    'the section is listed complete despite the cap',
  );
});

test('a non-numeric limit is still read as complete after the refactor', () => {
  // The parser moved into lib/llms-select.html; its contract did not. `int`
  // raises a template error on a non-numeric value, which would stop the
  // build over a config typo.
  assert.equal(warnCount(/non-numeric `limit`/, 'edge'), 1);
  assert.equal(sectionsWithTopLevelBullets(read(COMPACT, edgeDir)).get('Bad Limit').length, 3);
});

// ---- The compact file stands alone ----

test('the compact file names the complete index; the complete one does not name itself', () => {
  const compact = read(COMPACT);
  assert.deepEqual(sectionsWithTopLevelBullets(compact).get('Start here'), [
    `- [Agent Readiness Fixture](${BASE_URL}/index.md): Home page of the fixture site.`,
    `- [Complete index](${BASE_URL}/llms-index.txt): Every page of every section, complete.`,
  ]);
  const complete = read(COMPLETE);
  assert.ok(
    !complete.includes('llms-index.txt'),
    'a document that linked itself would waste the one route an agent has left',
  );
});

test('the pointer is derived, with no consumer configuration at all', () => {
  // The `minimal` build configures no llms sections, no optional entries and
  // no llms_index table. The route is still there.
  assert.match(
    read(COMPACT, minimalDir),
    /^- \[Complete index\]\(https:\/\/fixture\.example\/llms-index\.txt\): Every page of every section, complete\.$/m,
  );
});

test('every URL in the complete index resolves to a published file', () => {
  let checked = 0;
  for (const {url} of markdownLinks(read(COMPLETE))) {
    assert.ok(urlResolves(url), `llms-index.txt links ${url}, which is not published`);
    checked += 1;
  }
  assert.ok(checked > 0, 'the fixture must produce at least one link to check');
});

test('the two documents share one preamble, to the byte', () => {
  // They come from one renderer, so the H1, the summary, the build stamp and
  // the free prose are the same lines in the same order. A drift here would
  // mean two renderers had quietly appeared.
  const upTo = (text) => text.slice(0, text.indexOf('\n## '));
  assert.equal(upTo(read(COMPACT)), upTo(read(COMPLETE)));
});

test('the complete index still honors the SHARED page filter', () => {
  // "Never truncated" is about the CAP, not about the module's page
  // selection. A page excluded from every surface -- `agent: false`, the map
  // form, a noindexed page, the search page -- must not reappear here, or the
  // complete index would advertise URLs whose twins were never written.
  const complete = read(COMPLETE);
  for (const gone of ['Excluded Post', 'Map-form opt-out', 'Noindexed Post']) {
    assert.ok(!complete.includes(gone), `${gone} must stay out of every surface`);
  }
  assert.ok(!complete.includes('/search/'), 'the dedicated search page too');
  // And the explicit include override still wins, so the filter is being
  // consulted rather than a blunter rule applied.
  assert.ok(complete.includes('Noindexed but explicitly included'));
});

// ---- The publish gates ----

test('llms_index.enable = false withholds the document and the pointer, in silence', () => {
  // The format stays WIRED here, so a gate that consulted the output format
  // alone would publish a pointer to a file that does not exist. Nothing is
  // reported: the consumer switched the surface off deliberately.
  assert.ok(!exists(COMPLETE, llmsindexoffDir), 'no complete index is published');
  assert.ok(exists(COMPACT, llmsindexoffDir), 'while the compact one still is');
  assert.ok(!read(COMPACT, llmsindexoffDir).includes('llms-index.txt'), 'and does not name it');
  assert.equal(
    warnCount(/llmsindex output format/, 'llmsindexoff'),
    0,
    'no warning for a deliberate choice',
  );
});

test('an unwired format withholds the pointer and says so exactly once', () => {
  // The state every existing consumer lands in after upgrading, because a
  // site-level [outputs] key REPLACES the default list rather than extending
  // it. Left silent, the compact file would name a URL that 404s.
  assert.ok(!exists(COMPLETE, unwiredDir), 'nothing is published');
  assert.ok(!read(COMPACT, unwiredDir).includes('llms-index.txt'), 'and nothing names it');
  assert.equal(warnCount(/llmsindex output format is not wired/, 'unwired'), 1);
  // The message has to carry the fix, including the replacement hazard that
  // makes the fix non-obvious.
  const message = warnCount(/Add 'llmsindex' to your existing \[outputs\] home list/, 'unwired');
  assert.equal(message, 1, 'the warning names the edit, not just the problem');
  assert.equal(
    warnCount(/replaces the ENTIRE default home list/, 'unwired'),
    1,
    'and warns that the list replaces rather than extends',
  );
});

test('wiring NEITHER format is an opt-out, and the module says nothing about it', () => {
  // The complement of `unwired`, and the reason the warning above is gated on
  // llmstxt rather than fired whenever llmsindex is missing. `llms_index.enable`
  // ships true, so an ungated warning would also reach a site that imported the
  // module for twins and robots.txt and never asked for a link index -- and
  // every word of it would be false there: it states that /llms.txt cannot name
  // the complete index on a site that publishes no /llms.txt, and prescribes an
  // [outputs] edit for a surface never requested. Not wiring a format IS the
  // opt-out, exactly as it is for the Agent Skills index.
  assert.ok(!exists(COMPACT, nolinkindexesDir), 'no compact index is published');
  assert.ok(!exists(COMPLETE, nolinkindexesDir), 'no complete index is published');
  assert.equal(
    warnCount(/llmsindex output format is not wired/, 'nolinkindexes'),
    0,
    'and the module stays silent, because this site asked for neither document',
  );
});

test('the master switch and the llms surface switch each withhold the complete index', () => {
  // Two conjuncts above llms_index.enable, each proven by the build that
  // isolates it: `off` sets only the master switch, `llmsoff` only
  // llms.enable. The complete index renders through the same renderer as the
  // compact one, so the llms surface switch governs both documents.
  assert.ok(!exists(COMPLETE, offDir), 'the master switch withholds it');
  assert.ok(!exists(COMPLETE, llmsoffDir), 'and so does llms.enable');
  assert.ok(!exists(COMPACT, llmsoffDir), 'together with the compact file');
});

test('with the twins off, the complete index falls back to HTML permalinks', () => {
  // The same rule the compact file follows, through the same shared entry
  // builder: `markdown` stays wired in this build, so a listing that trusted
  // the output format would advertise a twin for every page that has none.
  const complete = read(COMPLETE, notwinsDir);
  assert.ok(!complete.includes('/index.md'), 'no twin URL for a file that was never written');
  assert.match(complete, /^- \[Post One\]\(https:\/\/fixture\.example\/blog\/post-one\/\)/m);
});

test('the complete index publishes per language, and each language names its own', () => {
  // `root` is deliberately unset on the format, exactly as it is on llmstxt:
  // the two documents come from one page walk and must publish together, per
  // language, rather than having every language overwrite one path.
  assert.ok(exists(COMPLETE, multilingualDir));
  assert.ok(exists(`ru/${COMPLETE}`, multilingualDir));
  assert.match(
    read(COMPACT, multilingualDir),
    /^- \[Complete index\]\(https:\/\/fixture\.example\/llms-index\.txt\)/m,
  );
  // The Russian tree names the Russian file under the translated label, which
  // is what proves the entry resolves against the RENDERING language's home
  // rather than the default site's.
  assert.match(
    read(`ru/${COMPACT}`, multilingualDir),
    /^- \[Полный индекс\]\(https:\/\/fixture\.example\/ru\/llms-index\.txt\)/m,
  );
});
