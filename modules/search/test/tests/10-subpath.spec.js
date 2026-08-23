// The search-page URL under a baseURL that carries a PATH.
//
// Hugo resolves a leading-slash value against the host root, DISCARDING the
// baseURL path -- for relURL and relLangURL exactly as for absURL. Every other
// build in this suite sits at a domain root, where a correct implementation
// and a broken one emit identical bytes, so this static overlay is the only
// place the difference exists -- for the fallback links AND for the OpenSearch
// document, the module's one absolute-URL surface (the base fixture's
// opensearch opt-in merges into this build).
//
// The overlay also points page_path at a page that does not exist, because
// that is the only way to reach the fallback branch: with the page present,
// page_url comes from the page itself and the fallback never runs.
//
// The second half of this file covers the SAME contract under canonifyURLs,
// against the build that chains config-canonify.toml onto that same subpath
// overlay. With the setting on, Hugo rewrites every root-relative URL in HTML
// output into an absolute one after the templates have run, and to stop that
// rewrite from doubling the baseURL path it makes the whole Page family emit
// the path no longer: measured at v0.164.0, a page's .RelPermalink is "/" and
// an output format's is "/searchindex.json". The rewrite runs on HTML ONLY,
// so this module's two non-HTML artifacts keep whatever the template put
// there -- which is why every URL in them is derived from a .Permalink and
// rooted back (search/lib/rooted-url.html) rather than read off
// .RelPermalink. Nothing else in this suite can see the difference: with
// canonifyURLs off the two spellings emit identical bytes.
/* global process */
import {test, expect} from '@playwright/test';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const subpathDir = process.env.SUBPATH_DIR;
const canonifyDir = process.env.CANONIFY_DIR;
const canonifyPageDir = process.env.CANONIFY_PAGE_DIR;

function readFrom(dir, name, ...rel) {
  expect(dir, `the runner must export ${name}`).toBeTruthy();
  const file = join(dir, ...rel);
  expect(existsSync(file), `${rel.join('/')} is published`).toBe(true);
  return readFileSync(file, 'utf8');
}

const readCanonify = (...rel) => readFrom(canonifyDir, 'CANONIFY_DIR', ...rel);
const readCanonifyPage = (...rel) => readFrom(canonifyPageDir, 'CANONIFY_PAGE_DIR', ...rel);

test('the fallback search-page URL keeps the baseURL path', async () => {
  expect(subpathDir, 'the runner must export SUBPATH_DIR').toBeTruthy();
  const index = join(subpathDir, 'index.html');
  expect(existsSync(index)).toBe(true);
  const html = readFileSync(index, 'utf8');

  // Every emitted reference to the search page must live under /docs/.
  const refs = [...html.matchAll(/["'(](\/[^"'()\s]*no-such-search-page[^"'()\s]*)/g)].map(
    (m) => m[1],
  );
  expect(refs.length).toBeGreaterThan(0);
  for (const ref of refs) {
    expect(ref.startsWith('/docs/')).toBe(true);
  }
});

test('the noscript index pointer carries the baseURL path', async () => {
  expect(subpathDir, 'the runner must export SUBPATH_DIR').toBeTruthy();
  const file = join(subpathDir, 'search', 'index.html');
  expect(existsSync(file)).toBe(true);
  const html = readFileSync(file, 'utf8');

  // The pointer href rides site.Home's searchindex .RelPermalink, which
  // carries the baseURL path by construction; this locks the derivation at
  // the only baseURL where dropping the path would be visible.
  const href = /class="search__noscript-link" href="([^"]+)"/.exec(html)?.[1];
  expect(href).toBe('/docs/searchindex.json');
});

test('the opensearch Url template carries the full subpath base exactly once', async () => {
  expect(subpathDir, 'the runner must export SUBPATH_DIR').toBeTruthy();
  const file = join(subpathDir, 'opensearch.xml');
  expect(existsSync(file)).toBe(true);
  const xml = readFileSync(file, 'utf8');

  // Exact equality, not a prefix check: a derivation that discarded the
  // baseURL path would emit https://example.org/no-such-search-page..., and
  // one that resolved a path-less value against the full baseURL would
  // double it (https://example.org/docs/docs/...) -- and the doubled
  // spelling still BEGINS with the subpath base, so only the exact form
  // locks the derivation.
  const template = /<Url type="text\/html"[^>]*template="([^"]+)"/.exec(xml)?.[1];
  expect(template).toBe('https://example.org/docs/no-such-search-page?q={searchTerms}');

  // The self-reference rides .Permalink and must carry the path too.
  const self = /rel="self" template="([^"]+)"/.exec(xml)?.[1];
  expect(self).toBe('https://example.org/docs/opensearch.xml');
});

test('canonifyURLs is really on (control assertion)', async () => {
  // Hugo rewrites root-relative URLs in HTML output into absolute ones under
  // this setting. If this fails the overlay did not take effect and every
  // canonifyURLs assertion below is asserting nothing.
  const html = readCanonify('search', 'index.html');
  const href = /class="search__noscript-link" href="([^"]+)"/.exec(html)?.[1];
  expect(href).toBe('https://example.org/docs/searchindex.json');
});

test('every index href keeps the baseURL path under canonifyURLs', async () => {
  const index = JSON.parse(readCanonify('searchindex.json'));

  // A positive control first: an "every record satisfies X" assertion passes
  // on an empty document, and an index that published no records at all is
  // exactly the failure this build exists to notice.
  expect(index.docs.length).toBeGreaterThan(10);

  for (const doc of index.docs) {
    // A .RelPermalink-derived href arrives here stripped to "/instruments/..."
    // and points outside the site on a subpath deployment -- silently, because
    // the index is never post-processed and no client validates a link before
    // following it.
    expect(doc.href.startsWith('/docs/')).toBe(true);
  }

  const hrefs = index.docs.map((d) => d.href);
  // Two exact pins, because a prefix test cannot tell a correct href from one
  // that prepended the baseURL path to a value already carrying it. The
  // fixture's own awkward case is the discriminator: content/docs/guides/
  // nested sits in a section literally named "docs", so under this baseURL
  // its URL really is /docs/docs/guides/nested/ -- one baseURL path, one page
  // path that happens to start the same way. The page beside it has no such
  // collision, so a derivation that doubled would break that one instead.
  expect(hrefs).toContain('/docs/docs/guides/nested/');
  expect(hrefs).toContain('/docs/instruments/marine-barometers/');
});

test('the index href set is identical with canonifyURLs on and off', async () => {
  // The strongest form of the contract: not merely "well-shaped" but the SAME
  // URLs the subpath build publishes. A derivation that lost the path only
  // for some kinds of page would satisfy the prefix test above on the rest.
  const canon = JSON.parse(readCanonify('searchindex.json'));
  expect(subpathDir, 'the runner must export SUBPATH_DIR').toBeTruthy();
  const plain = JSON.parse(readFileSync(join(subpathDir, 'searchindex.json'), 'utf8'));
  expect(canon.docs.map((d) => d.href)).toEqual(plain.docs.map((d) => d.href));
});

test('a resource-derived thumbnail URL needs no rooting and gets none', async () => {
  // The other half of the measured distinction: a RESOURCE's .RelPermalink
  // keeps the baseURL path under canonifyURLs where a page's does not, so
  // search/lib/record.html deliberately leaves the thumbnail alone. This
  // locks that asymmetry: if a Hugo release ever stripped resource URLs too,
  // the module would need a second rooting and nothing else here would say so.
  const canon = JSON.parse(readCanonify('searchindex.json'));
  expect(subpathDir, 'the runner must export SUBPATH_DIR').toBeTruthy();
  const plain = JSON.parse(readFileSync(join(subpathDir, 'searchindex.json'), 'utf8'));

  const images = (index) => index.docs.map((d) => d.image ?? null);
  // A positive control: with no thumbnail anywhere the equality below would
  // compare two lists of nulls and pass whatever the derivation did.
  expect(canon.docs.filter((d) => d.image?.startsWith('/docs/')).length).toBeGreaterThan(0);
  expect(images(canon)).toEqual(images(plain));
});

test('the opensearch query contract survives canonifyURLs unchanged', async () => {
  // The advertised template is what a client stores and reuses; a stripped
  // path sends every future query to a host root that does not serve this
  // site. Exact equality against the same value the subpath build emits.
  //
  // This build reaches the COMPOSED arm of the search-page resolution, the
  // one that runs when no page exists yet and builds the URL from the home
  // page's own permalink.
  const xml = readCanonify('opensearch.xml');
  const template = /<Url type="text\/html"[^>]*template="([^"]+)"/.exec(xml)?.[1];
  expect(template).toBe('https://example.org/docs/no-such-search-page?q={searchTerms}');
  const self = /rel="self" template="([^"]+)"/.exec(xml)?.[1];
  expect(self).toBe('https://example.org/docs/opensearch.xml');
});

test('a resolved search page keeps its path in the opensearch contract too', async () => {
  // The RESOLVED arm, reached only by the build that restores page_path.
  // Both arms feed the same advertised template, and each is invisible in
  // the other's build: with the page present the composed arm never runs,
  // and every other consumer of this value is an HTML attribute Hugo repairs
  // under canonifyURLs whatever the template produced. Without this build a
  // revert of that arm to .RelPermalink would change no byte anywhere here.
  const xml = readCanonifyPage('opensearch.xml');
  const template = /<Url type="text\/html"[^>]*template="([^"]+)"/.exec(xml)?.[1];
  expect(template).toBe('https://example.org/docs/search/?q={searchTerms}');

  // A control on the build itself: the search page must really exist here,
  // or the assertion above would be describing the composed arm again.
  const page = readCanonifyPage('search', 'index.html');
  expect(page).toContain('data-search-page-url="https://example.org/docs/search/"');
});
