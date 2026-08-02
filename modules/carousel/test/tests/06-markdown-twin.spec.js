// Markdown twin output (carousel.markdown.md): fetches the .md twin URL of
// the match-mode and items-mode pages and asserts pure Markdown -- zero
// angle brackets, zero class= tokens, slide order preserved, alt text and
// caption lines present, and the ORIGINAL resource's absolute Permalink (no
// derivative). The killed-overlay build (enable=false) must publish an
// empty or absent carousel block in its twin, since the master switch
// strips markup and script from the whole build, HTML and Markdown twins
// alike.
/* global process */
import {readFileSync} from 'node:fs';
import {test, expect} from '@playwright/test';

const BASE = 'http://localhost:1717';

test.describe('gallery page twin (match mode)', () => {
  test('is pure Markdown: no angle brackets, no class=, no svg', async ({page}) => {
    const res = await page.request.get(`${BASE}/gallery/index.md`);
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).not.toContain('<');
    expect(body).not.toContain('class=');
    expect(body).not.toContain('<svg');
    expect(body).not.toContain('data-');
  });

  test('preserves slide order and emits alt text plus caption lines', async ({page}) => {
    const res = await page.request.get(`${BASE}/gallery/index.md`);
    const body = await res.text();
    const idxLogin = body.indexOf('Login screen before redesign');
    const idxDashboard = body.indexOf('Dashboard after login');
    const idxSettings = body.indexOf('Settings panel');
    expect(idxLogin).toBeGreaterThan(-1);
    expect(idxDashboard).toBeGreaterThan(idxLogin);
    expect(idxSettings).toBeGreaterThan(idxDashboard);

    // Image line: alt text inside the brackets.
    expect(body).toMatch(/!\[Login screen before redesign]\(https?:\/\/[^)]+01-login\.png\)/);
    // Caption line directly below (resource .Title differs from .Name).
    expect(body).toContain('Login screen before redesign\n');
  });

  test('image URLs are absolute original permalinks, not derivatives', async ({page}) => {
    const res = await page.request.get(`${BASE}/gallery/index.md`);
    const body = await res.text();
    const urls = [...body.matchAll(/!\[[^\]]*]\((\S+)\)/g)].map((m) => m[1]);
    expect(urls.length).toBe(4);
    for (const url of urls) {
      expect(url.startsWith('http://') || url.startsWith('https://')).toBe(true);
      // A processed derivative would carry a Hugo-generated resize suffix
      // (e.g. "_hu...") or a format conversion; the original filenames stay
      // intact.
      expect(url).toMatch(/\/(01-login|02-dashboard|03-settings|04-profile)\.png$/);
    }
  });

  test('the alt-less slide (04-profile.png) emits the empty label', async ({page}) => {
    const res = await page.request.get(`${BASE}/gallery/index.md`);
    const body = await res.text();
    expect(body).toMatch(/!\[]\(https?:\/\/[^)]+04-profile\.png\)/);
  });
});

test.describe('items page twin (curated order)', () => {
  test('preserves the curated items order: beta, gamma, alpha', async ({page}) => {
    const res = await page.request.get(`${BASE}/items-page/index.md`);
    expect(res.ok()).toBe(true);
    const body = await res.text();
    const idxBeta = body.indexOf('Beta slide, shown first');
    const idxGamma = body.indexOf('Gamma slide, shown second');
    const idxAlpha = body.indexOf('Alpha slide, shown last');
    expect(idxBeta).toBeGreaterThan(-1);
    expect(idxGamma).toBeGreaterThan(idxBeta);
    expect(idxAlpha).toBeGreaterThan(idxGamma);
  });

  test('is pure Markdown with no HTML tokens', async ({page}) => {
    const res = await page.request.get(`${BASE}/items-page/index.md`);
    const body = await res.text();
    expect(body).not.toContain('<');
    expect(body).not.toContain('class=');
  });
});

test.describe('killed-overlay twin (enable=false)', () => {
  test('the killed build publishes a twin with no carousel content', () => {
    const publicDir = process.env.CAROUSEL_KILLED_PUBLIC;
    expect(publicDir, 'the runner must export CAROUSEL_KILLED_PUBLIC').toBeTruthy();
    const twinPath = `${publicDir}/gallery/index.md`;
    let body = '';
    try {
      body = readFileSync(twinPath, 'utf8');
    } catch {
      // Absent is an acceptable degradation: enable=false renders nothing.
      body = '';
    }
    // Whether the twin exists (with only front matter) or is entirely
    // absent, no image line and no caption text may leak through.
    expect(body).not.toMatch(/!\[[^\]]*]\(/);
    expect(body).not.toContain('Login screen before redesign');
  });
});
