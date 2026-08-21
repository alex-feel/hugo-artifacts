// The manifest's central claim: it lists every URL the build publishes AND a
// host serves. The expectation is derived by WALKING the build tree, not from a
// list a person maintained, so a URL the module forgets is a failure rather
// than an omission nobody notices.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  baselineDir,
  configuredDir,
  manifest,
  pagerUrls,
  publishedUrls,
  readDoc,
} from './helpers.js';

// Two URLs the build writes and the manifest does not carry, for two different
// reasons the header states separately.
//
// /sitemap.xml the module cannot SEE: the setting deciding its publication is
// one no template can read, so a site that wants it listed names it in
// manifest.extra -- which the configured build below does.
//
// /_redirects the module can see and leaves out on purpose. Every host that
// reads it consumes it at deploy time and answers 404 at its path, so it is
// published and never served; this document exists to be compared against what
// production serves, and the module renders that file itself, so it is the one
// party that knows it is a host control file rather than a page.
//
// Everything else in the tree has to be in the manifest.
const NOT_LISTED = ['/sitemap.xml', '/_redirects'];

test('the manifest lists exactly the URLs the build wrote to disk', () => {
  const published = publishedUrls(baselineDir)
    .filter((url) => !NOT_LISTED.includes(url))
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

// The shape that test cannot reach: TWO arrival paths claiming one URL. A URL
// arrives as a page's output format, as a pager the site registered, as a URL a
// module registered for a file it published outside the page graph, as a
// format owner's answer, or as an `extra` entry -- and the `configured`
// environment names one path in `extra` that a template also registers. The
// deduplication runs across the finished set rather than per arrival path, so
// the line appears once; a version that deduplicated per path would publish it
// twice, in a document compared line by line against production.
test('a URL two arrival paths claim is listed exactly once', () => {
  const url = '/probe/also-published-by-url-read.txt';

  // Both premises, asserted rather than assumed -- with only one arrival path
  // live, one line is what a broken deduplication would print too. The baseline
  // environment configures no `extra` at all and still lists it, which is the
  // registration arriving on its own; the `configured` environment's own
  // configuration is read for the second claim.
  assert.ok(
    manifest(baselineDir).urls.includes(url),
    'the fixture premise changed: nothing registers this URL any more',
  );
  const here = dirname(fileURLToPath(import.meta.url));
  const configured = readFileSync(
    join(here, '..', 'fixture', 'config', 'configured', 'params.toml'),
    'utf8',
  );
  assert.match(configured, /extra = \[[^\]]*also-published-by-url-read\.txt/);

  assert.equal(
    manifest(configuredDir).urls.filter((line) => line === url).length,
    1,
    `${url} is claimed by both a registration and an extra entry and must be listed once`,
  );
});

// A secondary output format is a published URL like any other. The fixture's
// sections and taxonomies each publish an RSS feed, so the manifest that
// ignored them would understate the surface by five entries here.
test('secondary output formats are listed beside their page', () => {
  const {urls} = manifest(baselineDir);
  assert.ok(urls.includes('/posts/'), 'the section itself');
  assert.ok(urls.includes('/posts/index.xml'), 'its feed');
});

// The two documents this module publishes are the sharpest case of the
// distinction above, because they are published the same way and only one of
// them is fetchable. The manifest is served like any other text file, so it
// lists itself; the redirect map is not, so it does not appear.
test('the manifest lists itself and leaves out the redirect map', () => {
  const {urls} = manifest(baselineDir);
  assert.ok(urls.includes('/url-manifest.txt'), 'the manifest stopped listing itself');
  assert.ok(
    !urls.includes('/_redirects'),
    'a URL no host serves is listed in a file meant to be diffed against production',
  );
});

// Both key names end at a word boundary, because a header naming a key that
// does not exist sends the reader to a setting they cannot use, and an
// unanchored match reads `manifest.excluded` as `manifest.exclude` and passes.
test('the header names the classes the module cannot enumerate', () => {
  const header = manifest(baselineDir).header.join('\n');
  assert.match(header, /static\//);
  assert.match(header, /url_retirement\.manifest\.extra\b/);
});

// An omission nobody can account for reads as a bug in the module, and the file
// is the only place the reader has to look: it travels to production without
// its README.
test('and states what it leaves out on purpose, plus how a site leaves out its own', () => {
  const header = manifest(baselineDir).header.join('\n');
  assert.match(header, /publishes and a host serves/);
  assert.match(header, /consumes at deploy time/);
  assert.match(header, /url_retirement\.manifest\.exclude\b/);
});

// A stamp would make every build differ from every other one in a line that
// says nothing about the URL surface, and the whole purpose of this file is to
// be compared against the copy production is serving.
test('the manifest carries no timestamp', () => {
  assert.doesNotMatch(readDoc(baselineDir, 'url-manifest.txt'), /\d{4}-\d{2}-\d{2}T/);
});

// manifest.exclude is the consumer's half of the same rule. A site renders its
// own host control files -- a _headers map, a _routes.json -- through output
// formats of its own, and the module can no more enumerate those than it can
// see what static/ holds.
//
// The configured build excludes one entry of each way a URL reaches the file,
// because the subtraction runs on the FINISHED set: a version of it that ran
// while the page loop was still going would drop the feed and leave the pager,
// the registered URL and the `extra` line standing.
test('an excluded output format is gone while its page stays', () => {
  const {urls} = manifest(configuredDir);
  assert.ok(urls.includes('/posts/'), 'the page went with its feed');
  assert.ok(!urls.includes('/posts/index.xml'), 'the excluded feed is still listed');
});

test('an excluded pager is gone while every other pager stays', () => {
  const {urls} = manifest(configuredDir);
  const pagers = pagerUrls(configuredDir);
  assert.ok(pagers.includes('/posts/page/2/'), 'the fixture publishes no such pager');
  assert.deepEqual(
    pagers.filter((url) => !urls.includes(url)),
    ['/posts/page/2/'],
    'excluding one pager reached a pager nobody excluded',
  );
});

test('a path named by both keys is left out, so exclude decides', () => {
  const {urls} = manifest(configuredDir);
  assert.ok(urls.includes('/sitemap.xml'), 'an extra entry nobody excluded was dropped');
  assert.ok(!urls.includes('/legacy/hand-copied.html'), 'the entry named by both keys survived');
});

// The exact set rather than the four absences: a subtraction that took more
// than it was given passes every assertion above.
test('and the configured manifest is the tree minus exactly what was excluded', () => {
  const excluded = [
    '/_redirects',
    '/posts/index.xml',
    '/posts/page/2/',
    '/probe/published-by-url-read.txt',
  ];
  const expected = publishedUrls(configuredDir)
    .filter((url) => !excluded.includes(url))
    .sort();
  assert.deepEqual(manifest(configuredDir).urls, expected);
});
