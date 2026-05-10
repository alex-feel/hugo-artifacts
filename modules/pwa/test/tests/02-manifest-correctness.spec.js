// Validation matrix row 2: Manifest correctness.
//
// Setup:    Default `params.pwa.manifest.mode = "templated"` (fixture defines name + colors).
// Action:   Fetch `/manifest.webmanifest` (Hugo `webappmanifest` output format).
// Expected: Status 200; `application/manifest+json`; valid JSON; required keys present:
//           name, short_name, start_url, scope, display=standalone, display_override array,
//           id, theme_color, background_color, icons[] with at least 192px + 512px (any) +
//           512px maskable.

const {test, expect} = require('@playwright/test');

test.describe('Row 2: Manifest correctness', () => {
  test('manifest is valid JSON with required PWA keys', async ({page}) => {
    const response = await page.request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/manifest\+json|application\/json/);

    const manifest = await response.json();

    // Required strings.
    expect(manifest.name).toBe('PWA Fixture');
    expect(manifest.short_name).toBe('Fixture');
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.scope).toBeTruthy();
    expect(manifest.id).toBeTruthy();

    // Display + display_override.
    expect(manifest.display).toBe('standalone');
    expect(Array.isArray(manifest.display_override)).toBe(true);
    expect(manifest.display_override).toEqual(
      expect.arrayContaining(['window-controls-overlay', 'standalone', 'minimal-ui']),
    );

    // Theme + background colors (set by fixture/hugo.toml).
    expect(manifest.theme_color).toBe('#3367d6');
    expect(manifest.background_color).toBe('#ffffff');

    // Icons array must include 192px any, 512px any, 512px maskable (per RFG modern set).
    expect(Array.isArray(manifest.icons)).toBe(true);
    const sizes = manifest.icons.map((i) => `${i.sizes}|${i.purpose || 'any'}`);
    expect(sizes).toEqual(expect.arrayContaining([
      expect.stringContaining('192x192'),
      expect.stringContaining('512x512'),
    ]));
    const hasMaskable = manifest.icons.some(
      (i) => (i.purpose || '').includes('maskable') && i.sizes && i.sizes.includes('512x512'),
    );
    expect(hasMaskable).toBe(true);
  });
});
