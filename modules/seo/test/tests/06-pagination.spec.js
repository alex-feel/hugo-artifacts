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
// Pagination is a property of FOUR page kinds -- home, section, taxonomy and
// term -- and seo/resolve/pager.html gates on all four. The fixture paginates
// all four, because a section is the only one whose URL is a plain child of
// the site root: the home pager hangs directly off the baseURL, and a term
// pager sits two segments deep under a taxonomy that is itself paginated.
//
// The `pagination` environment is a two-language site so the hreflang cluster
// is observable too: the cluster served at /posts/page/2/ must name
// /posts/page/2/ and /de/posts/page/2/, not the two pager-one URLs.
//
// The same environment is built a second time under a baseURL that carries a
// PATH, which no build had ever combined with pagination. The resolver claims
// the pager URL only while `hasPrefix .URL $page.RelPermalink` holds, and both
// of those shapes change when the baseURL gains a path; if either moved, the
// resolver would fall silently back to the permalink and every pager on every
// subpath deploy would go back to declaring its pager-one identity, with no
// warning and no failing assertion anywhere. The fixture's pager probe
// publishes both values so the guard's premise is checked directly rather
// than inferred from the output it produces.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, exists, graph, linkRels, paginationDir, paginationSubpathDir} from './helpers.js';

const BASE = 'https://seo-fixture.example';
const SUBPATH_BASE = 'https://seo-fixture.example/docs';

// One paginated list per kind, in both languages, with the JSON-LD node type
// the module emits for it and the number of entries each pager carries. The
// entry counts are load-bearing: every list template passes an explicit pager
// size of 2 while the site config sets pagerSize = 4, so a partial that built
// a paginator before the list template did would hand back the site defaults
// and publish a visibly different pager set.
const KINDS = [
  {kind: 'home', dir: '', type: 'WebPage', breadcrumb: false, entries: [2, 2]},
  {kind: 'section', dir: 'posts/', type: 'CollectionPage', breadcrumb: true, entries: [2, 2]},
  {kind: 'taxonomy', dir: 'tags/', type: 'CollectionPage', breadcrumb: true, entries: [2, 2]},
  {kind: 'term', dir: 'tags/alpha/', type: 'CollectionPage', breadcrumb: true, entries: [2, 1]},
];

// Both languages of each kind. The German site mirrors the English tags, so a
// taxonomy and a term page are translations of each other and their pagers
// correspond one to one.
const LANGS = [
  {code: 'en-US', prefix: ''},
  {code: 'de-DE', prefix: 'de/'},
];

const pageOne = (kind, lang) => `${lang.prefix}${kind.dir}index.html`;
const pageTwo = (kind, lang) => `${lang.prefix}${kind.dir}page/2/index.html`;
const urlOne = (kind, lang, base = BASE) => `${base}/${lang.prefix}${kind.dir}`;
const urlTwo = (kind, lang, base = BASE) => `${base}/${lang.prefix}${kind.dir}page/2/`;

const meta = (rel, property, dir = paginationDir) =>
  dom(rel, dir)
    .querySelectorAll(`meta[property="${property}"]`)
    .map((el) => el.getAttribute('content'));

const canonicals = (rel, dir = paginationDir) =>
  linkRels(rel, dir)
    .filter((l) => l.rel === 'canonical')
    .map((l) => l.href);

const hreflangs = (rel, dir = paginationDir) =>
  dom(rel, dir)
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .map((el) => ({lang: el.getAttribute('hreflang'), href: el.getAttribute('href')}));

const nodeOfType = (rel, type, dir = paginationDir) =>
  graph(rel, dir).find((n) => n['@type'] === type);

// The pager identity the list template was handed, as fixture/pager-probe.html
// published it.
function probe(rel, dir = paginationDir) {
  const el = dom(rel, dir).querySelector('.pager-probe');
  assert.ok(el, `${rel}: the fixture published no pager probe`);
  return {
    number: Number(el.getAttribute('data-page-number')),
    pagerUrl: el.getAttribute('data-pager-url'),
    pageRel: el.getAttribute('data-page-rel'),
  };
}

test('every kind that can paginate publishes a second pager holding its own entries', () => {
  for (const kind of KINDS) {
    for (const lang of LANGS) {
      assert.ok(
        exists(pageTwo(kind, lang), paginationDir),
        `${kind.kind}: ${urlTwo(kind, lang)} must be published`,
      );
      for (const [i, rel] of [pageOne(kind, lang), pageTwo(kind, lang)].entries()) {
        const items = dom(rel, paginationDir).querySelectorAll('ul.posts li');
        assert.equal(
          items.length,
          kind.entries[i],
          `${rel} must list the entries of its own pager, not the site default's`,
        );
      }
    }
  }
  // The section is the one list whose total is an exact multiple of the pager
  // size, so it is where a site-default paginator would be visible as a third
  // pager rather than only as a different entry count.
  assert.ok(!exists('posts/page/3/index.html', paginationDir), 'and no third pager');
});

test('the resolver claims a pager URL only because the pager URL extends the page URL', () => {
  // The guard's own premise, in both deploy shapes. Everything below rests on
  // it, and it is invisible from the module's output: if Hugo ever changed
  // either shape the resolver would fall back to the permalink silently.
  for (const dir of [paginationDir, paginationSubpathDir]) {
    for (const kind of KINDS) {
      for (const lang of LANGS) {
        const one = probe(pageOne(kind, lang), dir);
        const two = probe(pageTwo(kind, lang), dir);
        assert.equal(one.number, 1, `${pageOne(kind, lang)}: pager one`);
        assert.equal(two.number, 2, `${pageTwo(kind, lang)}: pager two`);
        assert.ok(
          two.pagerUrl.startsWith(two.pageRel),
          `${pageTwo(kind, lang)}: the pager URL ${two.pagerUrl} no longer extends the page URL ${two.pageRel}`,
        );
        assert.equal(
          two.pagerUrl.slice(two.pageRel.length),
          'page/2/',
          `${pageTwo(kind, lang)}: the segment the pager adds`,
        );
      }
    }
  }
});

test('a pager document self-references in canonical and og:url, on every kind', () => {
  for (const kind of KINDS) {
    for (const lang of LANGS) {
      const rel = pageTwo(kind, lang);
      const url = urlTwo(kind, lang);
      assert.deepEqual(canonicals(rel), [url], `${rel}: one canonical, naming its own URL`);
      assert.deepEqual(meta(rel, 'og:url'), [url], `${rel}: og:url names the same URL`);
    }
  }
});

test('a pager document publishes its own JSON-LD identity, on every kind', () => {
  // Taxonomy and term lists reach this at all only because the environment
  // sets webpage_on_lists: the default leaves them with a BreadcrumbList and
  // no page node, so the opt-in is what makes their pager identity visible.
  for (const kind of KINDS) {
    for (const lang of LANGS) {
      const rel = pageTwo(kind, lang);
      const url = urlTwo(kind, lang);
      const webpage = nodeOfType(rel, kind.type);
      assert.ok(webpage, `${rel}: a ${kind.type} node is emitted`);
      assert.equal(webpage['@id'], `${url}#webpage`, `${rel}: the @id names its own URL`);
      assert.equal(webpage.url, url, `${rel}: the url names its own URL`);
      if (!kind.breadcrumb) continue;
      assert.equal(
        webpage.breadcrumb['@id'],
        `${url}#breadcrumb`,
        `${rel}: the breadcrumb reference names its own URL`,
      );
      const breadcrumb = nodeOfType(rel, 'BreadcrumbList');
      assert.ok(breadcrumb, `${rel}: a BreadcrumbList node is emitted`);
      assert.equal(breadcrumb['@id'], `${url}#breadcrumb`, `${rel}: and it carries the same @id`);
    }
  }
});

test('the two pager documents of a kind do not share one JSON-LD identity', () => {
  for (const kind of KINDS) {
    const first = nodeOfType(pageOne(kind, LANGS[0]), kind.type);
    const second = nodeOfType(pageTwo(kind, LANGS[0]), kind.type);
    assert.notEqual(first['@id'], second['@id'], `${kind.kind}: pager one and two are distinct`);
    assert.notEqual(first.url, second.url, `${kind.kind}: and they publish distinct urls`);
  }
});

test('the hreflang cluster on a pager names the pager URLs, on every kind', () => {
  for (const kind of KINDS) {
    for (const lang of LANGS) {
      const rel = pageTwo(kind, lang);
      const self = urlTwo(kind, lang);
      const other = urlTwo(
        kind,
        LANGS.find((l) => l !== lang),
      );
      const cluster = hreflangs(rel);
      const hrefs = cluster.map((l) => l.href);
      assert.ok(hrefs.includes(self), `${rel}: the serving URL is declared`);
      assert.ok(hrefs.includes(other), `${rel}: the translated pager URL is declared`);
      assert.equal(
        cluster.find((l) => l.lang === 'x-default')?.href,
        urlTwo(kind, LANGS[0]),
        `${rel}: x-default names the default-language pager`,
      );
      assert.equal(
        cluster.find((l) => l.href === self).lang,
        lang.code,
        `${rel}: the self-referential entry carries the document's own locale`,
      );
      assert.ok(
        !hrefs.includes(urlOne(kind, LANGS[0])) && !hrefs.includes(urlOne(kind, LANGS[1])),
        `${rel}: no alternate names a pager-one URL`,
      );
    }
  }
});

test('pager one is unchanged by all of the above, on every kind', () => {
  for (const kind of KINDS) {
    for (const lang of LANGS) {
      const rel = pageOne(kind, lang);
      const url = urlOne(kind, lang);
      assert.deepEqual(canonicals(rel), [url], `${rel}: canonical is the plain list URL`);
      assert.deepEqual(meta(rel, 'og:url'), [url], `${rel}: og:url is the plain list URL`);
      const webpage = nodeOfType(rel, kind.type);
      assert.equal(webpage['@id'], `${url}#webpage`);
      assert.equal(webpage.url, url);
      const hrefs = hreflangs(rel)
        .map((l) => l.href)
        .sort();
      assert.deepEqual(
        hrefs,
        [urlOne(kind, LANGS[0]), urlOne(kind, LANGS[0]), urlOne(kind, LANGS[1])].sort(),
        `${rel}: both list URLs plus x-default`,
      );
    }
  }
});

test('a subpath deploy keeps every pager self-reference, prefix and all', () => {
  // The combination no build had: at a domain root a URL that lost the
  // baseURL path is byte-identical to a correct one, so this is the only
  // tree in which the resolver's arithmetic is observable at all.
  for (const kind of KINDS) {
    for (const lang of LANGS) {
      const rel = pageTwo(kind, lang);
      const url = urlTwo(kind, lang, SUBPATH_BASE);
      assert.deepEqual(canonicals(rel, paginationSubpathDir), [url], `${rel}: canonical`);
      assert.deepEqual(meta(rel, 'og:url', paginationSubpathDir), [url], `${rel}: og:url`);
      const webpage = nodeOfType(rel, kind.type, paginationSubpathDir);
      assert.ok(webpage, `${rel}: a ${kind.type} node is emitted`);
      assert.equal(webpage['@id'], `${url}#webpage`, `${rel}: the @id carries the baseURL path`);
      assert.equal(webpage.url, url, `${rel}: and so does the url`);
      const hrefs = hreflangs(rel, paginationSubpathDir).map((l) => l.href);
      assert.ok(hrefs.includes(url), `${rel}: the hreflang cluster declares the serving URL`);
      assert.ok(
        hrefs.every((href) => href.startsWith(`${SUBPATH_BASE}/`)),
        `${rel}: every alternate carries the baseURL path`,
      );
    }
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
