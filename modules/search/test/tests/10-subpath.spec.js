// The search-page URL under a baseURL that carries a PATH.
//
// Hugo resolves a leading-slash value against the host root, DISCARDING the
// baseURL path -- for relURL and relLangURL exactly as for absURL. Every other
// build in this suite sits at a domain root, where a correct implementation
// and a broken one emit identical bytes, so this static overlay is the only
// place the difference exists.
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
