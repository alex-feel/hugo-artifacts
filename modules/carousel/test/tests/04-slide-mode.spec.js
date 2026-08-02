// mode=slide concealment guard: on a page whose consumer CSS actually hides
// non-current slides (display:none), the JS applies inert + aria-hidden to
// every concealed slide; on the sibling unstyled page, where no CSS hides
// anything, the guard must skip both attributes on every slide, because
// applying inert to a visually visible slide would hide accessible content
// that sighted users can still see.
import {test, expect} from '@playwright/test';

test.describe('mode=slide, styled page (consumer CSS conceals non-current slides)', () => {
  test('non-current slides receive inert and aria-hidden=true; the current slide does not', async ({
    page,
  }) => {
    await page.goto('/slide-mode-page/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('data-mode', 'slide');
    const slides = root.locator('.carousel__slide');
    await expect(slides).toHaveCount(3);

    const current = root.locator('.carousel__slide--current');
    await expect(current).toHaveAttribute('data-index', '1');
    await expect(current).not.toHaveAttribute('inert', /.*/);
    await expect(current).not.toHaveAttribute('aria-hidden', /.*/);

    for (let i = 1; i < 3; i++) {
      const slide = slides.nth(i);
      await expect(slide).toHaveAttribute('inert', '');
      await expect(slide).toHaveAttribute('aria-hidden', 'true');
    }
  });

  test('navigating moves inert/aria-hidden off the new current slide', async ({page}) => {
    await page.goto('/slide-mode-page/');
    const root = page.locator('#carousel-0');
    await root.locator('[data-carousel-next]').click();

    const slides = root.locator('.carousel__slide');
    await expect(slides.nth(1)).not.toHaveAttribute('inert', /.*/);
    await expect(slides.nth(1)).not.toHaveAttribute('aria-hidden', /.*/);
    await expect(slides.nth(0)).toHaveAttribute('inert', '');
    await expect(slides.nth(0)).toHaveAttribute('aria-hidden', 'true');
    await expect(slides.nth(2)).toHaveAttribute('inert', '');
    await expect(slides.nth(2)).toHaveAttribute('aria-hidden', 'true');
  });
});

test.describe('mode=slide, unstyled page (no consumer CSS conceals anything)', () => {
  test('the concealment guard skips inert/aria-hidden on every slide', async ({page}) => {
    await page.goto('/slide-mode-unstyled/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('data-mode', 'slide');
    const slides = root.locator('.carousel__slide');
    await expect(slides).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      const slide = slides.nth(i);
      await expect(slide).toBeVisible();
      await expect(slide).not.toHaveAttribute('inert', /.*/);
      await expect(slide).not.toHaveAttribute('aria-hidden', /.*/);
    }
  });

  test('the current-slide class/data-current still track navigation without concealment', async ({
    page,
  }) => {
    await page.goto('/slide-mode-unstyled/');
    const root = page.locator('#carousel-0');
    await root.locator('[data-carousel-next]').click();
    const slides = root.locator('.carousel__slide');
    await expect(slides.nth(1)).toHaveClass(/carousel__slide--current/);
    await expect(slides.nth(1)).toHaveAttribute('data-current', 'true');
    // Still no inert/aria-hidden anywhere: nothing conceals the other slides.
    await expect(slides.nth(0)).not.toHaveAttribute('inert', /.*/);
    await expect(slides.nth(2)).not.toHaveAttribute('inert', /.*/);
  });
});
