// llms.txt and the facts document, plus the cross-surface
// invariants that are the entire reason these ship as ONE module.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  read,
  exists,
  publicDir,
  configuredDir,
  minimalDir,
  notwinsDir,
  nolinkmdDir,
  edgeDir,
  multilingualDir,
  publishedTwins,
  markdownLinks,
  sectionsWithTopLevelBullets,
  siteRelative,
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

test('llms.txt items link the Markdown twins by ABSOLUTE URL', () => {
  // The module contracts `.Permalink`, not `.RelPermalink`, and the
  // reason is the document's whole purpose: llms.txt is ingested by agents
  // that routinely hold it detached from the URL they fetched it from, where
  // a relative path has no origin to resolve against. Asserting only the
  // `/index.md` suffix would pass for either form, so the origin is asserted
  // explicitly.
  const sections = sectionsWithTopLevelBullets(read('llms.txt'));
  // The Optional section is the one part of the document whose bullets are
  // NOT page twins: it carries consumer-declared links plus the module's
  // derived Agent Skills index entry. Its URLs stay covered by the
  // absolute-URL and resolution sweeps below; only the twin-shape rule
  // does not apply to them.
  sections.delete('Optional');
  let checked = 0;
  for (const bullets of sections.values()) {
    for (const line of bullets) {
      const [link] = markdownLinks(line);
      if (!link) continue;
      assert.match(link.url, /^https:\/\/fixture\.example\//, `${link.url} must be absolute`);
      assert.match(link.url, /\/index\.md$/, `${link.url} should be the twin URL`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'the fixture must produce at least one item to check');
});

test('every URL in llms.txt resolves to a published file', () => {
  for (const {url} of markdownLinks(read('llms.txt'))) {
    assert.ok(urlResolves(url), `llms.txt links ${url}, which is not published`);
  }
});

test('llms.txt emits no relative URL anywhere, including consumer-declared ones', () => {
  // The page items are the module's own; the Optional entries and the license
  // line are values a consumer writes in config. Both reach the same document,
  // so both are held to the same rule -- an agent holding this file has no
  // origin to resolve a bare /path against.
  const text = read('llms.txt');
  assert.ok(!/\]\(\/[^)]*\)/.test(text), 'no site-relative link may survive into llms.txt');
  assert.ok(!/\]\(\/[^)]*\)/.test(read('llms.txt', configuredDir)), 'nor in the configured build');
});

test('llms.txt carries the Optional section', () => {
  // `Optional` is a protocol token fixed by the convention, deliberately
  // untranslated.
  assert.match(read('llms.txt'), /^## Optional$/m);
});

test('llms.txt names the home page own twin with no consumer configuration', () => {
  // The gap this closes: llms.txt lists pages only through
  // [[llms.sections]], and section membership is a content-path prefix test
  // the home page's Path of "/" can never satisfy -- so the front door, the
  // twin an agent is most likely to fetch first, appeared nowhere in the
  // index of the machine layer, on every site that enables twins. The
  // `minimal` build is the proof that no configuration is involved: it
  // declares no llms sections at all, and the entry is still there.
  for (const [label, dir] of [
    ['baseline', publicDir],
    ['configured', configuredDir],
    ['minimal', minimalDir],
  ]) {
    const text = read('llms.txt', dir);
    assert.match(text, /^## Start here$/m, `${label} must carry the Start here heading`);
    assert.match(
      text,
      /^## Start here\n\n- \[Agent Readiness Fixture\]\(https:\/\/[^)]+\/index\.md\)/m,
      `${label} must link the home twin as the section's first bullet`,
    );
  }
});

test('the home twin entry leads the document, ahead of every configured section', () => {
  // Placement is the decision this section records, not an accident. The
  // convention defines `## Optional` as links that may be dropped when
  // context is short, and the site's front door is the last thing an agent
  // should drop -- so it gets its own H2 in first position instead, after
  // the preamble and before the sections.
  const headings = read('llms.txt')
    .split('\n')
    .filter((l) => l.startsWith('## '));
  assert.equal(headings[0], '## Start here');
  assert.equal(headings[headings.length - 1], '## Optional');
  assert.ok(headings.length > 2, 'the fixture must configure sections between the two');
});

test('the home twin entry is withheld when the twin does not publish', () => {
  // twins off: `markdown` stays wired in [outputs] but markdown.enable is
  // false, so markdown-page.html writes no bytes and Hugo publishes no
  // index.md. A heading here would advertise a 404 -- the exact failure the
  // section entries already guard against.
  const text = read('llms.txt', notwinsDir);
  assert.ok(!/^## Start here$/m.test(text), 'no heading when no twin publishes');
  assert.ok(!/\/index\.md\)/.test(text), 'and no twin URL anywhere in the document');
});

test('link_markdown false withholds the home twin entry while the twins still publish', () => {
  // The `notwins` build above proves the twins-off half through the OTHER
  // conjunct, markdown.enable. This one isolates link_markdown: the twins
  // publish normally here, so /index.md exists, and the only reason llms.txt
  // must not name it is that the consumer said not to link twins from this
  // document. Dropping that conjunct from either emitter would leave every
  // other build in the suite green.
  const text = read('llms.txt', nolinkmdDir);
  assert.ok(!/^## Start here$/m.test(text), 'no heading when the document does not link twins');
  assert.ok(!/\/index\.md\)/.test(text), 'and no twin URL in any section bullet either');
  // The section bullets fall back to HTML permalinks rather than disappearing,
  // which is what distinguishes this from a build with no sections at all.
  assert.match(text, /^- \[Post One\]\(https:\/\/fixture\.example\/blog\/post-one\/\)/m);
  // The twins themselves are untouched: the key scopes to llms.txt's link
  // shape, so the file it declines to link is still published.
  assert.ok(exists('index.md', nolinkmdDir), 'the home twin still publishes');
});

test('a consumer who declares the home twin keeps their own wording', () => {
  // The `edge` build lists the home twin by hand as '/index.md', which the
  // shared absolutizer resolves against a SUBPATH baseURL. Matching after
  // absolutization is what makes the dedup real: a raw string compare would
  // miss it and publish the entry twice under two headings.
  const text = read('llms.txt', edgeDir);
  assert.ok(!/^## Start here$/m.test(text), 'the derived entry steps aside entirely');
  assert.match(
    text,
    /^- \[Front door\]\(https:\/\/example\.org\/docs\/index\.md\): Consumer-authored entry for the home twin\.$/m,
  );
  const occurrences = text.split('https://example.org/docs/index.md').length - 1;
  assert.equal(occurrences, 1, 'the home twin URL appears exactly once');
});

test('each language names its own home twin under its own heading', () => {
  // llms.txt is not a root-only format: it renders once per language, so the
  // entry has to resolve against the RENDERING language's home page rather
  // than the default site's, and its heading is ordinary prose that gets
  // translated -- unlike `## Optional`, which is a protocol token.
  const en = read('llms.txt', multilingualDir);
  const ru = read('ru/llms.txt', multilingualDir);
  assert.match(en, /^## Start here\n\n- \[[^\]]+\]\(https:\/\/fixture\.example\/index\.md\)/m);
  assert.match(ru, /^## Начните отсюда$/m);
  assert.match(ru, /\(https:\/\/fixture\.example\/ru\/index\.md\)/);
  assert.ok(
    !/^## Start here$/m.test(ru),
    'the English heading must not leak into the Russian file',
  );
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
  // The numeric equality is the assertion that matters: a facts document
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
  assert.equal(
    facts.get('Blog').length,
    3,
    'the two ordinary posts plus the noindexed page that explicitly opts back in; the bare-shorthand and map-form opt-outs are filtered out',
  );
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
  // The fixture authors this href site-relative, as a contact page naturally
  // would; the document resolves it, because about.md is read detached from
  // the site far more often than on it.
  assert.match(text, /^- Email form: \[Contact form\]\(https:\/\/fixture\.example\/contact\/\)$/m);
  assert.match(text, /^- No URL: A channel carrying no href at all$/m);
});

test('a contact href carrying its own scheme is passed through untouched', () => {
  // Resolving only the site-relative form is the whole point: absURL applied
  // to mailto: or tel: would corrupt it into a site URL.
  const text = read('about.md');
  assert.match(text, /^- Email: \[hello@fixture\.example\]\(mailto:hello@fixture\.example\)$/m);
});

// ---- Line-oriented structural integrity ----
//
// Both documents carry their meaning in how the text divides into lines, so
// a value-borne line break is a structure change rather than text, and an
// unescaped bracket or parenthesis inside a link is the link's own syntax.
// The fixture authors post-two hostile on purpose: a title with an unbalanced
// closing bracket and a description written as a YAML block scalar whose
// continuation line begins with a list marker.

test('a multi-line description cannot add lines to llms.txt', () => {
  // Uncollapsed, the description's continuation line would publish as a list
  // entry of THIS document -- indistinguishable from a page bullet to every
  // consumer -- and a continuation starting with a heading marker would
  // publish as a heading.
  const text = read('llms.txt');
  assert.match(
    text,
    /^- \[Post Two\\\] With A Stray Bracket\]\(https:\/\/fixture\.example\/blog\/post-two\/index\.md\): A second post so section listings have more than one item\. - a continuation line that begins with a list marker$/m,
    'the whole entry, description included, is one line',
  );
  assert.ok(
    !/^- a continuation line/m.test(text),
    'no description fragment may surface as a document line of its own',
  );
});

test('a bracket in a page title cannot break the listing link text', () => {
  // CommonMark reads an unescaped "]" as the end of the link text, so the
  // raw title would end the link early and spill the rest of the line as
  // literal text in both listing documents. In a plain value position -- the
  // nested front-matter bullet -- the same bracket is ordinary text and must
  // survive unescaped.
  const about = read('about.md');
  assert.match(
    about,
    /^- \[Post Two\\\] With A Stray Bracket\]\(https:\/\/fixture\.example\/blog\/post-two\/\) \(\[Markdown\]\(https:\/\/fixture\.example\/blog\/post-two\/index\.md\)\)$/m,
  );
  assert.match(about, /^ {2}- title: Post Two\] With A Stray Bracket$/m);
});

test('parentheses in a link destination are percent-encoded', () => {
  // CommonMark ends an unwrapped link destination at the first unbalanced
  // closing parenthesis, so a raw "(reference)" URL would truncate the link
  // and leave a stray ")" as literal text. Percent-encoding is transparent
  // to the destination and changes no byte of a URL carrying no parentheses.
  assert.match(
    read('about.md'),
    /^- Reference: \[Fixture reference\]\(https:\/\/wiki\.example\/Fixture_%28reference%29\)$/m,
  );
});

test('a line break in a URL-only contact channel cannot add lines to about.md', () => {
  // When a channel carries only an href, the URL stands in for the label and
  // the link text as well as the destination, so it reaches the one plain
  // value position in the contact line. Uncollapsed, the value's second half
  // would surface as a document line of its own; collapsed, the space it
  // gains is percent-encoded where the URL is a destination.
  const text = read('about.md');
  assert.match(
    text,
    /^- https:\/\/probe\.example\/x y: \[https:\/\/probe\.example\/x y\]\(https:\/\/probe\.example\/x%20y\)$/m,
    'the whole channel, URL included, is one line',
  );
  assert.ok(
    !/^- https:\/\/probe\.example\/x$/m.test(text),
    'no fragment of the value may become a line of its own',
  );
});

test('with facts.sections empty, the document keeps identity and contact and emits no section H2', () => {
  // The documented contract: "With [params.agent.facts]
  // sections = [], the document emits its identity and contact blocks and no
  // section H2, without error." Neither of the other environments can reach
  // that state, because both configure sections.
  const text = read('about.md', minimalDir);
  const headings = text.split('\n').filter((l) => l.startsWith('## '));

  assert.ok(headings.includes('## Identity'), 'the identity block survives');
  assert.ok(headings.includes('## Contact'), 'the contact block survives');
  for (const gone of ['## Blog', '## Projects']) {
    assert.ok(!headings.includes(gone), `${gone} must not appear with no sections configured`);
  }
  assert.match(text, /^# /m, 'the document still opens with its H1');
  assert.ok(text.endsWith('\n'), 'a text document ends with a newline');
});

test('the present sentinel renders as prose in the facts document', () => {
  // Deliberately unlike the twin front matter, which omits it: this document
  // is read as prose, and "present" is a true thing to say about an open range.
  assert.match(read('about.md'), /^ {2}- period_to: present$/m);
});

test('every on-site URL in about.md resolves to a published file', () => {
  // Off-site links and non-http schemes (mailto:, tel:) are consumer-authored
  // destinations this module neither owns nor publishes; only what claims to
  // be on this site has to exist on it.
  let checked = 0;
  for (const {url} of markdownLinks(read('about.md'))) {
    if (!url.startsWith('https://fixture.example')) continue;
    assert.ok(urlResolves(url), `about.md links ${url}, which is not published`);
    checked += 1;
  }
  assert.ok(checked > 0, 'the fixture must produce at least one on-site link to check');
});

test('CROSS-SURFACE: the twin set equals the set llms.txt lists', () => {
  // The single invariant that justifies shipping five artifacts as one
  // module. If these ever diverge, the site advertises a URL its own twins
  // never emit.
  const listed = new Set(
    [...sectionsWithTopLevelBullets(read('llms.txt')).values()]
      .flat()
      .map((line) => markdownLinks(line)[0]?.url)
      .filter((u) => u && u.endsWith('/index.md'))
      .map(siteRelative),
  );
  const published = new Set(publishedTwins(publicDir));

  assert.ok(listed.size > 0, 'the fixture must list at least one twin');
  for (const url of listed) {
    assert.ok(published.has(url), `llms.txt lists ${url}, which has no published twin`);
  }
});

test('the trailing pointer section resolves through the output formats', () => {
  const text = read('about.md');
  assert.match(text, /^## Sitemap$/m);
  assert.match(text, /\[llms\.txt\]\(https:\/\/fixture\.example\/llms\.txt\)/);
  assert.ok(
    !/\]\(\/[^)]*\)/.test(text),
    'about.md must not mix relative URLs into a document whose sitemap pointer can only be absolute',
  );
});
