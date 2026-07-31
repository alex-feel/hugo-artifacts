// The member roster a SECTION twin carries between its body and the trailing
// pointer block.
//
// A section twin is the surface that hands an agent the section's complete
// member roster in one fetch. A consuming site whose section _index.md files
// are front-matter-only would otherwise publish section twins with EMPTY
// bodies -- no roster at all -- which answers "what pages does this section
// hold" with silence while looking deliberate. Membership comes from the
// SHARED page filter narrowed to the section's path at a segment boundary,
// so the roster is the identical set llms.txt and about.md list for that
// section and the surfaces can never disagree about which pages exist.
//
// The `nosectionpages` build is the byte-for-byte control: it layers the ONE
// key `section_pages = false` over the default configuration, so stripping
// the roster block from a baseline section twin must reproduce that build's
// twin exactly, and every non-section twin must be byte-identical between
// the two builds.
import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
import {parse as parseYaml} from 'yaml';
import {
  read,
  exists,
  publicDir,
  nosectionpagesDir,
  paginatedDir,
  markdownLinks,
  sectionsWithTopLevelBullets,
  splitFrontMatter,
  urlResolves,
} from './helpers.js';

// Mutation-to-test attribution rests entirely on test titles: a red result
// must trace to exactly one test, so a reused title makes it untraceable.
const registeredTitles = [];
function test(title, fn) {
  registeredTitles.push(title);
  return nodeTest(title, fn);
}

// The i18n default heading; both fixtures build in English.
const HEADING = 'Pages';

// The roster block as one contiguous byte run: blank line, heading, blank
// line, then one `- ` bullet per member, each line terminated. This is the
// exact shape markdown-page.html assembles, which is what lets the
// byte-for-byte control below excise it and nothing else.
const ROSTER_BLOCK = new RegExp(`\\n\\n## ${HEADING}\\n\\n(?:- [^\\n]*\\n)+`, 'g');

const rosterBullets = (rel, dir = publicDir) =>
  sectionsWithTopLevelBullets(read(rel, dir)).get(HEADING) ?? [];

test('a section twin carries its roster between the body and the pointer block', () => {
  for (const rel of ['blog/index.md', 'projects/index.md']) {
    const text = read(rel);
    const roster = text.indexOf(`## ${HEADING}`);
    const pointer = text.indexOf('## Sitemap');
    assert.ok(roster !== -1, `${rel} must carry a roster heading`);
    assert.ok(pointer !== -1, `${rel} must still carry the pointer block`);
    assert.ok(roster < pointer, `${rel} must place the roster before the pointer block`);
  }
});

test('each roster lists exactly the pages the shared filter admits for that section', () => {
  // The numeric equality is the assertion that matters, exactly as it is for
  // the facts document: a truncated roster answers the one-fetch question
  // wrongly while appearing to answer it. llms.txt's Blog and Projects
  // sections are complete listings of the same shared filter (limit = 0), so
  // the roster must carry the same count AND the same twin URLs.
  const llms = sectionsWithTopLevelBullets(read('llms.txt'));
  for (const [rel, section] of [
    ['blog/index.md', 'Blog'],
    ['projects/index.md', 'Projects'],
  ]) {
    const roster = rosterBullets(rel);
    assert.equal(
      roster.length,
      llms.get(section).length,
      `${rel} must list the same number of pages llms.txt lists for ${section}`,
    );
    const rosterUrls = roster.map((line) => markdownLinks(line)[0]?.url).sort();
    const llmsUrls = llms
      .get(section)
      .map((line) => markdownLinks(line)[0]?.url)
      .sort();
    assert.deepEqual(rosterUrls, llmsUrls, `${rel} must link the same twins llms.txt links`);
  }
  assert.equal(
    rosterBullets('blog/index.md').length,
    3,
    'the two ordinary posts plus the noindexed page that explicitly opts back in',
  );
  assert.equal(rosterBullets('projects/index.md').length, 2);
});

test('roster URLs are absolute twin URLs that resolve to published files', () => {
  // Absolute for the same reason every machine-read URL in this module is: a
  // twin is routinely read detached from the site it came from, where a
  // relative path has no origin to resolve against. The twin URL rather than
  // the HTML permalink because the markdown format is wired for the page
  // kind and every admitted member publishes one.
  let checked = 0;
  for (const rel of ['blog/index.md', 'projects/index.md']) {
    for (const line of rosterBullets(rel)) {
      const [link] = markdownLinks(line);
      assert.ok(link, `${rel} roster line ${line} must carry a link`);
      assert.match(link.url, /^https:\/\/fixture\.example\//, `${link.url} must be absolute`);
      assert.match(link.url, /\/index\.md$/, `${link.url} must be the member's twin URL`);
      assert.ok(urlResolves(link.url), `${rel} lists ${link.url}, which is not published`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'the fixture must produce at least one roster line to check');
});

test('an excluded page appears in no roster', () => {
  // The shared filter is the membership authority, so every exclusion it
  // honors -- `agent: false` in both spellings, `robots: noindex`, the
  // search page -- must be invisible to the roster too.
  const rosters = ['blog/index.md', 'projects/index.md']
    .map((rel) => rosterBullets(rel).join('\n'))
    .join('\n');
  for (const slug of ['excluded', 'noindexed', 'opt-out-map', 'search']) {
    assert.ok(!rosters.includes(`/${slug}/`), `no roster may list the excluded page ${slug}`);
  }
});

test('the home twin carries no roster', () => {
  // Every regular page sits under "/", so a home roster would enumerate the
  // whole site -- and that site-level enumeration is llms.txt's job.
  assert.ok(!read('index.md').includes(`## ${HEADING}`));
});

test('a hostile title and a multi-line description stay one roster line', () => {
  // The same integrity lock the listing documents carry: post-two's title
  // ends with an unbalanced bracket and its description is a block scalar
  // whose continuation line begins with a list marker. Uncollapsed, the
  // continuation would publish as a roster entry of its own.
  const text = read('blog/index.md');
  assert.match(
    text,
    /^- \[Post Two\\\] With A Stray Bracket\]\(https:\/\/fixture\.example\/blog\/post-two\/index\.md\): A second post so section listings have more than one item\. - a continuation line that begins with a list marker$/m,
    'the whole roster entry, description included, is one line',
  );
  assert.ok(
    !/^- a continuation line/m.test(text),
    'no description fragment may surface as a roster line of its own',
  );
});

test('the paginated section roster lists all five members and no pager URL', () => {
  // The complete-roster contract under the one shape that could truncate it:
  // a section Hugo splits across pagers. The roster ranges the shared filter
  // rather than any paginator, so all five members appear in the one section
  // twin and no pager shell leaks in.
  const bullets = rosterBullets('posts/index.md', paginatedDir);
  const urls = bullets.map((line) => markdownLinks(line)[0]?.url).sort();
  assert.deepEqual(
    urls,
    [1, 2, 3, 4, 5].map((n) => `https://paginated.example/posts/post-${n}/index.md`),
    'the roster must list every member of the paginated section exactly once',
  );
  for (const url of urls) {
    assert.ok(!url.includes('/page/'), `the roster advertised the pager URL ${url}`);
  }
});

test('section_pages = false restores the pre-roster twin byte for byte', () => {
  // The control build differs from baseline in the ONE key, so excising the
  // roster block from a baseline section twin must reproduce the control's
  // twin exactly -- proving the switch restores the previous output and the
  // roster occupies one contiguous, cleanly removable block.
  for (const rel of ['blog/index.md', 'projects/index.md']) {
    const on = read(rel);
    const off = read(rel, nosectionpagesDir);
    const blocks = on.match(ROSTER_BLOCK) ?? [];
    assert.equal(blocks.length, 1, `${rel} must carry exactly one roster block`);
    assert.equal(
      on.replace(ROSTER_BLOCK, ''),
      off,
      `${rel} minus its roster must equal the control build's twin`,
    );
    assert.ok(!off.includes(`## ${HEADING}`), `${rel} must carry no roster in the control build`);
  }
});

test('the roster key touches no twin outside the section kind', () => {
  // Every non-section twin must be byte-identical between the two builds:
  // the switch governs the section roster and nothing else.
  for (const rel of ['index.md', 'blog/post-one/index.md', 'projects/alpha/index.md']) {
    assert.ok(exists(rel, nosectionpagesDir), `${rel} must be published in the control build`);
    assert.equal(
      read(rel),
      read(rel, nosectionpagesDir),
      `${rel} must be byte-identical across the builds`,
    );
  }
});

test('a rostered section twin still parses under strict YAML with duplicate-key detection', () => {
  // The roster lives in the body, so the front matter must be untouched --
  // asserted in the one build 02-twins.spec.js never reads as well as in the
  // baseline it does.
  for (const dir of [publicDir, nosectionpagesDir]) {
    for (const rel of ['blog/index.md', 'projects/index.md']) {
      const {frontMatter} = splitFrontMatter(read(rel, dir));
      assert.ok(frontMatter, `${rel} must carry a front-matter block`);
      assert.doesNotThrow(() => parseYaml(frontMatter, {uniqueKeys: true, strict: true}));
    }
  }
});

test('every test title in this file is unique', () => {
  assert.equal(
    new Set(registeredTitles).size,
    registeredTitles.length,
    'a duplicated title makes a red result untraceable to the assertion that produced it',
  );
});
