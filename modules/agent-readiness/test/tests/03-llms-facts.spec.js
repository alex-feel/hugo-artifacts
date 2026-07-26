// Phases 4 and 5 -- llms.txt and the facts document, plus the cross-surface
// invariants that are the entire reason these ship as ONE module.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  read,
  exists,
  publicDir,
  configuredDir,
  publishedTwins,
  markdownLinks,
  sectionsWithTopLevelBullets,
  urlResolves,
} from './helpers.js';

const countH1 = (text) => text.split('\n').filter((l) => /^# /.test(l)).length;

test('llms.txt publishes as .txt, not .md', () => {
  // text/plain is deliberate: text/markdown's suffixes are md, mdown,
  // markdown, so baseName 'llms' would publish llms.md.
  assert.ok(exists('llms.txt'));
  assert.ok(!exists('llms.md'));
});

test('llms.txt starts with exactly one H1', () => {
  const text = read('llms.txt');
  assert.ok(text.startsWith('# '), 'the document opens with its H1');
  assert.equal(countH1(text), 1);
});

test('both authored section shapes produce a non-empty item list', () => {
  // The fixture configures one section by bare name (`blog`) and one by
  // slashed form (`/projects/`). An unnormalized mismatch renders an empty
  // H2 with no warning, no error and exit 0 -- the quietest failure this
  // module can have, which is why it is asserted rather than eyeballed.
  const sections = sectionsWithTopLevelBullets(read('llms.txt'));
  for (const name of ['Blog', 'Projects']) {
    assert.ok(sections.has(name), `llms.txt must carry a ${name} section`);
    assert.ok(sections.get(name).length > 0, `the ${name} section must not be empty`);
  }
});

test('llms.txt items link the Markdown twins', () => {
  const sections = sectionsWithTopLevelBullets(read('llms.txt'));
  for (const bullets of sections.values()) {
    for (const line of bullets) {
      const [link] = markdownLinks(line);
      if (!link || link.url.startsWith('/sitemap')) continue;
      assert.match(link.url, /\/index\.md$/, `${link.url} should be the twin URL`);
    }
  }
});

test('every URL in llms.txt resolves to a published file', () => {
  for (const {url} of markdownLinks(read('llms.txt'))) {
    assert.ok(urlResolves(url), `llms.txt links ${url}, which is not published`);
  }
});

test('llms.txt carries the Optional section', () => {
  // `Optional` is a protocol token fixed by the convention, deliberately
  // untranslated.
  assert.match(read('llms.txt'), /^## Optional$/m);
});

test('the llms.txt license line is inert unset and exact when configured', () => {
  assert.equal(
    read('llms.txt')
      .split('\n')
      .filter((l) => l.startsWith('> Content licensed under ')).length,
    0,
    'no license line when the keys are unset',
  );

  const configured = read('llms.txt', configuredDir);
  const lines = configured.split('\n');
  const licenseLines = lines.filter((l) => /^> Content licensed under /.test(l));
  assert.equal(licenseLines.length, 1, 'exactly one license line');
  assert.equal(
    licenseLines[0],
    '> Content licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).',
    'the WHOLE line is matched: guarding on the URL alone would let an empty name ship [](url)',
  );
  assert.ok(
    lines.indexOf(licenseLines[0]) < lines.findIndex((l) => l.startsWith('## ')),
    'the license line precedes the first section heading',
  );
});

test('about.md exists and carries exactly one H1', () => {
  assert.ok(exists('about.md'), 'the agentfacts format publishes about.md, not about.markdown');
  assert.equal(countH1(read('about.md')), 1);
});

test('each facts section lists EVERY page the shared filter admits', () => {
  // The numeric equality is the assertion Plan A asks for: a facts document
  // that truncates answers the one-fetch question wrongly while appearing to
  // answer it, and facts sections carry no limit key precisely so this can
  // never drift.
  const facts = sectionsWithTopLevelBullets(read('about.md'));
  const llms = sectionsWithTopLevelBullets(read('llms.txt'));
  for (const name of ['Blog', 'Projects']) {
    assert.equal(
      facts.get(name).length,
      llms.get(name).length,
      `about.md and llms.txt must list the same number of ${name} pages`,
    );
  }
  assert.equal(facts.get('Blog').length, 2, 'excluded and noindexed pages are filtered out');
  assert.equal(facts.get('Projects').length, 2);
});

test('the identity block renders configured labels, and omits absent keys', () => {
  const text = read('about.md');
  assert.match(text, /^- \*\*Role\*\*: Fixture Maintainer \/ Test Author$/m);
  assert.match(text, /^- \*\*Based in\*\*: Testville, Nowhere$/m);
  assert.ok(
    !text.includes('Nonexistent'),
    'a row whose key is absent from the page is omitted silently',
  );
});

test('the contact block reads the real contact page, including a URL-less entry', () => {
  const text = read('about.md');
  assert.match(text, /^- Email form: \[Contact form\]\(\/contact\/\)$/m);
  assert.match(text, /^- No URL: A channel carrying no href at all$/m);
});

test('the present sentinel renders as prose in the facts document', () => {
  // Deliberately unlike the twin front matter, which omits it: this document
  // is read as prose, and "present" is a true thing to say about an open range.
  assert.match(read('about.md'), /^ {2}- period_to: present$/m);
});

test('every URL in about.md resolves to a published file', () => {
  for (const {url} of markdownLinks(read('about.md'))) {
    if (url.startsWith('http') && !url.startsWith('https://fixture.example')) continue;
    assert.ok(urlResolves(url), `about.md links ${url}, which is not published`);
  }
});

test('CROSS-SURFACE: the twin set equals the set llms.txt lists', () => {
  // The single invariant that justifies shipping five artifacts as one
  // module. If these ever diverge, the site advertises a URL its own twins
  // never emit.
  const listed = new Set(
    [...sectionsWithTopLevelBullets(read('llms.txt')).values()]
      .flat()
      .map((line) => markdownLinks(line)[0]?.url)
      .filter((u) => u && u.endsWith('/index.md')),
  );
  const published = new Set(publishedTwins(publicDir));

  for (const url of listed) {
    assert.ok(published.has(url), `llms.txt lists ${url}, which has no published twin`);
  }
});

test('the trailing pointer section resolves through the output formats', () => {
  const text = read('about.md');
  assert.match(text, /^## Sitemap$/m);
  assert.match(text, /\[llms\.txt\]\(\/llms\.txt\)/);
});
