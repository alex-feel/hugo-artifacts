// Validation matrix row 7: Offline rendering (precached + offline fallback).
//
// Setup:    Default; SW activated and precache populated.
// Action:   Navigate to `/`; reload (SW takes control); simulate offline by intercepting
//           all network requests; navigate to `/about/` (precached) and `/never-visited/`
//           (not precached -> offline fallback).
// Expected: After SW activation + reload + offline simulation:
//             - /about/ (precached) renders with site styling
//             - /never-visited/ falls back to the precached /offline/ page, which renders
//               the module's offline layout (heading + retry button), NOT an empty page
//             - the /offline/ page exists online but is EXCLUDED from sitemap.xml

const {test, expect} = require('@playwright/test');

test.describe('Row 7: Offline rendering', () => {
  test('the /offline/ page renders the module offline layout (not an empty fallback)', async ({
    page,
  }) => {
    await page.goto('/offline/');
    // The module layout (layouts/offline/single.html) wraps the message in
    // <article class="pwa-offline"> with a heading and a retry button. Before
    // the layout was relocated out of the removed _default/ directory, the page
    // fell through to the consumer's single.html and rendered an empty body.
    await expect(page.locator('article.pwa-offline')).toBeVisible();
    await expect(page.locator('article.pwa-offline')).toContainText(/offline/i);
    await expect(page.locator('article.pwa-offline button')).toBeVisible();
  });

  test('the /offline/ page is excluded from sitemap.xml', async ({request}) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBe(true);
    const xml = await res.text();
    expect(xml).not.toContain('/offline/');
    // Sanity: the sitemap is a non-empty urlset that lists real pages, so the
    // absence of /offline/ reflects exclusion, not an empty sitemap. (Uses a
    // path, not the baseURL, which differs between configured host and test host.)
    expect(xml).toContain('<urlset');
    expect(xml).toContain('/about/');
  });

  test('precached pages render offline; non-precached falls back to the /offline/ page', async ({
    page,
    context,
  }) => {
    // Prime the SW + precache.
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 10000,
    });

    // Visit /about/ once so it is also runtime-cached, in case precache top-N excluded it.
    await page.goto('/about/');
    await page.waitForLoadState('networkidle');

    // Visit /blog/post-1/ to cover the "include_recent_pages" path.
    await page.goto('/blog/post-1/');
    await page.waitForLoadState('networkidle');

    // Simulate offline by intercepting all requests with abort.
    await context.route('**/*', (route) => route.abort('internetdisconnected'));

    // Re-visit a precached page; expect a successful render despite offline.
    const aboutResp = await page.goto('/about/').catch(() => null);
    if (aboutResp) {
      expect(aboutResp.ok()).toBe(true);
    } else {
      // Some Workbox strategies serve from cache without producing a navigation Response;
      // fall back to inspecting the rendered DOM.
      await expect(page.locator('h2')).toContainText('About');
    }

    // Visit a never-visited URL; the SW catch handler must serve the precached
    // /offline/ page. Assert on the offline layout's marker so an empty or wrong
    // fallback (the pre-fix behavior) fails this test.
    await page.goto('/never-visited/', {waitUntil: 'domcontentloaded'}).catch(() => null);
    await expect(page.locator('article.pwa-offline')).toBeVisible({timeout: 10000});
    await expect(page.locator('article.pwa-offline')).toContainText(/offline/i);
  });
});
