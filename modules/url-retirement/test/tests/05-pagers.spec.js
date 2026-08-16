// Paginated list pages are the class this module exists for. They are absent
// from site.Pages, from every page's output formats and from the sitemap, so a
// coverage check built on a sitemap can never see one disappear -- which is how
// an indexed /blog/page/4/ turns into a 404 with every check green.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baselineDir, manifest, pagerUrls, readDoc} from './helpers.js';

test('the fixture actually publishes pager pages', () => {
  assert.deepEqual(pagerUrls(baselineDir), ['/posts/page/2/', '/posts/page/3/']);
});

test('the sitemap contains none of them, which is the defect this module answers', () => {
  const sitemap = readDoc(baselineDir, 'sitemap.xml');
  for (const url of pagerUrls(baselineDir))
    assert.ok(!sitemap.includes(url), `${url} is in the sitemap; the premise no longer holds`);
});

test('the manifest contains every one of them', () => {
  const {urls} = manifest(baselineDir);
  for (const url of pagerUrls(baselineDir))
    assert.ok(urls.includes(url), `${url} is published but missing from the manifest`);
});

// The site's own list template registers them, passing the paginator it already
// built. Reaching for a foreign page's paginator instead would either raise
// (in a non-html output format) or CREATE one, publishing pager pages the site
// never asked for -- so the fixture's registration is the only thing that can
// have put these URLs in the manifest.
test('registration adds the pagers and nothing else', () => {
  const {urls} = manifest(baselineDir);
  const pagers = urls.filter((u) => /\/page\/\d+\/$/.test(u));
  assert.deepEqual(pagers, pagerUrls(baselineDir));
});
