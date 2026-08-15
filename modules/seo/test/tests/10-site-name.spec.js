/* global process */
// The site's name: one chain, four surfaces.
//
// `og:site_name`, the JSON-LD `WebSite.name`, the OpenSearch
// `<link rel="search" title=...>` and the feed-discovery title all answer one
// question -- what is this site called -- and three of them used to derive the
// answer for themselves. Two of those derivations ran the fallback chain in the
// OPPOSITE order to the third, so a site that set `[seo.website] name` got it in
// `WebSite.name` and its PUBLISHER's name in every social preview, with no
// configuration able to fix one without falsifying the other.
//
// The `sitename` build is the only one that can see any of this: everywhere
// else the chain's two ends resolve to the same string, or one of them is
// deliberately unreadable, so an inverted order and a correct one emit
// identical bytes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {
  configuredDir,
  dom,
  linkRels,
  nodesOfType,
  sitenameDir,
  subpathDir,
  PAGES,
} from './helpers.js';

// `[seo.website] name`, set only in the sitename environment.
const WEBSITE_NAME = 'Acme Docs Portal';
// `[seo.organization] name` with `type = 'Person'`, inherited from the baseline.
const PUBLISHER_NAME = 'Jane Doe';

const ogSiteName = (rel, dir) =>
  dom(rel, dir).querySelector('meta[property="og:site_name"]')?.getAttribute('content');
const searchLink = (rel, dir) => linkRels(rel, dir).find((l) => l.rel === 'search');
const feedLink = (rel, dir) =>
  linkRels(rel, dir).find((l) => l.rel === 'alternate' && /rss\+xml/.test(l.type ?? ''));

test('sitename: every surface that names the site carries the website name', () => {
  for (const [name, rel] of Object.entries(PAGES)) {
    assert.equal(ogSiteName(rel, sitenameDir), WEBSITE_NAME, `${name}: og:site_name`);
  }

  const search = searchLink(PAGES.page, sitenameDir);
  assert.ok(search, 'rel="search" must be emitted');
  assert.equal(search.title, WEBSITE_NAME, 'the OpenSearch title names the site');

  const feed = feedLink(PAGES.page, sitenameDir);
  assert.ok(feed, 'a feed alternate must be emitted');
  assert.equal(feed.title, WEBSITE_NAME, 'the feed title names the site');

  const [website] = nodesOfType(PAGES.home, 'WebSite', sitenameDir);
  assert.ok(website, 'the home page must carry a WebSite node');
  assert.equal(website.name, WEBSITE_NAME, 'WebSite.name names the site');
});

test('sitename: the Person publisher keeps its own name', () => {
  // This is why the override has to exist at all. `[seo.organization]` is the
  // PUBLISHER, and the module supports `type = 'Person'` there deliberately, so
  // the only site-side way to fix a social preview used to be renaming a real
  // human -- which falsifies the Person entity in the graph to repair a string
  // that was never that entity's name.
  const [person] = nodesOfType(PAGES.home, 'Person', sitenameDir);
  assert.ok(person, 'the home page must carry the Person publisher node');
  assert.equal(person.name, PUBLISHER_NAME, 'the publisher is still the person');
  assert.match(person['@id'], /#organization$/, 'and keeps the #organization anchor');
});

test('the surfaces agree on every build, whatever the chain resolves to', () => {
  // The defect is DISAGREEMENT, not any single value, so the invariant is
  // asserted wherever more than one surface is emitted -- including the two
  // builds whose chain lands on a different link than sitename's.
  for (const [name, dir] of Object.entries({configuredDir, subpathDir, sitenameDir})) {
    const home = ogSiteName(PAGES.home, dir);
    assert.ok(home, `${name}: og:site_name must be emitted`);

    const [website] = nodesOfType(PAGES.home, 'WebSite', dir);
    assert.ok(website, `${name}: the home page must carry a WebSite node`);
    assert.equal(website.name, home, `${name}: WebSite.name must equal og:site_name`);

    const search = searchLink(PAGES.page, dir);
    assert.ok(search, `${name}: rel="search" must be emitted`);
    assert.equal(
      search.title,
      ogSiteName(PAGES.page, dir),
      `${name}: so must the OpenSearch title`,
    );

    const feed = feedLink(PAGES.page, dir);
    assert.ok(feed, `${name}: a feed alternate must be emitted`);
    assert.equal(feed.title, ogSiteName(PAGES.page, dir), `${name}: and the feed title`);
  }
});

test('a build that sets no website name falls back exactly as it did before', () => {
  // Regression locks for the builds where `[seo.website] name` is absent: the
  // organization name where the organization table is readable, `site.Title`
  // where it is a bare scalar. These values are what the module emitted before
  // one resolver owned the chain, and they must not have moved.
  assert.equal(ogSiteName(PAGES.page), PUBLISHER_NAME, 'baseline: the organization name');
  assert.equal(
    ogSiteName(PAGES.page, configuredDir),
    PUBLISHER_NAME,
    'configured: the organization name, because its `website` value is a bare scalar',
  );
  assert.equal(
    ogSiteName(PAGES.page, subpathDir),
    'SEO Fixture',
    'subpath: site.Title, because its `organization` value is a bare scalar',
  );
});

test('no consumer re-derives the site name inline', () => {
  // A source lock, because the behavioral assertions above cannot see it: a
  // second CORRECT copy of the chain passes every one of them and reintroduces
  // exactly the condition that produced the defect -- two spellings of one
  // rule, drifting apart at the next edit.
  //
  // Scanned with the Go-template comments STRIPPED. Every one of these files
  // documents the resolver in its docstring, so a raw substring search finds
  // the partial's own path in prose and reports a delegation that the code no
  // longer performs -- which is exactly how this assertion first passed against
  // a build whose WebSite node had gone back to deriving the chain itself.
  //
  // Both delimiters carry an OPTIONAL whitespace-trim marker, independently:
  // one comment in these three files opens `{{/*` and closes `*/ -}}`, and
  // another opens `{{- /*` and closes `*/ -}}`. A pattern anchored on the bare
  // `{{/*`...`*/}}` pair therefore misses the second entirely AND, on the
  // first, runs past the real close to the next one -- swallowing the emission
  // block in between. Both failures are silent, and each breaks this lock in a
  // different direction: leaked prose fails it on a comment, deleted code
  // passes it on a template that no longer delegates at all.
  const layouts = resolve(process.env.MODULE_LAYOUTS ?? '../layouts/_partials/seo');
  const code = (rel) =>
    readFileSync(join(layouts, rel), 'utf8').replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, '');

  // The stripper is load-bearing, so it is proven per FILE rather than
  // trusted, and in BOTH directions: one witness that must survive, one that
  // must not. A guard covering only some of the scanned files is how the
  // swallowed-emission-block defect above stayed green -- head-meta.html
  // stripped cleanly while alternates.html lost 88 lines of template.
  const WITNESSES = {
    'head-meta.html': {keeps: 'og:site_name', drops: 'Open Graph ----'},
    'alternates.html': {keeps: 'rel="alternate"', drops: 'Surface one'},
    'jsonld/website.html': {keeps: '"@type" "WebSite"', drops: 'Cache-safety invariant'},
  };

  for (const [rel, witness] of Object.entries(WITNESSES)) {
    const body = code(rel);
    assert.ok(body.includes(witness.keeps), `${rel}: stripping must leave the template behind`);
    assert.ok(!body.includes(witness.drops), `${rel}: stripping must remove the comments`);
    assert.ok(
      !body.includes('seo.website.name'),
      `${rel} must not re-derive the site name from the raw parameter path`,
    );
  }

  assert.ok(
    code('head-meta.html').includes('$seo.siteName'),
    'head-meta.html reads the resolved site name off the shared context',
  );
  assert.ok(
    code('alternates.html').includes('$seo.siteName'),
    'alternates.html reads the same key rather than resolving its own',
  );
  assert.ok(
    code('jsonld/website.html').includes('partialCached "seo/resolve/site-name.html"'),
    'the WebSite builder delegates to the same resolver',
  );
});
