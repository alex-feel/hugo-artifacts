// Serialized-index caching (forced on in the fixture) and the full
// CustomEvent contract, including the inbound search:rescan hook.
/* global document, window, caches, URL, CustomEvent */
import {test, expect} from '@playwright/test';

async function captureReady(page) {
  await page.evaluate(() => {
    window.__readies = [];
    document.addEventListener('search:ready', (event) => window.__readies.push(event.detail));
  });
}

test('first build from network, warm start from cache; compound key rides the query string', async ({
  page,
}) => {
  await page.goto('/search/');
  await captureReady(page);
  await page.locator('.search--page .search__input').focus();
  await expect.poll(() => page.evaluate(() => window.__readies.length)).toBeGreaterThan(0);
  const first = await page.evaluate(() => window.__readies[0]);
  expect(first.source).toBe('network');

  // The envelope is fetched on BOTH loads; source names the INDEX-BUILD
  // source, so the reload builds from the serialized cache entry.
  await page.reload();
  await captureReady(page);
  await page.locator('.search--page .search__input').focus();
  await expect.poll(() => page.evaluate(() => window.__readies.length)).toBeGreaterThan(0);
  const second = await page.evaluate(() => window.__readies[0]);
  expect(second.source).toBe('cache');

  // The discriminator rides the QUERY STRING of the stored Request URL, and
  // a mutated discriminator MISSES -- the digest/options/engine
  // invalidation mechanism.
  const info = await page.evaluate(async () => {
    const cache = await caches.open('search-index-v1');
    const keys = await cache.keys();
    const target = keys.map((request) => request.url).find((u) => u.includes('/searchindex.json'));
    const url = new URL(target);
    const discriminator = url.searchParams.get('search-cache');
    const mutated = new URL(target);
    mutated.searchParams.set('search-cache', 'deadbeef');
    const miss = await cache.match(mutated.toString());
    const hit = await cache.match(target);
    return {discriminator, missed: miss === undefined, hit: hit !== undefined};
  });
  expect(info.discriminator).toMatch(/^[0-9a-f]+$/);
  expect(info.hit).toBeTruthy();
  expect(info.missed).toBeTruthy();
});

test('event payload walk and the search:rescan inbound hook', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__events = [];
    for (const name of ['search:query', 'search:results', 'search:open', 'search:close']) {
      document.addEventListener(name, (event) =>
        window.__events.push({name, detail: event.detail}),
      );
    }
  });

  await page.locator('.search--inline .search__input').fill('gravity');
  await expect
    .poll(() => page.evaluate(() => window.__events.some((e) => e.name === 'search:results')))
    .toBeTruthy();
  const typed = await page.evaluate(() => window.__events);
  expect(typed.find((e) => e.name === 'search:query').detail).toMatchObject({
    query: 'gravity',
    surface: 'inline',
  });
  expect(typed.find((e) => e.name === 'search:results').detail).toMatchObject({
    query: 'gravity',
    count: 2,
    surface: 'inline',
  });

  await page.keyboard.press('Control+KeyK');
  await expect(page.locator('.search--modal .search__dialog')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.evaluate(() => window.__events.filter((e) => e.name === 'search:close').length),
    )
    .toBeGreaterThan(0);
  const events = await page.evaluate(() => window.__events);
  expect(events.find((e) => e.name === 'search:open').detail).toMatchObject({surface: 'modal'});
  expect(events.find((e) => e.name === 'search:close').detail).toMatchObject({surface: 'modal'});

  // search:rescan wires a late-inserted root.
  const enhancedCount = await page.evaluate(() => {
    const root = document.querySelector('.search--inline');
    const clone = root.cloneNode(true);
    clone.classList.remove('search--enhanced');
    document.body.appendChild(clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
    return document.querySelectorAll('.search--inline.search--enhanced').length;
  });
  expect(enhancedCount).toBe(2);
});
