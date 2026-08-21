// The manifest is built by crossing every page with its output formats, and a
// build publishes things that are in neither: a file the asset pipeline wrote,
// a page kept out of every collection, a file copied from static/. Those reach
// the file only because the template that published them registered the URL,
// and this is the arrival path that can ADD a line no file backs -- the mirror
// of the publication hooks, which can only ever remove one.
//
// The fixture registers the URL of a global asset, which is the real shape
// rather than a stand-in: reading a Resource's .RelPermalink is what writes the
// file, so the registration names a URL the build genuinely produced.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {
  baselineDir,
  canonifyDir,
  docExists,
  manifest,
  moduleWarnings,
  multihostDir,
  publishedUrls,
  readDoc,
  renderEarlyDir,
  subpathDir,
} from './helpers.js';

const PROBE = '/probe/published-by-url-read.txt';
// The list form of the call, carrying the two kinds of URL a site has to name
// itself: a second asset the pipeline published when a template read its URL,
// and a file copied verbatim out of static/, which Hugo exposes to no template
// at all so its path can only be a literal.
const LISTED = ['/probe/also-published-by-url-read.txt', '/probe/copied-verbatim.txt'];

test('the registered URL names a file this build wrote', () => {
  assert.ok(docExists(baselineDir, 'probe/published-by-url-read.txt'));
  assert.ok(manifest(baselineDir).urls.includes(PROBE), 'a registered URL is missing');
});

// One call, several URLs. Hugo's `append` flattens a slice argument, so a
// version of the partial that accumulated candidates with it would take a list
// passed to the single-URL key apart and register its elements silently -- and
// the mirror of that mistake, losing the .urls list entirely, publishes two
// files nothing lists.
test('and a call passing a list registers every URL in it', () => {
  const {urls} = manifest(baselineDir);
  for (const url of LISTED) {
    assert.ok(docExists(baselineDir, url.slice(1)), `${url} must be published to mean anything`);
    assert.ok(urls.includes(url), `${url} was registered in a list and is missing`);
  }
});

// Why it needed registering at all. The page walk is the manifest's only other
// source, and the sitemap is that same walk's own projection: a URL absent from
// the sitemap and present in the manifest is one nothing but a registration
// could have put there.
test('and nothing that walks pages can see it', () => {
  assert.doesNotMatch(readDoc(baselineDir, 'sitemap.xml'), /probe\/published-by-url-read/);
});

// A registered URL is subtracted like any other. The configured build excludes
// this one, which is the fourth of the four ways a URL reaches the file, and
// 03-manifest.spec.js asserts that set exactly.
test('the manifest carries it at the site root and under a baseURL path alike', () => {
  assert.ok(manifest(subpathDir).urls.includes(`/docs${PROBE}`), 'the base segment is missing');
  assert.deepEqual(
    manifest(canonifyDir).urls,
    manifest(subpathDir).urls,
    'the canonified build disagrees with the subpath one',
  );
});

// A global resource is materialized once per build, so Hugo reports ONE URL for
// it however many hosts publish it -- measured at v0.164.0: both hosts wrote
// the file at their own root and both read "/docs/..." for it, the path segment
// of whichever host rendered first. Listed as it came, the host with no path
// segment would advertise a path it answers 404 for. Each manifest has to carry
// the URL its OWN host serves.
test('each host lists the registered URL in its own frame', () => {
  for (const [host, base] of [
    ['de', '/docs'],
    ['en', ''],
  ]) {
    const {urls} = manifest(multihostDir, `${host}/url-manifest.txt`);
    assert.ok(
      urls.includes(`${base}${PROBE}`),
      `the ${host} manifest does not list ${base}${PROBE}: ${urls.join(', ')}`,
    );
    assert.ok(
      publishedUrls(join(multihostDir, host)).includes(PROBE),
      `the ${host} host did not publish the file its manifest names`,
    );
  }
});

// The failure mode the whole mechanism has to survive. /url-manifest.txt is
// weighted so its pass runs after html's, and a site that inverts that gets a
// manifest written before anything could register a URL for it. Everything
// registered is then lost -- which is the silent omission this document exists
// to prevent, arriving through the machinery meant to prevent it.
const registrationWarnings = () =>
  moduleWarnings('renderEarly')
    .map((line) => /^\[url-retirement\] (\S+) was registered for/.exec(line))
    .filter(Boolean)
    .map((m) => m[1])
    .sort();

test('a build that renders the manifest first loses every registration', () => {
  assert.deepEqual(
    publishedUrls(renderEarlyDir).sort(),
    publishedUrls(baselineDir).sort(),
    'the two builds no longer publish the same tree, so the comparison below means nothing',
  );
  const lost = manifest(baselineDir).urls.filter(
    (url) => !manifest(renderEarlyDir).urls.includes(url),
  );
  assert.ok(lost.length > 0, 'the misconfigured build lost nothing, so it rendered in order');
  assert.ok(lost.includes(PROBE), 'the registered asset URL survived a manifest written first');
});

// And says so, once per URL. Derived from what was actually lost rather than
// counted, so a diagnostic that stopped naming one of them fails here instead
// of letting that URL disappear quietly. The warned set is the LARGER one: a
// list page registers its own URL alongside its pagers, and that URL reaches
// the manifest through the page walk as well, so refusing the registration
// costs it nothing. Every warned URL is nonetheless a URL this build really
// publishes -- a diagnostic naming a path nothing serves would send its reader
// looking for a file that was never there.
test('and names every URL it lost, one diagnostic each', () => {
  const lost = manifest(baselineDir)
    .urls.filter((url) => !manifest(renderEarlyDir).urls.includes(url))
    .sort();
  const warned = registrationWarnings();
  assert.deepEqual(
    lost.filter((url) => !warned.includes(url)),
    [],
    'a URL vanished from the manifest with nothing said about it',
  );
  const published = publishedUrls(renderEarlyDir);
  assert.deepEqual(
    warned.filter((url) => !published.includes(url)),
    [],
    'a diagnostic named a URL this build never published',
  );
  assert.equal(new Set(warned).size, warned.length, 'one URL was reported twice');
});

test('and warns about nothing else at all', () => {
  const other = moduleWarnings('renderEarly').filter((l) => !/ was registered for /.test(l));
  assert.deepEqual(other, [], 'the misconfigured build reported something unrelated');
});
