// The search-page URL under a baseURL that carries a PATH.
//
// Hugo resolves a leading-slash value against the host root, DISCARDING the
// baseURL path -- for relURL and relLangURL exactly as for absURL. Every other
// build in this suite sits at a domain root, where a correct implementation
// and a broken one emit identical bytes, so this static overlay is the only
// place the difference exists -- for the fallback links AND for the OpenSearch
// document, the module's one absolute-URL surface (the base fixture's
// opensearch opt-in merges into this build).
//
// The overlay also points page_path at a page that does not exist, because
// that is the only way to reach the fallback branch: with the page present,
// page_url comes from .RelPermalink, which already carries the path and hides
// the defect.
/* global process */
import {test, expect} from '@playwright/test';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const subpathDir = process.env.SUBPATH_DIR;

test('the fallback search-page URL keeps the baseURL path', async () => {
  expect(subpathDir, 'the runner must export SUBPATH_DIR').toBeTruthy();
  const index = join(subpathDir, 'index.html');
  expect(existsSync(index)).toBe(true);
  const html = readFileSync(index, 'utf8');

  // Every emitted reference to the search page must live under /docs/.
  const refs = [...html.matchAll(/["'(](\/[^"'()\s]*no-such-search-page[^"'()\s]*)/g)].map(
    (m) => m[1],
  );
  expect(refs.length).toBeGreaterThan(0);
  for (const ref of refs) {
    expect(ref.startsWith('/docs/')).toBe(true);
  }
});

test('the opensearch Url template carries the full subpath base exactly once', async () => {
  expect(subpathDir, 'the runner must export SUBPATH_DIR').toBeTruthy();
  const file = join(subpathDir, 'opensearch.xml');
  expect(existsSync(file)).toBe(true);
  const xml = readFileSync(file, 'utf8');

  // Exact equality, not a prefix check: a derivation that discarded the
  // baseURL path would emit https://example.org/no-such-search-page..., and
  // one that resolved a path-less value against the full baseURL would
  // double it (https://example.org/docs/docs/...) -- and the doubled
  // spelling still BEGINS with the subpath base, so only the exact form
  // locks the derivation.
  const template = /<Url type="text\/html"[^>]*template="([^"]+)"/.exec(xml)?.[1];
  expect(template).toBe('https://example.org/docs/no-such-search-page?q={searchTerms}');

  // The self-reference rides .Permalink and must carry the path too.
  const self = /rel="self" template="([^"]+)"/.exec(xml)?.[1];
  expect(self).toBe('https://example.org/docs/opensearch.xml');
});
