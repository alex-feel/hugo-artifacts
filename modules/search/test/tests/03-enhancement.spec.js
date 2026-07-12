// Progressive enhancement: the enhanced marker, intent-gated index fetch,
// the module worker, and the search:ready payload.
/* global document, window */
import {test, expect} from '@playwright/test';

test('no index fetch before intent; focus triggers fetch, worker, and ready', async ({page}) => {
  const indexRequests = [];
  page.on('request', (req) => {
    if (req.url().includes('searchindex.json')) {
      indexRequests.push(req.url());
    }
  });

  await page.goto('/');
  await expect(page.locator('.search--inline')).toHaveClass(/search--enhanced/);
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);

  // Neither the inline nor the modal surface prefetches without intent
  // (only the dedicated search page idle-prefetches).
  await page.waitForTimeout(1200);
  expect(indexRequests).toHaveLength(0);

  await page.evaluate(() => {
    document.addEventListener('search:ready', (event) => {
      window.__searchReady = event.detail;
    });
  });
  await page.locator('.search--inline .search__input').focus();

  await expect.poll(() => page.evaluate(() => window.__searchReady)).toBeTruthy();
  const ready = await page.evaluate(() => window.__searchReady);
  expect(ready.lang).toBe('en');
  expect(ready.docCount).toBeGreaterThan(0);
  expect(['cache', 'network']).toContain(ready.source);
  expect(indexRequests.length).toBeGreaterThan(0);

  // The backend runs in a module worker built from the fingerprinted
  // artifact named on data-search-worker-url.
  await expect
    .poll(() => page.workers().some((w) => /search-worker\.[0-9a-f]{40,}\.js/.test(w.url())))
    .toBeTruthy();
});
