// The never-fail contract, which this module's README opens by making:
// "The module never breaks a build over SEO data: every misconfiguration
// degrades to a deduplicated warnf and a safe fallback, so a broken schema
// declaration costs you one rich result, never the site."
//
// One authoring mistake, two failure shapes. `range` REJECTS a string, so an
// uncoerced value there aborted the consuming site's build. `index` and
// `delimit` ACCEPT it and iterate it BYTE-WISE, so an uncoerced value there
// published integers -- which is the quieter and worse failure, and the one
// that actually shipped. The scalar form is not exotic: Hugo front matter
// accepts `tags: hugo`, and many sites write it that way, so both landed on
// ordinary content.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  badtypesDir,
  configuredDir,
  graph,
  linkRels,
  rawHtml,
  subpathDir,
  warnCount,
  PAGES,
} from './helpers.js';

test('a page writing tags and categories as bare scalars builds and emits them', () => {
  // That the suite reaches this assertion at all is half the point: before
  // the coercion the build did not complete.
  const html = rawHtml(PAGES.scalarTaxonomies);
  assert.match(html, /<meta property="article:tag" content="single-tag">/);
  assert.match(html, /<meta property="article:section" content="single-category">/);
});

test('the scalar page emits exactly one tag, not one per character', () => {
  // A coercion that split the string instead of wrapping it would emit a tag
  // per character and still "pass" a looser assertion.
  const tags = [...rawHtml(PAGES.scalarTaxonomies).matchAll(/article:tag" content="([^"]*)"/g)];
  assert.equal(tags.length, 1);
  assert.equal(tags[0][1], 'single-tag');
});

test('the JSON-LD node carries the scalar taxonomies as VALUES, not byte codes', () => {
  // The sharpest form of this defect class, and the one that shipped: Hugo's
  // `delimit` and `index` do not reject a string, they iterate it BYTE-WISE.
  // So `tags: hugo` published `"keywords": "104, 117, 103, 111"` and
  // `articleSection` as an integer -- to Google and to every AI crawler,
  // silently, exit 0. The OG surface on the same page was correct throughout,
  // which is exactly why nothing caught it.
  const nodes = graph(PAGES.scalarTaxonomies).filter((n) => n['@type'] === 'BlogPosting');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].keywords, 'single-tag');
  assert.equal(nodes[0].articleSection, 'single-category');
});

test('no JSON-LD value anywhere is a bare byte code', () => {
  // A regression net for the whole class rather than the two known keys.
  for (const [name, rel] of Object.entries(PAGES)) {
    for (const node of graph(rel)) {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'number' && value >= 32 && value <= 126) {
          assert.fail(`${name}: ${node['@type']}.${key} is ${value}, which looks byte-wise`);
        }
      }
    }
  }
});

test('a scalar written for a page sub-table builds, and degrades to unconfigured', () => {
  // `seo: {video: 'dQw4w9WgXcQ'}` is the bare-id spelling the module's own
  // video_id alias encourages. It is TRUTHY, so `| default dict` does not
  // substitute; resolve/types.html then types the page VideoObject and
  // head-jsonld.html dispatches to a builder that reads `.thumbnail_url` off
  // a string. That was a hard build stop -- reaching this assertion at all is
  // half the proof.
  const html = rawHtml(PAGES.scalarSubtables);
  assert.ok(html.length > 0, 'the page built');
  // The unusable block is treated as unconfigured, so no half-built node ships.
  const video = graph(PAGES.scalarSubtables).filter((n) => n['@type'] === 'VideoObject');
  assert.equal(video.length, 0, 'no VideoObject node from an unusable seo.video');
  assert.ok(warnCount(/Ignoring seo\.video/) >= 1, 'and it says so');
});

test('a scalar written for a SITE sub-table degrades without taking the build down', () => {
  // jsonld/organization.html reads `.type` off it on every page, so this one
  // failed site-wide rather than on one page.
  assert.ok(warnCount(/Ignoring seo\.organization/, 'subpath') >= 1);
});

test('the whole seo front-matter block written as a scalar still builds', () => {
  // Read on EVERY page by three resolvers as `| default dict` then `index`.
  // `index` on a string with a string key errors, so one page written this
  // way took the whole build down.
  const html = rawHtml(PAGES.scalarSeoBlock);
  assert.ok(html.includes('<title>'), 'the page built with its head intact');
  assert.ok(warnCount(/Ignoring seo:/) >= 1, 'and it says so');
});

test('a scalar seo.website does not stop the home-page build', () => {
  // jsonld/website.html reads three keys off it on every language home page.
  assert.ok(warnCount(/Ignoring seo\.website/, 'configured') >= 1);
  assert.ok(rawHtml(PAGES.home, configuredDir).includes('<title>'), 'the home page built');
});

test('the whole seo NAMESPACE written as a scalar still builds', () => {
  // Ten builders read site.Params.seo.<child>, and that field access lands on
  // the PARENT before any guard is entered -- so one line of site config
  // stopped the build on the first page rendered. `seo = false` is equally
  // fatal and is the natural shorthand for the documented kill switch.
  const html = rawHtml(PAGES.page, badtypesDir);
  assert.ok(html.includes('<title>'), 'the page built with its head intact');
  assert.ok(warnCount(/Ignoring params\.seo/, 'badtypes') >= 1, 'and it says so');
});

test('a scalar alternates.formats still emits the alternate', () => {
  // Gating on IsSlice made this behave exactly like unset: the twins were
  // published and never linked, silently disabling the surface.
  const md = linkRels(PAGES.page, subpathDir).filter(
    (l) => l.rel === 'alternate' && l.type === 'text/markdown',
  );
  assert.equal(md.length, 1, 'the scalar form is read as a one-item list');
});

test('a non-map [seo.links] warns rather than silently dropping every relation', () => {
  assert.equal(warnCount(/Ignoring \[seo\.links\]/), 1);
  const rels = linkRels(PAGES.page).map((l) => l.rel);
  for (const gone of ['license', 'author', 'search', 'privacy-policy']) {
    assert.ok(!rels.includes(gone), `${gone} is absent, as the warning says`);
  }
});
