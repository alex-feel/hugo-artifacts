// Keyboard model and warning-dedup contract: Tab order reaches prev, then
// next, then the picker buttons, then in-slide interactive content;
// Enter/Space activate a focused control exactly like a click; the
// alt-less slide renders alt="" with no lightbox anchor; and the alt-less
// warning surfaces exactly once in the server log (via the runner's
// exported CAROUSEL_SERVER_LOG env var), never once per page render.
/* global process */
import {readFileSync} from 'node:fs';
import {test, expect} from '@playwright/test';

test.describe('keyboard model (APG grouped/buttons-only variant)', () => {
  test('Tab reaches prev, then next, then picker buttons, in that order', async ({page}) => {
    await page.goto('/options-page/');
    const root = page.locator('#carousel-0');
    const prev = root.locator('[data-carousel-prev]');
    const next = root.locator('[data-carousel-next]');
    const firstPicker = root.locator('.carousel__picker-button').nth(0);

    await page.locator('body').click();
    await prev.focus();
    await expect(prev).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(firstPicker).toBeFocused();
  });

  test('Enter activates a focused prev/next button exactly like a click', async ({page}) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    const next = root.locator('[data-carousel-next]');
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '2');
  });

  test('Space activates a focused prev/next button exactly like a click', async ({page}) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    const next = root.locator('[data-carousel-next]');
    await next.focus();
    await page.keyboard.press(' ');
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '2');
  });

  test('activating prev/next never moves focus off the button (repeat-press per APG)', async ({
    page,
  }) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    const next = root.locator('[data-carousel-next]');
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(next).toBeFocused();
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '3');
  });
});

test.describe('alt-less slide degradation', () => {
  test('renders alt="" and suppresses the lightbox anchor', async ({page}) => {
    await page.goto('/gallery/');
    // 04-profile.png (slide 4) carries no params.alt.
    const slide4 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(3);
    const img = slide4.locator('img');
    await expect(img).toHaveAttribute('alt', '');
    await expect(slide4.locator('a.image__link, a.carousel__link')).toHaveCount(0);
  });

  test('the alt-less warning surfaces exactly once in the server log', () => {
    const logPath = process.env.CAROUSEL_SERVER_LOG;
    expect(logPath, 'the runner must export CAROUSEL_SERVER_LOG').toBeTruthy();
    const log = readFileSync(logPath, 'utf8');
    const matches =
      log.match(/\[carousel] Slide resource "04-profile\.png" has no alt text/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
