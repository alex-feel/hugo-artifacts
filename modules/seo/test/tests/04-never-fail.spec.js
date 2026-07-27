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
import {graph, rawHtml, warnCount, PAGES} from './helpers.js';

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
