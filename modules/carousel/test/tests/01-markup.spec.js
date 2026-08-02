// Server-rendered, no-JS-baseline markup: the region role/roledescription/
// accessible name, per-slide role=group with the server-baked "N of M"
// label, every slide visible and present, controls/picker carrying the
// hidden attribute, figure/figcaption from resource metadata, data-count and
// the zero-padded data-index, the eager/lazy loading split with
// fetchpriority=high on slide one only, and the absence of every
// JS-applied attribute (aria-live, data-enhanced, inert) before enhancement
// runs. JavaScript stays disabled throughout: this is the no-JS baseline.
import {test, expect} from '@playwright/test';

test.use({javaScriptEnabled: false});

test.describe('gallery page (match mode, composed)', () => {
  test('region carries role, roledescription, and the explicit label', async ({page}) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute('role', 'region');
    await expect(root).toHaveAttribute('aria-roledescription', 'carousel');
    await expect(root).toHaveAttribute('aria-label', 'Product walkthrough');
    await expect(root).not.toHaveAttribute('aria-labelledby', /.*/);
    await expect(root).toHaveClass(/^carousel(?!\S)/);
  });

  test('root data attributes describe count, start, and mode', async ({page}) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('data-carousel', '');
    await expect(root).toHaveAttribute('data-count', '4');
    await expect(root).toHaveAttribute('data-start', '1');
    await expect(root).toHaveAttribute('data-mode', 'scroll');
    await expect(root).not.toHaveAttribute('data-loop', /.*/);
  });

  test('all four slides are present, visible, and labeled "i of 4"', async ({page}) => {
    await page.goto('/gallery/');
    const slides = page.locator('#carousel-0 .carousel__track > .carousel__slide');
    await expect(slides).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const slide = slides.nth(i);
      await expect(slide).toBeVisible();
      await expect(slide).toHaveAttribute('role', 'group');
      await expect(slide).toHaveAttribute('aria-roledescription', 'slide');
      await expect(slide).toHaveAttribute('aria-label', `${i + 1} of 4`);
      await expect(slide).toHaveAttribute('data-index', String(i + 1).padStart(1, '0'));
    }
  });

  test('slide ids are derived from the root id and the zero-padded index', async ({page}) => {
    await page.goto('/gallery/');
    const slides = page.locator('#carousel-0 .carousel__track > .carousel__slide');
    for (let i = 0; i < 4; i++) {
      await expect(slides.nth(i)).toHaveAttribute('id', `carousel-0-slide-${i + 1}`);
    }
  });

  test('controls and picker carry the hidden attribute before enhancement', async ({page}) => {
    await page.goto('/gallery/');
    const controls = page.locator('#carousel-0 .carousel__controls');
    await expect(controls).toHaveCount(1);
    await expect(controls).toHaveAttribute('hidden', '');
    await expect(page.locator('#carousel-0 .carousel__control--prev')).toHaveAttribute(
      'aria-label',
      'Previous slide',
    );
    await expect(page.locator('#carousel-0 .carousel__control--next')).toHaveAttribute(
      'aria-label',
      'Next slide',
    );
    // picker defaults to false on this page.
    await expect(page.locator('#carousel-0 .carousel__picker')).toHaveCount(0);
  });

  test('figure/figcaption reflect the resource title and credit metadata', async ({page}) => {
    await page.goto('/gallery/');
    const slide1 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(0);
    await expect(slide1.locator('figure.carousel__figure')).toHaveCount(1);
    const caption1 = slide1.locator('figcaption.carousel__caption');
    await expect(caption1).toHaveCount(1);
    await expect(caption1).toContainText('Login screen before redesign');
    await expect(caption1.locator('.carousel__credit')).toHaveText('Ann Author');

    // The second resource carries a title (caption) but no credit: no
    // .carousel__credit span should be rendered.
    const slide2 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(1);
    const caption2 = slide2.locator('figcaption.carousel__caption');
    await expect(caption2).toHaveText('Dashboard after login');
    await expect(caption2.locator('.carousel__credit')).toHaveCount(0);
  });

  test('the eager/lazy split places fetchpriority=high only on slide one', async ({page}) => {
    await page.goto('/gallery/');
    const imgs = page.locator('#carousel-0 img.image__img, #carousel-0 picture img');
    // eager defaults to 1: only the first slide is eager, and only the
    // first eager slide carries fetchpriority="high".
    const first = imgs.nth(0);
    await expect(first).toHaveAttribute('loading', 'eager');
    await expect(first).toHaveAttribute('fetchpriority', 'high');
    for (let i = 1; i < 4; i++) {
      const img = imgs.nth(i);
      await expect(img).toHaveAttribute('loading', 'lazy');
      await expect(img).not.toHaveAttribute('fetchpriority', /.*/);
    }
  });

  test('no JS-only attributes are present before enhancement runs', async ({page}) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    await expect(root).not.toHaveAttribute('data-enhanced', /.*/);
    await expect(root).not.toHaveClass(/carousel--enhanced/);
    const track = root.locator('.carousel__track');
    await expect(track).not.toHaveAttribute('aria-live', /.*/);
    await expect(track).not.toHaveAttribute('aria-atomic', /.*/);
    const slides = root.locator('.carousel__slide');
    const count = await slides.count();
    for (let i = 0; i < count; i++) {
      await expect(slides.nth(i)).not.toHaveAttribute('inert', /.*/);
      await expect(slides.nth(i)).not.toHaveAttribute('aria-hidden', /.*/);
      await expect(slides.nth(i)).not.toHaveAttribute('data-current', /.*/);
    }
  });

  test('an alt-less resource renders alt="" and no lightbox anchor', async ({page}) => {
    await page.goto('/gallery/');
    // 04-profile.png carries no params.alt in front matter.
    const slide4 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(3);
    const img = slide4.locator('img');
    await expect(img).toHaveAttribute('alt', '');
    await expect(slide4.locator('a.image__link, a.carousel__link')).toHaveCount(0);
  });
});

test.describe('options page (start, loop, picker, eager)', () => {
  test('data-start reflects the configured value and picker is present', async ({page}) => {
    await page.goto('/options-page/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('data-start', '2');
    await expect(root).toHaveAttribute('data-loop', '');
    const picker = root.locator('.carousel__picker');
    await expect(picker).toHaveCount(1);
    await expect(picker).toHaveAttribute('role', 'group');
    await expect(picker).toHaveAttribute('aria-label', 'Choose a slide');
    await expect(picker).toHaveAttribute('hidden', '');
    await expect(picker.locator('.carousel__picker-button')).toHaveCount(4);
  });

  test('picker buttons carry data-carousel-goto and their aria-label', async ({page}) => {
    await page.goto('/options-page/');
    const buttons = page.locator('#carousel-0 .carousel__picker-button');
    for (let i = 0; i < 4; i++) {
      const button = buttons.nth(i);
      await expect(button).toHaveAttribute('data-carousel-goto', String(i + 1));
      await expect(button).toHaveAttribute('aria-label', `Slide ${i + 1}`);
      await expect(button).toHaveText(String(i + 1));
    }
  });

  test('eager=2 makes the first two slides eager with fetchpriority only on slide one', async ({
    page,
  }) => {
    await page.goto('/options-page/');
    const imgs = page.locator('#carousel-0 img.image__img, #carousel-0 picture img');
    await expect(imgs.nth(0)).toHaveAttribute('loading', 'eager');
    await expect(imgs.nth(0)).toHaveAttribute('fetchpriority', 'high');
    await expect(imgs.nth(1)).toHaveAttribute('loading', 'eager');
    await expect(imgs.nth(1)).not.toHaveAttribute('fetchpriority', /.*/);
    await expect(imgs.nth(2)).toHaveAttribute('loading', 'lazy');
    await expect(imgs.nth(3)).toHaveAttribute('loading', 'lazy');
  });
});

test.describe('labelledby page (aria-labelledby wins over label)', () => {
  test('the root carries aria-labelledby and no aria-label at all', async ({page}) => {
    await page.goto('/labelledby-page/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('aria-labelledby', 'team-photos-heading');
    await expect(root).not.toHaveAttribute('aria-label', /.*/);
  });
});

test.describe('options page (captions=false suppresses figcaption)', () => {
  test('no figcaption is rendered even though every resource carries a title', async ({page}) => {
    await page.goto('/options-page/');
    const root = page.locator('#carousel-0');
    await expect(root.locator('figcaption.carousel__caption')).toHaveCount(0);
  });
});

test.describe('single slide page (loop, picker, controls all on)', () => {
  test('renders exactly one slide labeled "1 of 1" with no crash markers', async ({page}) => {
    await page.goto('/single-slide-page/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('data-count', '1');
    const slides = root.locator('.carousel__track > .carousel__slide');
    await expect(slides).toHaveCount(1);
    await expect(slides.nth(0)).toHaveAttribute('aria-label', '1 of 1');
    await expect(slides.nth(0)).toBeVisible();
  });
});

test.describe('items page (curated order)', () => {
  test('slide order follows the literal items list, not resource declaration order', async ({
    page,
  }) => {
    await page.goto('/items-page/');
    const slides = page.locator('#carousel-0 .carousel__track > .carousel__slide');
    await expect(slides).toHaveCount(3);
    // items="beta.png,gamma.png,alpha.png"
    await expect(slides.nth(0).locator('figcaption')).toContainText('Beta slide');
    await expect(slides.nth(1).locator('figcaption')).toContainText('Gamma slide');
    await expect(slides.nth(2).locator('figcaption')).toContainText('Alpha slide');
  });

  test('data-count and data-index reflect the curated three-slide set', async ({page}) => {
    await page.goto('/items-page/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('data-count', '3');
    const slides = root.locator('.carousel__slide');
    for (let i = 0; i < 3; i++) {
      await expect(slides.nth(i)).toHaveAttribute('data-index', String(i + 1));
      await expect(slides.nth(i)).toHaveAttribute('aria-label', `${i + 1} of 3`);
    }
  });
});
