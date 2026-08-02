// Script emission: the carousel.js tag carries a fingerprinted src, an
// integrity attribute, and crossorigin="anonymous", emitted once per
// render placement (never deduplicated across two placements on the same
// page); the two-carousels page proves both roots enhance and navigate
// independently despite sharing the one window-level run guard.
import {test, expect} from '@playwright/test';

test.describe('script tag attributes', () => {
  test('carries a fingerprinted src, integrity, and crossorigin=anonymous', async ({page}) => {
    await page.goto('/gallery/');
    const script = page.locator('script[src*="carousel"]');
    await expect(script).toHaveCount(1);
    const src = await script.getAttribute('src');
    expect(src).toMatch(/carousel(\.min)?\.[a-f0-9]+\.js$/);
    const integrity = await script.getAttribute('integrity');
    expect(integrity).toMatch(/^sha\d{3}-/);
    await expect(script).toHaveAttribute('crossorigin', 'anonymous');
    await expect(script).toHaveAttribute('defer', '');
  });
});

test.describe('two carousels on one page (per-placement emission, single run guard)', () => {
  test('both roots are present and independently enhanced', async ({page}) => {
    await page.goto('/two-carousels/');
    const first = page.locator('#carousel-first');
    const second = page.locator('#carousel-second');
    await expect(first).toHaveCount(1);
    await expect(second).toHaveCount(1);
    await expect(first).toHaveAttribute('data-enhanced', 'true');
    await expect(second).toHaveAttribute('data-enhanced', 'true');
    await expect(first).toHaveAttribute('data-count', '2');
    await expect(second).toHaveAttribute('data-count', '2');
  });

  test('navigating the first carousel never affects the second', async ({page}) => {
    await page.goto('/two-carousels/');
    const first = page.locator('#carousel-first');
    const second = page.locator('#carousel-second');

    await first.locator('[data-carousel-next]').click();
    await expect(first.locator('.carousel__slide--current')).toHaveAttribute('data-index', '2');
    await expect(second.locator('.carousel__slide--current')).toHaveAttribute('data-index', '1');
  });

  test('navigating the second carousel never affects the first', async ({page}) => {
    await page.goto('/two-carousels/');
    const first = page.locator('#carousel-first');
    const second = page.locator('#carousel-second');

    await second.locator('[data-carousel-next]').click();
    await expect(second.locator('.carousel__slide--current')).toHaveAttribute('data-index', '2');
    await expect(first.locator('.carousel__slide--current')).toHaveAttribute('data-index', '1');
  });
});
