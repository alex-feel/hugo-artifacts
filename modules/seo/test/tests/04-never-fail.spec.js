// The never-fail contract, which this module's README opens by making:
// "The module never breaks a build over SEO data: every misconfiguration
// degrades to a deduplicated warnf and a safe fallback, so a broken schema
// declaration costs you one rich result, never the site."
//
// Go's `range` accepts only an array, slice, map, chan or int, and `index`
// rejects a string, so a value documented as a list but written as a bare
// scalar aborted template execution and stopped the consuming site's build.
// The scalar form is not exotic: Hugo front matter accepts `tags: hugo`, and
// many sites write it that way, so the failure landed on ordinary content.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rawHtml, PAGES} from './helpers.js';

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
