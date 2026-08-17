// Paginated list pages are the class this module exists for. They are absent
// from site.Pages, from every page's output formats and from the sitemap, so a
// coverage check built on a sitemap can never see one disappear -- which is how
// an indexed /blog/page/4/ turns into a 404 with every check green.
//
// The FIRST pager is a second failure on the same URLs. Hugo publishes
// /blog/page/1/ as an alias of the list page for every list a template
// paginates, and `[pagination] disableAliases = true` -- which this module's
// installation instructions require -- stops it writing that file. Nothing in
// .Aliases replaces it, because the paginator minted it, so adopting the module
// would 404 a URL that answered 200 until the rule below existed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  baselineDir,
  manifest,
  pagerpathDir,
  pagerUrls,
  publishedUrls,
  readDoc,
  redirectRules,
  uglyDir,
} from './helpers.js';

// The home page and both sections paginate; the taxonomy templates do not.
const REGISTERED = [
  ['/page/1/', '/'],
  ['/notes/page/1/', '/notes/'],
  ['/posts/page/1/', '/posts/'],
];

test('the fixture actually publishes pager pages', () => {
  assert.deepEqual(pagerUrls(baselineDir), [
    '/page/2/',
    '/page/3/',
    '/page/4/',
    '/posts/page/2/',
    '/posts/page/3/',
  ]);
});

test('the sitemap contains none of them, which is the defect this module answers', () => {
  const sitemap = readDoc(baselineDir, 'sitemap.xml');
  for (const url of pagerUrls(baselineDir))
    assert.ok(!sitemap.includes(url), `${url} is in the sitemap; the premise no longer holds`);
});

test('the manifest contains every one of them', () => {
  const {urls} = manifest(baselineDir);
  for (const url of pagerUrls(baselineDir))
    assert.ok(urls.includes(url), `${url} is published but missing from the manifest`);
});

// The site's own list template registers them, passing the paginator it already
// built. Reaching for a foreign page's paginator instead would either raise
// (in a non-html output format) or CREATE one, publishing pager pages the site
// never asked for -- so the fixture's registration is the only thing that can
// have put these URLs in the manifest.
test('registration adds the pagers and nothing else', () => {
  const {urls} = manifest(baselineDir);
  const pagers = urls.filter((u) => /\/page\/\d+\/$/.test(u));
  assert.deepEqual(pagers, pagerUrls(baselineDir));
});

test('every registered paginator gets a rule from its first pager to its list page', () => {
  const rules = redirectRules(baselineDir);
  for (const [from, to] of REGISTERED) {
    const slash = rules.find((r) => r.from === from);
    assert.ok(slash, `${from} has no rule; adopting the module would 404 it`);
    assert.equal(slash.to, to);
    const bare = rules.find((r) => r.from === from.replace(/\/$/, ''));
    assert.ok(bare, `${from} was emitted in one spelling only`);
    assert.equal(bare.to, to);
  }
});

// A rule is worth nothing if the file it competes with still exists, which is
// the whole reason the installation instructions demand the pagination switch.
test('none of those URLs is published, so the rule is the only thing serving them', () => {
  const published = publishedUrls(baselineDir);
  for (const [from] of REGISTERED)
    assert.ok(!published.includes(from), `${from} is a published file; the rule can never fire`);
});

test('every rule points at a URL the build actually publishes', () => {
  const published = publishedUrls(baselineDir);
  for (const [, to] of REGISTERED)
    assert.ok(published.includes(to), `${to} is a redirect target that publishes nothing`);
});

// /notes/ holds two pages against a pagerSize of two, so it has ONE pager and
// publishes no /notes/page/2/ at all. Hugo still publishes its /notes/page/1/
// alias, and .Pagers still reports a single pager whose URL is /notes/ -- so a
// module that emitted a rule only where it saw a second pager would strand
// every small list on the site.
test('a list that fits on one pager is registered like any other', () => {
  assert.ok(
    !publishedUrls(baselineDir).includes('/notes/page/2/'),
    '/notes/ grew a second pager; it is no longer the single-pager case',
  );
  assert.ok(redirectRules(baselineDir).some((r) => r.from === '/notes/page/1/'));
});

// The segment between a list and a pager number is Hugo's `[pagination] path`,
// which is configurable, localizable, and unreadable from a template. This
// build renames it and tells the module nothing, so every rule below carrying
// `seite` was read off the second pager of /posts/ -- the shipped default is
// `page`, and no key in this environment says otherwise.
test('the pagination segment is read off the site, not assumed', () => {
  const byFrom = new Map(redirectRules(pagerpathDir).map((r) => [r.from, r.to]));
  assert.equal(byFrom.get('/posts/seite/1/'), '/posts/');
  assert.equal(byFrom.get('/seite/1/'), '/');
  for (const from of byFrom.keys())
    assert.ok(!from.includes('/page/1'), `${from} used the shipped default over the site's own`);
});

// /notes/ fits on one pager, so its own paginator names no segment at all --
// and the segment is a per-LANGUAGE setting, so the one /posts/ named is the
// one that applies. Without that, every small list on a site that renamed the
// segment would get a rule for a URL it never served.
test('a list that cannot name the segment gets the one its language derived', () => {
  assert.ok(
    !publishedUrls(pagerpathDir).includes('/notes/seite/2/'),
    '/notes/ grew a second pager and can now name the segment itself',
  );
  assert.equal(
    redirectRules(pagerpathDir).find((r) => r.from === '/notes/seite/1/')?.to,
    '/notes/',
  );
});

// Under uglyURLs the URL Hugo REPORTS and the URL it SERVES come apart: a list
// page reports /posts/index.html and a pager reports /posts/page/2/index.html,
// while the first-pager stub is still published at the directory
// /posts/page/1/. A rule built by pasting the segment onto the reported URL
// would read /posts/index.htmlpage/1/ and match nothing.
test('a build whose reported URLs are not its served ones still gets usable rules', () => {
  assert.ok(
    publishedUrls(uglyDir).includes('/posts/page/2/'),
    'the fixture premise changed: pagers are no longer served at directories here',
  );
  const byFrom = new Map(redirectRules(uglyDir).map((r) => [r.from, r.to]));
  // The targets follow Hugo's own stub, which points at the page's permalink.
  assert.equal(byFrom.get('/posts/page/1/'), '/posts/index.html');
  assert.equal(byFrom.get('/page/1/'), '/index.html');
  for (const from of byFrom.keys())
    assert.ok(!from.includes('index.html'), `${from} pasted the segment onto a reported URL`);
});

// The taxonomy templates render a list without paginating it, so Hugo mints no
// /page/1/ for them and the module must invent none: a rule for a URL the site
// never served is noise in a file capped at 2,000 rules.
test('a list page that never paginated gets no rule and no warning', () => {
  const published = publishedUrls(baselineDir);
  assert.ok(published.includes('/tags/') && published.includes('/tags/alpha/'));
  for (const rule of redirectRules(baselineDir))
    assert.ok(!rule.from.startsWith('/tags/'), `${rule.from} claims an unpaginated list page`);
});
