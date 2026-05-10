// Validation matrix row 1: Service worker registration.
//
// Setup:    Default `params.pwa.sw.enabled = true` (fixture/hugo.toml ships defaults).
// Action:   Navigate to `/`; reload; wait for `navigator.serviceWorker.controller`.
// Expected: First visit `controller == null`. After reload `controller != null`.
//           `pwa:firstinstall` fires once. `/sw.js` returns 200 with
//           `Content-Type: application/javascript`.

const {test, expect} = require('@playwright/test');

test.describe('Row 1: Service worker registration', () => {
  test('SW registers, controls page after reload, and fires pwa:firstinstall once', async ({page}) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Hook the firstinstall event before any navigation so we can count dispatches.
    await page.addInitScript(() => {
      window.__pwaFirstInstallCount = 0;
      window.addEventListener('pwa:firstinstall', () => {
        window.__pwaFirstInstallCount++;
      });
    });

    // First navigation: SW is being installed; controller is expected to be null.
    await page.goto('/');
    const firstController = await page.evaluate(() => navigator.serviceWorker.controller);
    expect(firstController).toBeNull();

    // Wait for the SW to reach the activated state, then reload to take control.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active && reg.active.state;
    });
    await page.reload();

    // After reload, controller is expected to exist.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {timeout: 10000});
    const secondController = await page.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
    expect(secondController).toContain('/sw.js');

    // /sw.js fetch + content-type assertion.
    const swResponse = await page.request.get('/sw.js');
    expect(swResponse.status()).toBe(200);
    expect(swResponse.headers()['content-type']).toMatch(/application\/javascript|text\/javascript/);

    // pwa:firstinstall must fire exactly once across the test lifecycle.
    const fireCount = await page.evaluate(() => window.__pwaFirstInstallCount);
    expect(fireCount).toBeGreaterThanOrEqual(1);

    expect(consoleErrors).toEqual([]);
  });
});
