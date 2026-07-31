// What the enumerating surfaces publish for a section Hugo splits across
// pagers.
//
// A pager (/posts/page/2/) is a VIEW of one section rather than a page of the
// site: it carries no content of its own, its identity resolves back to
// /posts/, and Hugo renders no Markdown twin for it. Every surface that lists
// pages therefore has to enumerate the section's REGULAR pages and nothing
// else. The module reaches that shape today because the shared selector
// ranges site.RegularPages; these assertions pin the published result, so a
// later switch to a broader collection (.Pages, .Site.Pages, a paginator's
// own pages) is caught as a changed document rather than shipping as a set of
// duplicate entries whose Markdown twins do not exist.
//
// The paginated fixture is a fixture of its own rather than another
// environment: pagination is driven by a list.html that calls .Paginate and by
// a content tree that spills past pagerSize, and layouts and content are
// per-fixture. It also leaves the section allow-list unset, because the
// default fixture pins `sections` to blog and projects, which would drop a
// paginated section from every surface and make all of this pass for the
// wrong reason.
import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
import {exists, markdownLinks, paginatedDir, read, siteRelative, urlResolves} from './helpers.js';

// Mutation-to-test attribution rests entirely on test titles: a red result
// must trace to exactly one test, so a reused title makes it untraceable.
const registeredTitles = [];
function test(title, fn) {
  registeredTitles.push(title);
  return nodeTest(title, fn);
}

const POSTS = ['post-1', 'post-2', 'post-3', 'post-4', 'post-5'];

// Every URL a document advertises, as site-relative paths.
function advertisedPaths(doc) {
  return markdownLinks(read(doc, paginatedDir)).map((link) => siteRelative(link.url));
}

test('the fixture really does publish pager shells, and they resolve to the section', () => {
  // The premise every other assertion in this file rests on. Without it, a
  // fixture that quietly stopped paginating would leave the rest of the file
  // asserting the absence of URLs nothing was ever able to emit.
  for (const pager of ['posts/page/2/index.html', 'posts/page/3/index.html']) {
    assert.ok(exists(pager, paginatedDir), `${pager} was not published`);
  }
  const second = read('posts/page/2/index.html', paginatedDir);
  assert.match(
    second,
    /pager=2 url=\/posts\/page\/2\/ self=\/posts\//,
    'the second pager must carry the pager URL while its own identity stays /posts/',
  );
  for (const slug of POSTS) {
    assert.ok(exists(`posts/${slug}/index.html`, paginatedDir), `posts/${slug} was not published`);
  }
});

test('llms.txt lists the five regular pages and no pager URL', () => {
  const paths = advertisedPaths('llms.txt');
  assert.deepEqual(
    paths.sort(),
    POSTS.map((slug) => `/posts/${slug}/index.md`).sort(),
    'llms.txt must enumerate exactly the section-s regular pages',
  );
  for (const path of paths) {
    assert.ok(!path.includes('/page/'), `llms.txt advertised the pager URL ${path}`);
  }
});

test('about.md lists the five regular pages and no pager URL', () => {
  const paths = advertisedPaths('about.md').filter((path) => path.startsWith('/posts/'));
  assert.deepEqual(
    paths.sort(),
    POSTS.flatMap((slug) => [`/posts/${slug}/`, `/posts/${slug}/index.md`]).sort(),
    'about.md must pair each regular page with its own twin and list no pager',
  );
  for (const path of advertisedPaths('about.md')) {
    assert.ok(!path.includes('/page/'), `about.md advertised the pager URL ${path}`);
  }
});

test('every URL the paginated build advertises resolves to a published file', () => {
  // A pager URL that leaked into a document would resolve (Hugo publishes
  // the shell), so this is not the pager assertion -- it is the guarantee
  // that the enumeration above is the complete published set rather than a
  // filtered view of a larger, partly broken one.
  for (const doc of ['llms.txt', 'about.md']) {
    for (const path of advertisedPaths(doc)) {
      assert.ok(
        urlResolves(path, paginatedDir),
        `${doc} advertised ${path}, which was not published`,
      );
    }
  }
});

test('no Markdown twin is published for a pager shell', () => {
  // The twin is the document an agent fetches instead of the HTML page. A
  // pager has no content of its own, so a twin at a pager path would either
  // duplicate the section twin under a second URL or claim a page that does
  // not exist.
  for (const pager of ['posts/page/1', 'posts/page/2', 'posts/page/3']) {
    assert.ok(
      !exists(`${pager}/index.md`, paginatedDir),
      `${pager}/index.md was published for a pager shell`,
    );
  }
  assert.ok(
    exists('posts/index.md', paginatedDir),
    'the section twin itself must still be published',
  );
});

test('the section twin canonical names the section rather than a pager', () => {
  assert.match(
    read('posts/index.md', paginatedDir),
    /^canonical: "https:\/\/paginated\.example\/posts\/"$/m,
    'the section twin must point at /posts/, the identity a pager render resolves to',
  );
});

test('the Agent Skills index of the paginated build names no pager URL', () => {
  const doc = JSON.parse(read('.well-known/agent-skills/index.json', paginatedDir));
  assert.ok(
    Array.isArray(doc.skills) && doc.skills.length > 0,
    'no skill was indexed. If this run had no network access, the module correctly omitted it; these specs require network.',
  );
  for (const entry of doc.skills) {
    assert.ok(!entry.url.includes('/page/'), `the skills index advertised ${entry.url}`);
    assert.ok(exists(entry.url.replace(/^\//, ''), paginatedDir), `${entry.url} was not published`);
  }
});

test('every test title in this file is unique', () => {
  assert.equal(
    new Set(registeredTitles).size,
    registeredTitles.length,
    'a duplicated title makes a red result untraceable to the assertion that produced it',
  );
});
