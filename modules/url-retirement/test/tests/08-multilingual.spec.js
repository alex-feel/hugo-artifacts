// One _redirects file written by two languages, and one manifest per language.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {multilingualDir, docExists, manifest, redirectRules, publishedUrls} from './helpers.js';

// /_redirects is published once at the site root, so on a multilingual site
// every language renders the same path and the last one to render wins. That is
// harmless only because the file is built from every language, which makes all
// of their renders identical -- a file built from the rendering language alone
// would silently carry whichever language happened to finish last.
test('the one _redirects file carries the aliases of every language', () => {
  const froms = redirectRules(multilingualDir).map((r) => r.from);
  assert.ok(froms.includes('/old-post-one/'), 'the default language is missing');
  assert.ok(froms.includes('/de/alter-pfad/'), 'the second language is missing');
});

test('a translated page is redirected to its own translation, not to the default one', () => {
  const rule = redirectRules(multilingualDir).find((r) => r.from === '/de/alter-pfad/');
  assert.equal(rule.to, '/de/posts/post-de/');
});

test('there is exactly one redirect map, at the root', () => {
  assert.deepEqual(
    publishedUrls(multilingualDir).filter((url) => url.endsWith('_redirects')),
    ['/_redirects'],
  );
});

test('each language publishes its own manifest', () => {
  assert.ok(docExists(multilingualDir, 'url-manifest.txt'));
  assert.ok(docExists(multilingualDir, 'de/url-manifest.txt'));
});

test('a manifest lists its own language only', () => {
  const en = manifest(multilingualDir).urls;
  const de = manifest(multilingualDir, 'de/url-manifest.txt').urls;
  assert.ok(en.includes('/posts/post-1/'));
  assert.ok(!en.some((url) => url.startsWith('/de/')));
  assert.ok(de.includes('/de/posts/post-de/'));
});

// A checker that starts at the site root has to be able to find the rest, and
// nothing else in the build tells it how many languages there are.
test('each manifest header names its siblings', () => {
  assert.ok(
    manifest(multilingualDir).header.some((h) => h.includes('/de/url-manifest.txt')),
    'the default-language manifest does not name the other one',
  );
  assert.ok(
    manifest(multilingualDir, 'de/url-manifest.txt').header.some((h) =>
      h.includes('/url-manifest.txt'),
    ),
  );
});

// Hugo renders one language completely before starting the next, so the copy
// of /_redirects that survives is the LAST language's -- and pager rules, unlike
// alias rules, are built from registrations made during each language's own html
// pass. A file assembled from the rendering language alone would carry German's
// pagers and drop English's.
test('the surviving redirect map carries the first pager of every language', () => {
  const byFrom = new Map(redirectRules(multilingualDir).map((r) => [r.from, r.to]));
  assert.equal(byFrom.get('/page/1/'), '/');
  assert.equal(byFrom.get('/posts/page/1/'), '/posts/');
  assert.equal(byFrom.get('/de/seite/1/'), '/de/');
  assert.equal(byFrom.get('/de/posts/seite/1/'), '/de/posts/');
});

// German localizes pagination.path, and nothing in that language paginates past
// one pager, so no pager URL can name its segment -- which is the only case
// redirects.pagination_path exists for. English names its own segment through
// the second pager it publishes, and needs no key.
test('each language uses its own pagination segment', () => {
  assert.ok(
    !publishedUrls(multilingualDir).some((url) => /^\/de\/.*\/(seite|page)\/\d+\/$/.test(url)),
    'German grew a second pager; its segment is no longer configuration-only',
  );
  assert.ok(publishedUrls(multilingualDir).includes('/posts/page/2/'), 'English derives its own');
  for (const rule of redirectRules(multilingualDir)) {
    if (rule.from.startsWith('/de/'))
      assert.ok(!rule.from.includes('/page/'), `${rule.from} used the English segment`);
    else assert.ok(!rule.from.includes('/seite/'), `${rule.from} used the German segment`);
  }
});

test('the pager registration is scoped per language', () => {
  const de = manifest(multilingualDir, 'de/url-manifest.txt').urls;
  assert.ok(
    !de.some((url) => url.startsWith('/posts/page/')),
    "the second language's manifest republished the first language's pagers",
  );
});
