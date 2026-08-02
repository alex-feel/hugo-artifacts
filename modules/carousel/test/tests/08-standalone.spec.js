// Filesystem assertions over two static builds exported by the runner:
// fixture-bare/public (standalone, modules/images absent -- plain
// carousel__img markup, no images BEM classes, correct alt/caption/labels)
// and fixture/public/killed (the site-wide kill overlay -- no carousel
// markup and no carousel script anywhere in the build).
/* global process */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {test, expect} from '@playwright/test';

test.describe('standalone build (fixture-bare/public)', () => {
  function readGalleryHtml() {
    const publicDir = process.env.CAROUSEL_BARE_PUBLIC;
    expect(publicDir, 'the runner must export CAROUSEL_BARE_PUBLIC').toBeTruthy();
    return readFileSync(join(publicDir, 'gallery', 'index.html'), 'utf8');
  }

  test('renders the plain carousel__img fallback, never the images BEM classes', () => {
    const html = readGalleryHtml();
    expect(html).toContain('class="carousel__img"');
    expect(html).not.toContain('class="image');
    expect(html).not.toContain('image__img');
    expect(html).not.toContain('image__picture');
    expect(html).not.toContain('<picture');
  });

  test('carries the correct alt text and caption for each slide', () => {
    const html = readGalleryHtml();
    expect(html).toContain('alt="First slide"');
    expect(html).toContain('alt="Second slide"');
    expect(html).toContain('First slide</figcaption>');
    expect(html).toContain('Second slide</figcaption>');
  });

  test('the region and slide accessible-name labels are baked server-side', () => {
    const html = readGalleryHtml();
    expect(html).toContain('aria-label="Standalone walkthrough"');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-label="1 of 2"');
    expect(html).toContain('aria-label="2 of 2"');
  });

  test('root data attributes reflect the two-slide standalone set', () => {
    const html = readGalleryHtml();
    expect(html).toMatch(/data-count="2"/);
    expect(html).toMatch(/data-index="1"/);
    expect(html).toMatch(/data-index="2"/);
  });

  test('the fingerprinted script tag is present in the static build too', () => {
    const html = readGalleryHtml();
    expect(html).toMatch(/<script defer src="[^"]*carousel[^"]*\.js" integrity="sha\d{3}-/);
  });
});

test.describe('standalone lightbox build (fixture-bare/public/lightbox-gallery)', () => {
  function readLightboxGalleryHtml() {
    const publicDir = process.env.CAROUSEL_BARE_PUBLIC;
    expect(publicDir, 'the runner must export CAROUSEL_BARE_PUBLIC').toBeTruthy();
    return readFileSync(join(publicDir, 'lightbox-gallery', 'index.html'), 'utf8');
  }

  test('each slide is wrapped in a carousel__link anchor pointing at the original resource, with known dimensions', () => {
    const html = readLightboxGalleryHtml();
    // The standalone branch (modules/images absent) wraps the <img> in
    // <a class="carousel__link" href="{original .Permalink}"
    // data-full-width data-full-height> because bundle resources carry
    // known dimensions -- never the composed images__link class, which
    // only exists when modules/images is imported.
    const anchorMatches = [...html.matchAll(/<a class="carousel__link" href="([^"]+)"([^>]*)>/g)];
    expect(anchorMatches.length).toBe(2);
    for (const [, href, rest] of anchorMatches) {
      expect(href).toMatch(/^https?:\/\/.+\/lightbox-gallery\/0[12]-(?:first|second)\.png$/);
      expect(rest).toMatch(/data-full-width="\d+"/);
      expect(rest).toMatch(/data-full-height="\d+"/);
    }
    expect(html).not.toContain('class="image__link"');
  });
});

test.describe('killed overlay build (fixture/public/killed)', () => {
  function readKilledHtml(rel) {
    const publicDir = process.env.CAROUSEL_KILLED_PUBLIC;
    expect(publicDir, 'the runner must export CAROUSEL_KILLED_PUBLIC').toBeTruthy();
    return readFileSync(join(publicDir, rel), 'utf8');
  }

  test('no page under the killed overlay carries any carousel markup or script', () => {
    for (const rel of [
      'gallery/index.html',
      'items-page/index.html',
      'options-page/index.html',
      'slide-mode-page/index.html',
      'slide-mode-unstyled/index.html',
      'two-carousels/index.html',
    ]) {
      const html = readKilledHtml(rel);
      expect(html, `${rel} must carry no carousel root`).not.toContain('class="carousel');
      expect(html, `${rel} must carry no carousel data attribute`).not.toContain('data-carousel');
      expect(html, `${rel} must carry no carousel script`).not.toMatch(/carousel[^"']*\.js/);
    }
  });
});
