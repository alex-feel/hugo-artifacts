// Validation matrix row 9: PWA installability assertions.
//
// Setup:    Default fixture site running on port 1313.
// Action:   Fetch /manifest.webmanifest; inspect head <link rel="manifest">;
//           inspect navigator.serviceWorker.ready + controller; assert all PWA
//           installability criteria are satisfied.
// Expected: Manifest is well-formed and present; required fields populated;
//           icons set covers >=192x192 + >=512x512; SW is registered and active.
//
// This row asserts the same PWA installability properties Chrome enforces for
// "Add to Home Screen" eligibility and that Lighthouse's PWA category audited
// before its removal in Lighthouse v12.0. Direct Playwright assertions replace
// the Lighthouse CLI invocation; the assertions are deterministic, do not
// depend on Chrome version (Chrome 133+ via Playwright bundled Chromium), and
// do not require any external CLI or npm devDependency beyond @playwright/test.
//
// PWA installability criteria asserted (Chrome installability, W3C manifest):
//   - <link rel="manifest"> present in <head>
//   - manifest.webmanifest fetches with 200 OK and is valid JSON
//   - manifest.name (or short_name) is non-empty string
//   - manifest.start_url is present and resolves to 200 from baseURL
//   - manifest.display in {standalone, fullscreen, minimal-ui, browser} or
//     display_override array contains one of these
//   - manifest.icons contains >=1 icon with sizes >=192x192
//   - manifest.icons contains >=1 icon with sizes >=512x512
//   - navigator.serviceWorker.ready resolves with a registration whose .active
//     is non-null
//   - navigator.serviceWorker.controller is non-null after ready resolves
//     (service worker is currently controlling the page)

const {test, expect} = require('@playwright/test');

test.describe('Row 9: Lighthouse PWA audit', () => {
  test('Manifest, icons, and SW satisfy PWA installability criteria', async ({page}) => {
    test.setTimeout(60_000);

    await page.goto('/');

    // Wait for SW to install AND control the page.
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      null,
      {timeout: 30_000},
    );

    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return {
        active: !!reg.active,
        controllerScriptUrl: navigator.serviceWorker.controller
          ? navigator.serviceWorker.controller.scriptURL
          : null,
      };
    });
    expect(swState.active, 'serviceWorker.ready -> registration.active').toBe(true);
    expect(swState.controllerScriptUrl, 'navigator.serviceWorker.controller').toBeTruthy();

    // <link rel="manifest"> present.
    const manifestLinks = await page.locator('head link[rel="manifest"]').count();
    expect(manifestLinks, 'head <link rel="manifest"> count').toBeGreaterThanOrEqual(1);

    const manifestHref = await page
      .locator('head link[rel="manifest"]')
      .first()
      .getAttribute('href');
    expect(manifestHref, 'manifest href attribute').toBeTruthy();

    // Manifest fetches and parses.
    const manifestResponse = await page.request.get(manifestHref);
    expect(manifestResponse.status(), 'manifest fetch status').toBe(200);
    const manifest = await manifestResponse.json();

    // name OR short_name non-empty.
    const hasName = typeof manifest.name === 'string' && manifest.name.length > 0;
    const hasShortName = typeof manifest.short_name === 'string' && manifest.short_name.length > 0;
    expect(hasName || hasShortName, 'manifest.name or manifest.short_name non-empty').toBe(true);

    // start_url present and reachable from baseURL.
    expect(manifest.start_url, 'manifest.start_url').toBeTruthy();
    const startResponse = await page.request.get(manifest.start_url);
    expect(startResponse.status(), 'start_url fetch status').toBe(200);

    // display field in valid set OR display_override contains one.
    const validDisplays = ['standalone', 'fullscreen', 'minimal-ui', 'browser'];
    const overrideValid = Array.isArray(manifest.display_override)
      && manifest.display_override.some((d) => validDisplays.includes(d));
    const displayValid = validDisplays.includes(manifest.display);
    expect(
      overrideValid || displayValid,
      `manifest.display "${manifest.display}" or display_override valid`,
    ).toBe(true);

    // icons set covers >=192x192 AND >=512x512.
    expect(Array.isArray(manifest.icons), 'manifest.icons is array').toBe(true);

    const sizeOf = (icon) => {
      if (typeof icon.sizes !== 'string') return [0, 0];
      const first = icon.sizes.split(' ').sort().pop();
      const [w, h] = first.split('x').map((n) => parseInt(n, 10) || 0);
      return [w, h];
    };
    const has192 = manifest.icons.some((icon) => {
      const [w, h] = sizeOf(icon);
      return w >= 192 && h >= 192;
    });
    const has512 = manifest.icons.some((icon) => {
      const [w, h] = sizeOf(icon);
      return w >= 512 && h >= 512;
    });
    expect(has192, 'manifest.icons covers >=192x192').toBe(true);
    expect(has512, 'manifest.icons covers >=512x512').toBe(true);
  });
});
