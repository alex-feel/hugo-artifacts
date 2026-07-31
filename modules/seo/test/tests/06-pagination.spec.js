// Pagination: the URL that served the document.
//
// Hugo re-renders ONE list Page object for every pager, and .Permalink stays
// pinned to pager one on all of them. Every URL the module emits therefore
// has two candidate values on /posts/page/2/ -- the page's permalink and the
// URL the document is actually published at -- and only the second one is a
// correct self-reference. When the first is emitted, /posts/ and
// /posts/page/2/ publish the same canonical, the same og:url and a
// byte-identical JSON-LD node graph, so two published documents declare one
// identity.
//
// The `pagination` environment is a two-language site so the hreflang cluster
// is observable too: the cluster served at /posts/page/2/ must name
// /posts/page/2/ and /de/posts/page/2/, not the two pager-one URLs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, exists, graph, linkRels, paginationDir} from './helpers.js';

const BASE = 'https://seo-fixture.example';

const EN_PAGE1 = 'posts/index.html';
const EN_PAGE2 = 'posts/page/2/index.html';
const DE_PAGE1 = 'de/posts/index.html';
const DE_PAGE2 = 'de/posts/page/2/index.html';

const meta = (rel, property) =>
  dom(rel, paginationDir)
    .querySelectorAll(`meta[property="${property}"]`)
    .map((el) => el.getAttribute('content'));

const canonicals = (rel) =>
  linkRels(rel, paginationDir)
    .filter((l) => l.rel === 'canonical')
    .map((l) => l.href);

const hreflangs = (rel) =>
  dom(rel, paginationDir)
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .map((el) => ({lang: el.getAttribute('hreflang'), href: el.getAttribute('href')}));

const nodeOfType = (rel, type) => graph(rel, paginationDir).find((n) => n['@type'] === type);

test('the fixture publishes the pagers its list template asked for', () => {
  // The list template calls .Paginate with an explicit collection and an
  // explicit pager size of 2, while the site config sets pagerSize = 4. Four
  // posts therefore publish exactly two pagers. If anything else -- a module
  // head partial reaching for .Paginator, say -- built this page's paginator
  // first, Hugo would hand the list template that cached paginator instead,
  // the site defaults would win, and this section would publish a single
  // pager listing four entries.
  assert.ok(exists(EN_PAGE2, paginationDir), '/posts/page/2/ must be published');
  assert.ok(!exists('posts/page/3/index.html', paginationDir), 'and no third pager');
  for (const rel of [EN_PAGE1, EN_PAGE2, DE_PAGE1, DE_PAGE2]) {
    const items = dom(rel, paginationDir).querySelectorAll('ul.posts li');
    assert.equal(items.length, 2, `${rel} must list the two entries of its own pager`);
  }
});

test('a pager document self-references in canonical and og:url', () => {
  for (const [rel, url] of [
    [EN_PAGE2, `${BASE}/posts/page/2/`],
    [DE_PAGE2, `${BASE}/de/posts/page/2/`],
  ]) {
    assert.deepEqual(canonicals(rel), [url], `${rel}: one canonical, naming its own URL`);
    assert.deepEqual(meta(rel, 'og:url'), [url], `${rel}: og:url names the same URL`);
  }
});

test('a pager document publishes its own JSON-LD identity', () => {
  for (const [rel, url] of [
    [EN_PAGE2, `${BASE}/posts/page/2/`],
    [DE_PAGE2, `${BASE}/de/posts/page/2/`],
  ]) {
    const webpage = nodeOfType(rel, 'CollectionPage');
    assert.ok(webpage, `${rel}: a CollectionPage node is emitted`);
    assert.equal(webpage['@id'], `${url}#webpage`, `${rel}: the WebPage @id names its own URL`);
    assert.equal(webpage.url, url, `${rel}: the WebPage url names its own URL`);
    assert.equal(
      webpage.breadcrumb['@id'],
      `${url}#breadcrumb`,
      `${rel}: the breadcrumb reference names its own URL`,
    );
    const breadcrumb = nodeOfType(rel, 'BreadcrumbList');
    assert.ok(breadcrumb, `${rel}: a BreadcrumbList node is emitted`);
    assert.equal(breadcrumb['@id'], `${url}#breadcrumb`, `${rel}: and it carries the same @id`);
  }
});

test('the two pager documents do not share one JSON-LD identity', () => {
  const first = nodeOfType(EN_PAGE1, 'CollectionPage');
  const second = nodeOfType(EN_PAGE2, 'CollectionPage');
  assert.notEqual(first['@id'], second['@id'], 'pager one and pager two are distinct nodes');
  assert.notEqual(first.url, second.url, 'and they publish distinct urls');
});

test('the hreflang cluster on a pager names the pager URLs', () => {
  for (const [rel, self, other] of [
    [EN_PAGE2, `${BASE}/posts/page/2/`, `${BASE}/de/posts/page/2/`],
    [DE_PAGE2, `${BASE}/de/posts/page/2/`, `${BASE}/posts/page/2/`],
  ]) {
    const cluster = hreflangs(rel);
    const hrefs = cluster.map((l) => l.href);
    assert.ok(hrefs.includes(self), `${rel}: the serving URL is declared`);
    assert.ok(hrefs.includes(other), `${rel}: the translated pager URL is declared`);
    assert.equal(
      cluster.find((l) => l.lang === 'x-default')?.href,
      `${BASE}/posts/page/2/`,
      `${rel}: x-default names the default-language pager`,
    );
    const selfEntry = cluster.find((l) => l.href === self);
    assert.equal(
      selfEntry.lang,
      rel.startsWith('de/') ? 'de-DE' : 'en-US',
      `${rel}: the self-referential entry carries the document's own locale`,
    );
    assert.ok(
      !hrefs.includes(`${BASE}/posts/`) && !hrefs.includes(`${BASE}/de/posts/`),
      `${rel}: no alternate names a pager-one URL`,
    );
  }
});

test('pager one is unchanged by all of the above', () => {
  for (const [rel, url] of [
    [EN_PAGE1, `${BASE}/posts/`],
    [DE_PAGE1, `${BASE}/de/posts/`],
  ]) {
    assert.deepEqual(canonicals(rel), [url], `${rel}: canonical is the plain section URL`);
    assert.deepEqual(meta(rel, 'og:url'), [url], `${rel}: og:url is the plain section URL`);
    const webpage = nodeOfType(rel, 'CollectionPage');
    assert.equal(webpage['@id'], `${url}#webpage`);
    assert.equal(webpage.url, url);
    const hrefs = hreflangs(rel).map((l) => l.href);
    assert.deepEqual(
      hrefs.sort(),
      [`${BASE}/de/posts/`, `${BASE}/posts/`, `${BASE}/posts/`].sort(),
      `${rel}: both section URLs plus x-default`,
    );
  }
});

test('a regular page keeps emitting its permalink', () => {
  // The pager-aware branch must be reachable only from a paginated list: a
  // leaf page has no pager, and its canonical is still its own permalink.
  const rel = 'posts/post-1/index.html';
  assert.deepEqual(canonicals(rel), [`${BASE}/posts/post-1/`]);
  const webpage = nodeOfType(rel, 'WebPage');
  assert.equal(webpage['@id'], `${BASE}/posts/post-1/#webpage`);
  assert.equal(webpage.url, `${BASE}/posts/post-1/`);
});
