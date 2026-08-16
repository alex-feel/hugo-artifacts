// The manifest's central claim: it lists every URL the build publishes. The
// expectation is derived by WALKING the build tree, not from a list a person
// maintained, so a URL the module forgets is a failure rather than an omission
// nobody notices.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baselineDir, manifest, publishedUrls, readDoc} from './helpers.js';

// The one class the module cannot see and says so in its own header: documents
// whose publication is decided by settings no template can read. Everything
// else in the tree has to be in the manifest.
const UNLISTABLE = ['/sitemap.xml'];

test('the manifest lists exactly the URLs the build wrote to disk', () => {
  const published = publishedUrls(baselineDir)
    .filter((url) => !UNLISTABLE.includes(url))
    .sort();
  assert.deepEqual(manifest(baselineDir).urls, published);
});

test('the count in the header is the number of URLs that follow', () => {
  const {header, urls} = manifest(baselineDir);
  const line = header.find((h) => h.endsWith('URLs follow.'));
  assert.ok(line, 'the header does not state a count');
  assert.equal(Number(line.match(/# (\d+) URLs follow\./)[1]), urls.length);
});

test('the URLs are sorted and carry no duplicate', () => {
  const {urls} = manifest(baselineDir);
  assert.deepEqual(urls, [...urls].sort());
  assert.equal(new Set(urls).size, urls.length);
});

// A secondary output format is a published URL like any other. The fixture's
// sections and taxonomies each publish an RSS feed, so the manifest that
// ignored them would understate the surface by five entries here.
test('secondary output formats are listed beside their page', () => {
  const {urls} = manifest(baselineDir);
  assert.ok(urls.includes('/posts/'), 'the section itself');
  assert.ok(urls.includes('/posts/index.xml'), 'its feed');
});

test('the two documents this module publishes are themselves listed', () => {
  const {urls} = manifest(baselineDir);
  assert.ok(urls.includes('/_redirects'));
  assert.ok(urls.includes('/url-manifest.txt'));
});

test('the header names the classes the module cannot enumerate', () => {
  const header = manifest(baselineDir).header.join('\n');
  assert.match(header, /static\//);
  assert.match(header, /url_retirement\.manifest\.extra/);
});

// A stamp would make every build differ from every other one in a line that
// says nothing about the URL surface, and the whole purpose of this file is to
// be compared against the copy production is serving.
test('the manifest carries no timestamp', () => {
  assert.doesNotMatch(readDoc(baselineDir, 'url-manifest.txt'), /\d{4}-\d{2}-\d{2}T/);
});
