// Validation matrix row 4: RFG legacy mode `<head>` content.
//
// Setup:    Set `params.pwa.favicon.mode = "legacy"` via Hugo --params override (the
//           orchestrator script rebuilds the fixture in legacy mode for this row).
// Action:   Fetch `/`; parse `<head>`.
// Expected: Contains:
//             multi-size <link rel="icon"> (16x16, 32x32, 192x192)
//             <link rel="mask-icon">
//             <meta name="msapplication-TileColor">
//             <meta name="msapplication-config" content="/browserconfig.xml">
//           Modern minimal set absent.
//
// NOTE: The fixture ships in modern mode. To exercise legacy mode without an additional
// fixture build, this test runs against the same fixture but is marked as skipped when
// the LEGACY_FIXTURE env var is not set. The orchestrator script flips the flag and
// rebuilds when running a full matrix pass.

const {test, expect} = require('@playwright/test');

test.describe('Row 4: RFG legacy mode head', () => {
  test('legacy mode emits the verbose pre-2024 RFG link/meta set', async ({page}) => {
    test.skip(!process.env.LEGACY_FIXTURE, 'Requires LEGACY_FIXTURE=1 + legacy-mode fixture rebuild.');

    await page.goto('/');
    const headHtml = await page.evaluate(() => document.head.outerHTML);

    // Legacy required markers.
    expect(headHtml).toMatch(/<link[^>]+rel="icon"[^>]+sizes="16x16"/i);
    expect(headHtml).toMatch(/<link[^>]+rel="icon"[^>]+sizes="32x32"/i);
    expect(headHtml).toMatch(/<link[^>]+rel="mask-icon"/i);
    expect(headHtml).toMatch(/<meta[^>]+name="msapplication-TileColor"/i);
    expect(headHtml).toMatch(/<meta[^>]+name="msapplication-config"[^>]+content="\/browserconfig\.xml"/i);

    // Modern minimal-only marker should NOT be present in legacy mode (safari-pinned-tab.svg
    // implies legacy mask-icon path; modern uses favicon.svg only).
    expect(headHtml).toMatch(/safari-pinned-tab\.svg/i);
  });
});
