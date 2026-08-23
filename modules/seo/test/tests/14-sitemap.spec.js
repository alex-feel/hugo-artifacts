// Hugo's own sitemap, read with an XML parser, and the module's canonical
// checked against it.
//
// NOTHING in this repository had ever parsed a sitemap. Every reader -- here,
// in the composition suite, in url-retirement -- matches a substring or runs a
// /<loc>([^<]+)<\/loc>/ regex over the raw bytes, and both read a truncated,
// mis-namespaced or malformed document exactly as they read a correct one.
// That matters more than it sounds, because almost every assertion built on
// those reads is NEGATIVE ("this URL is not in the sitemap"), and an empty or
// broken sitemap satisfies every negative assertion ever written. So the first
// thing here is a well-formedness gate and the second is a positive control.
//
// The third is the one about this module. Hugo builds the sitemap from its own
// page walk, independently of anything the module emits, so the sitemap and
// the module's head are two separate derivations of one fact: the URL a
// document is served from. Stating that URL is the module's entire job --
// canonical, og:url, the JSON-LD @id -- and 06-pagination.spec.js pins the one
// case where the two derivations were known to diverge. Comparing every <loc>
// against the canonical of the document published there generalizes that check
// to every page of every build, including the page kinds and the deploy shapes
// no spec names individually.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {XMLValidator, XMLParser} from 'fast-xml-parser';
import {
  publicDir,
  configuredDir,
  subpathCanonifyDir,
  subpathDir,
  badtypesDir,
  offswitchDir,
  multilingualDir,
  paginationDir,
  paginationSubpathDir,
  graphDir,
  sitenameDir,
  generatedDir,
  hometitleDir,
} from './helpers.js';

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const ROOT_BASE = 'https://seo-fixture.example/';
const SUBPATH_BASE = 'https://seo-fixture.example/docs/';

// Every tree the runner builds, with the baseURL it was built at. The base is
// declared rather than derived because deriving it from the tree would take it
// from the very output under test; a wrong entry here cannot pass silently,
// since it makes every <loc> resolve to a file that does not exist.
//
// `authoredCanonical` marks the one environment whose params set a site-wide
// `canonical`, so its pages deliberately do NOT name their own URL. Skipping
// it from the agreement check would be a hole, so the skip is paid for by its
// own assertion below.
const TREES = [
  {name: 'baseline', dir: publicDir, base: ROOT_BASE},
  {name: 'configured', dir: configuredDir, base: ROOT_BASE},
  {name: 'subpath', dir: subpathDir, base: SUBPATH_BASE, authoredCanonical: true},
  {
    name: 'subpath-canonify',
    dir: subpathCanonifyDir,
    base: SUBPATH_BASE,
    authoredCanonical: true,
  },
  {name: 'badtypes', dir: badtypesDir, base: ROOT_BASE},
  {name: 'offswitch', dir: offswitchDir, base: ROOT_BASE},
  {name: 'multilingual', dir: multilingualDir, base: ROOT_BASE},
  {name: 'pagination', dir: paginationDir, base: ROOT_BASE},
  {name: 'pagination-subpath', dir: paginationSubpathDir, base: SUBPATH_BASE},
  {name: 'graph', dir: graphDir, base: ROOT_BASE},
  {name: 'sitename', dir: sitenameDir, base: ROOT_BASE},
  {name: 'generated', dir: generatedDir, base: ROOT_BASE},
  {name: 'hometitle', dir: hometitleDir, base: ROOT_BASE},
];

const MULTILINGUAL = ['multilingual', 'pagination', 'pagination-subpath', 'hometitle'];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Without this a document holding exactly one entry parses to an object
  // where a longer one parses to an array, and every reader below would have
  // to branch on the count.
  isArray: (name) => name === 'url' || name === 'sitemap',
});

function parsed(path) {
  assert.ok(existsSync(path), `${path} was not published`);
  const xml = readFileSync(path, 'utf8');
  const verdict = XMLValidator.validate(xml);
  assert.equal(
    verdict,
    true,
    `${path} is not well-formed XML: ${JSON.stringify(verdict?.err ?? verdict)}`,
  );
  return parser.parse(xml);
}

// The tree's sitemap documents: the root one, plus every per-language document
// a sitemapindex names. Returns {index, urlsets} where index is null on a
// single-language build.
function sitemaps(tree) {
  const rootPath = join(tree.dir, 'sitemap.xml');
  const root = parsed(rootPath);
  if (!root.sitemapindex) {
    return {index: null, indexPath: rootPath, root, urlsets: [{path: rootPath, doc: root}]};
  }
  const urlsets = root.sitemapindex.sitemap.map((entry) => {
    assert.ok(
      entry.loc.startsWith(tree.base),
      `${tree.name}: the index names ${entry.loc}, which is not under ${tree.base}`,
    );
    const path = join(tree.dir, entry.loc.slice(tree.base.length));
    return {path, doc: parsed(path), loc: entry.loc};
  });
  return {index: root.sitemapindex, indexPath: rootPath, root, urlsets};
}

const locsOf = (urlset) => (urlset.doc.urlset?.url ?? []).map((u) => u.loc);

// The published document a <loc> names. Hugo writes a directory index for
// every URL in these builds, so the mapping is total; a URL that resolves to
// no file is itself the finding.
function documentFor(tree, loc) {
  return join(tree.dir, loc.slice(tree.base.length), 'index.html');
}

const canonicalOf = (path) =>
  readFileSync(path, 'utf8').match(/<link rel="canonical" href="([^"]*)"/)?.[1];

test('every sitemap document every build publishes is well-formed XML in the sitemap 0.9 namespace', () => {
  let documents = 0;
  for (const tree of TREES) {
    const {index, root, urlsets} = sitemaps(tree);
    documents += 1 + (index ? urlsets.length : 0);
    const rootEl = index ? root.sitemapindex : root.urlset;
    assert.equal(
      rootEl['@xmlns'],
      SITEMAP_NS,
      `${tree.name}: the root element does not declare the sitemap 0.9 namespace`,
    );
    for (const urlset of urlsets) {
      assert.ok(urlset.doc.urlset, `${urlset.path}: the root element is not a urlset`);
      assert.equal(
        urlset.doc.urlset['@xmlns'],
        SITEMAP_NS,
        `${urlset.path}: the urlset does not declare the sitemap 0.9 namespace`,
      );
    }
  }
  // A count, so a future change that stops publishing a sitemap somewhere is a
  // failure here rather than a loop that quietly runs fewer times.
  // Nine single-language trees publish one urlset each; the three
  // two-language trees and the three-language hometitle tree each publish an
  // index plus one urlset per language.
  assert.equal(documents, 22, 'thirteen trees publish twenty-two sitemap documents between them');
});

test('every sitemap lists at least one URL, which is what makes the absence checks mean anything', () => {
  // The positive control. Every "this URL is not in the sitemap" assertion in
  // this repository passes trivially against an empty urlset, so the emptiness
  // has to be ruled out somewhere, once, for every build.
  for (const tree of TREES) {
    for (const urlset of sitemaps(tree).urlsets) {
      assert.ok(locsOf(urlset).length > 0, `${urlset.path} lists no URL at all`);
    }
  }
});

test('every URL a sitemap lists names a document the build actually published', () => {
  for (const tree of TREES) {
    for (const urlset of sitemaps(tree).urlsets) {
      for (const loc of locsOf(urlset)) {
        assert.ok(
          loc.startsWith(tree.base),
          `${tree.name}: ${loc} is not under the build's baseURL ${tree.base}`,
        );
        assert.ok(
          existsSync(documentFor(tree, loc)),
          `${tree.name}: the sitemap lists ${loc}, which no published file answers`,
        );
      }
    }
  }
});

test('every URL a sitemap lists is the canonical the module publishes at that URL', () => {
  // Hugo's page walk and seo/head-meta.html derive the served URL separately,
  // so this is the two derivations agreeing across every page of every build.
  // It is the general form of what 06-pagination.spec.js pins for one case.
  for (const tree of TREES) {
    if (tree.authoredCanonical) continue;
    for (const urlset of sitemaps(tree).urlsets) {
      for (const loc of locsOf(urlset)) {
        assert.equal(
          canonicalOf(documentFor(tree, loc)),
          loc,
          `${tree.name}: the document served at ${loc} declares a different canonical`,
        );
      }
    }
  }
});

test('the one build skipped above is skipped because its pages name an authored URL, and it does', () => {
  // Paying for the exclusion. Without this the skip could hide exactly the
  // regression the previous test exists to catch.
  const tree = TREES.find((t) => t.authoredCanonical);
  const authored = `${SUBPATH_BASE}canonical-override/`;
  const seen = new Set();
  for (const urlset of sitemaps(tree).urlsets) {
    for (const loc of locsOf(urlset)) seen.add(canonicalOf(documentFor(tree, loc)));
  }
  assert.deepEqual([...seen], [authored], 'every page declares the one authored canonical');
});

test('a multilingual build publishes an index naming one sitemap per language', () => {
  for (const tree of TREES) {
    const {index, urlsets} = sitemaps(tree);
    if (!MULTILINGUAL.includes(tree.name)) {
      assert.equal(index, null, `${tree.name} is single-language and must publish a plain urlset`);
      continue;
    }
    assert.ok(index, `${tree.name} is multilingual and must publish a sitemapindex`);
    // hometitle carries three languages, the rest two. The named documents are
    // already parsed and namespace-checked above; what is new here is that the
    // index names each one exactly once and names nothing else.
    const named = urlsets.map((u) => u.loc);
    assert.equal(new Set(named).size, named.length, `${tree.name}: the index repeats a sitemap`);
    assert.ok(named.length >= 2, `${tree.name}: an index naming one sitemap is not an index`);
  }
});

test('under a baseURL that carries a path, every listed URL carries that path', () => {
  // The shape in which a dropped prefix is visible at all: at a domain root a
  // correct URL and one that lost the baseURL path are the same string.
  for (const name of ['subpath', 'pagination-subpath']) {
    const tree = TREES.find((t) => t.name === name);
    for (const urlset of sitemaps(tree).urlsets) {
      for (const loc of locsOf(urlset)) {
        assert.ok(loc.startsWith(SUBPATH_BASE), `${name}: ${loc} does not carry the baseURL path`);
      }
    }
  }
});

test('no sitemap lists a pager URL, which is why the module has to resolve one itself', () => {
  // A premise rather than a module rule: Hugo's walk visits the list Page once
  // and takes its permalink, so /posts/page/2/ is in no sitemap even though it
  // is published and served. That is what makes seo/resolve/pager.html the only
  // thing standing between two published documents and one declared identity,
  // and if it ever stopped being true the agreement check above would silently
  // start covering pagers instead of leaving them to 06-pagination.spec.js.
  for (const name of ['pagination', 'pagination-subpath']) {
    const tree = TREES.find((t) => t.name === name);
    for (const urlset of sitemaps(tree).urlsets) {
      for (const loc of locsOf(urlset)) {
        assert.doesNotMatch(loc, /\/page\/\d+\/$/, `${name}: the sitemap lists the pager ${loc}`);
      }
    }
  }
});
