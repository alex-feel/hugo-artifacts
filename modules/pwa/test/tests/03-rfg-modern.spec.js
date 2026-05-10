// Validation matrix row 3: RFG modern mode `<head>` content.
//
// Setup:    Default `params.pwa.favicon.mode = "modern"` (set in fixture/hugo.toml).
// Action:   Fetch `/`; parse `<head>`.
// Expected: Contains:
//             <link rel="manifest">
//             <link rel="icon" type="image/svg+xml" href="/favicon.svg">
//             <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
//             <meta name="theme-color">
//             <meta name="apple-mobile-web-app-capable">
//           Does NOT contain `mstile-*` or `browserconfig.xml` references.

const {test, expect} = require('@playwright/test');

test.describe('Row 3: RFG modern mode head', () => {
  test('modern mode emits the minimal 2024 RFG link/meta set', async ({page}) => {
    await page.goto('/');
    const headHtml = await page.evaluate(() => document.head.outerHTML);

    // Required modern set.
    expect(headHtml).toMatch(/<link[^>]+rel="manifest"/i);
    expect(headHtml).toMatch(/<link[^>]+rel="icon"[^>]+type="image\/svg\+xml"[^>]+href="\/favicon\.svg"/i);
    expect(headHtml).toMatch(/<link[^>]+rel="apple-touch-icon"[^>]+sizes="180x180"[^>]+href="\/apple-touch-icon\.png"/i);
    expect(headHtml).toMatch(/<meta[^>]+name="theme-color"/i);
    expect(headHtml).toMatch(/<meta[^>]+name="apple-mobile-web-app-capable"/i);

    // Modern mode MUST NOT emit legacy mstile / browserconfig markers.
    expect(headHtml).not.toMatch(/mstile-/i);
    expect(headHtml).not.toMatch(/browserconfig\.xml/i);
  });
});
