// The URLs the MODULE derives for a page, as opposed to the ones Hugo hands
// outward for it, which 13-primary-output-format.spec.js covers.
//
// Both documents this module publishes render in formats that are not
// `permalinkable`, and measured at Hugo v0.164.0 a page asked for its own URL
// inside such a template answers with the first entry of its own `[outputs]`
// list rather than with its html URL. On every other build in this suite html
// leads that list, so the two answers are the same string and no assertion can
// tell them apart. The derived-urls build lists html last, which separates
// them: read straight off `.RelPermalink`, this module emitted
// `/ -> /en/url-manifest.txt` for the site root and a manifest naming the
// manifest as the home page. lib/page-url.html is what resolves it, and these
// are the assertions that hold it there.
//
// The build is multilingual with its default language in a subdirectory because
// that is the only shape carrying the default site's redirect, and it holds its
// own English content because the home page needs an alias that the shared
// content directory cannot give it without changing ten other builds.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {derivedDir, docExists, manifest, redirectRules} from './helpers.js';

const MODULE_DOCS = /url-manifest\.txt$|_redirects$/;

// The premise every assertion below rests on: html really is wired onto the
// home page here, just not first. Without this the build would silently be the
// html-missing shape, where the module naming its own document is correct.
test('the build publishes an html home page for each language', () => {
  assert.ok(docExists(derivedDir, 'en/index.html'), 'no English home page was published');
  assert.ok(docExists(derivedDir, 'de/index.html'), 'no German home page was published');
});

test("the default site's redirect points at the language home, not at a document", () => {
  const rules = redirectRules(derivedDir).filter((rule) => rule.from === '/');
  assert.deepEqual(
    rules.map((rule) => rule.to),
    ['/en/'],
    'the site root is redirected somewhere other than the default language home',
  );
});

test('an alias of the home page points at the home page', () => {
  const targets = redirectRules(derivedDir)
    .filter((rule) => rule.from.startsWith('/en/old-home'))
    .map((rule) => rule.to);
  assert.deepEqual(targets, ['/en/', '/en/'], 'both spellings of the home alias must land on /en/');
});

// The control beside it: a regular page publishes html alone, so its rule reads
// the same however the module resolves the URL. A change that moved this one
// would have reached further than the pages it was meant to reach.
test('an alias of a regular page still points at that page', () => {
  const targets = redirectRules(derivedDir)
    .filter((rule) => rule.from.startsWith('/en/legacy/a-post'))
    .map((rule) => rule.to);
  assert.deepEqual(targets, ['/en/posts/post-one/', '/en/posts/post-one/']);
});

test('no rule in the file points at a document this module publishes', () => {
  const offenders = redirectRules(derivedDir).filter((rule) => MODULE_DOCS.test(rule.to));
  assert.deepEqual(
    offenders.map((rule) => rule.line),
    [],
  );
});

// The manifest is in one-URL-per-page mode here, which is the mode in which it
// has to name the PAGE rather than enumerate that page's formats -- and so the
// mode in which reading the wrong URL for it shows.
// The whole set rather than a floor. Asserting only that the home page is in
// there passes even when the module names the manifest as well, because the
// home page's own URL reaches the manifest a second way -- the pager
// registration records it during the html pass, where the URL is right.
// The registered URL belongs to no page and carries no language segment: it
// names a file the asset pipeline published at the publish root, which both
// languages of a shared-domain site are served from.
test('the manifest lists exactly one URL per page of this language', () => {
  assert.deepEqual(manifest(derivedDir, 'en/url-manifest.txt').urls, [
    '/en/',
    '/en/posts/',
    '/en/posts/post-one/',
    '/en/tags/',
    '/probe/published-by-url-read.txt',
  ]);
});

test('and lists no document this module publishes as a page URL', () => {
  const {urls} = manifest(derivedDir, 'en/url-manifest.txt');
  assert.deepEqual(
    urls.filter((url) => MODULE_DOCS.test(url)),
    [],
    'a page is listed under the URL of a document this module publishes',
  );
});
