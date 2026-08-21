// A format wired onto a page is not a document published for it, and Hugo
// never says which is which: it decides publication on the rendered byte
// length, keeps listing the format on the page with a resolving .RelPermalink,
// and logs nothing at any level -- so a manifest built from .OutputFormats
// alone names URLs production answers 404 for, in the one document whose whole
// job is being compared against production.
//
// This environment builds both arms of the answer. `twin` renders nothing for
// the page carrying `twin: false` and ships a hook that says so; `badtwin`
// renders for every page and ships a hook written the way an author gets it
// wrong, printing instead of returning, which must be refused rather than read
// as "publishes nothing". A page with `build.render = link` covers the third
// case, where Hugo publishes no document at all while keeping the URL.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unpublishedDir, docExists, manifest, moduleWarnings, publishedUrls} from './helpers.js';

const urls = () => manifest(unpublishedDir).urls;

// The two the module leaves out for reasons of their own, both asserted by
// 03-manifest.spec.js: the sitemap, whose publication is decided by a setting
// no template can read, and the redirect map, which every host it targets
// consumes at deploy time and serves at no URL.
const NOT_LISTED = ['/sitemap.xml', '/_redirects'];

// The whole claim in one assertion, derived from the tree rather than from a
// remembered list: what the manifest says and what the build wrote are the same
// set. Every targeted assertion below says WHICH difference this environment
// exists to produce, so a regression names itself instead of only failing here.
test('the manifest is exactly what this build published', () => {
  const expected = publishedUrls(unpublishedDir)
    .filter((url) => !NOT_LISTED.includes(url))
    .sort();
  assert.deepEqual(urls(), expected);
});

test('a page whose format rendered nothing keeps the format but loses the line', () => {
  assert.ok(!docExists(unpublishedDir, 'silent/index.ptxt'), 'the fixture premise changed');
  assert.ok(!urls().includes('/silent/index.ptxt'), 'a URL no file was written for is listed');
});

test('and the same format on a page that did publish keeps its line', () => {
  assert.ok(docExists(unpublishedDir, 'publishes/index.ptxt'), 'the fixture premise changed');
  assert.ok(urls().includes('/publishes/index.ptxt'), 'a published twin lost its line');
  assert.ok(urls().includes('/silent/'), 'the page itself was dropped with its twin');
});

// The dangerous direction. The badtwin hook renders nothing, so anything that
// used its answer without checking the type would read false and delete four
// URLs the build really wrote.
test('a hook answering with text instead of a boolean removes nothing', () => {
  const written = publishedUrls(unpublishedDir).filter((url) => url.endsWith('/bad.ptxt'));
  assert.ok(written.length >= 2, `the fixture premise changed: ${written.length} badtwin files`);
  for (const url of written) assert.ok(urls().includes(url), `${url} was dropped`);
});

test('and the refusal is reported exactly once, naming the hook', () => {
  const lines = moduleWarnings('unpublished');
  assert.equal(lines.length, 1, `expected exactly one diagnostic, got ${lines.length}`);
  assert.match(lines[0], /url-retirement\/publishes\/badtwin\.html\b/);
  assert.match(lines[0], /must return true or false/);
});

// build.render = link: Hugo writes no document for the page and still reports
// the html format with a resolving .RelPermalink, so the page is in .Site.Pages
// with a URL and nothing behind it.
test('a page Hugo renders no document for contributes no URL at all', () => {
  assert.ok(!docExists(unpublishedDir, 'linked/index.html'), 'the fixture premise changed');
  for (const url of urls()) assert.ok(!url.startsWith('/linked/'), `${url} is listed`);
});

test('and a page Hugo gives no URL to is absent as it always was', () => {
  assert.ok(!docExists(unpublishedDir, 'never/index.html'), 'the fixture premise changed');
  for (const url of urls()) assert.ok(!url.startsWith('/never/'), `${url} is listed`);
});

// The header is the only account of the document's limits a checker ever sees,
// and this class is the one the module cannot fully close.
test('the header names the class that can still be over-listed', () => {
  const header = manifest(unpublishedDir).header.join('\n');
  assert.match(header, /publication hook/);
  assert.match(header, /listed as wired/);
});
