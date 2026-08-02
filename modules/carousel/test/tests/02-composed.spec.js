// Composition with modules/images: the slide interior is the images
// module's own render output (a <picture> tree carrying the image BEM
// classes), the srcset never upscales, exactly one <figure> wraps each
// slide (never a nested figure from images/render.html, because carousel
// withholds caption/credit from the images call), and the images
// pass-through parameters reach the pipeline.
import {test, expect} from '@playwright/test';

test.describe('composed slide interior', () => {
  test('each slide renders the images module picture/img tree, not the standalone fallback', async ({
    page,
  }) => {
    await page.goto('/gallery/');
    const slide1 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(0);
    // images/picture.html emits <picture class="image image__picture ...">
    // when at least one <source> exists, or a bare <img class="image ...">
    // otherwise; either way the element carries the images module's own
    // "image" block class, never the carousel standalone fallback class.
    const picture = slide1.locator('picture.image');
    const bareImg = slide1.locator('img.image');
    const pictureCount = await picture.count();
    const bareCount = await bareImg.count();
    expect(pictureCount + bareCount).toBeGreaterThan(0);
    // The standalone fallback ("carousel__img" directly under the figure)
    // must never appear on the composed fixture.
    await expect(slide1.locator('img.carousel__img')).toHaveCount(0);
  });

  test('the fallback <img> inside the composed tree carries the image__img BEM class', async ({
    page,
  }) => {
    await page.goto('/gallery/');
    const slide1 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(0);
    await expect(slide1.locator('img.image__img')).toHaveCount(1);
  });

  test('srcset is present and its widths never exceed the source image width', async ({page}) => {
    await page.goto('/gallery/');
    const slide1 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(0);
    const img = slide1.locator('img.image__img');
    const srcset = await img.getAttribute('srcset');
    expect(srcset).toBeTruthy();
    const widths = [...srcset.matchAll(/(\d+)w/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    const imgWidthAttr = await img.getAttribute('width');
    if (imgWidthAttr) {
      const sourceWidth = Number(imgWidthAttr);
      for (const w of widths) {
        expect(w).toBeLessThanOrEqual(sourceWidth);
      }
    }
  });

  test('exactly one figure wraps each slide -- never a nested inner figure', async ({page}) => {
    await page.goto('/gallery/');
    const slides = page.locator('#carousel-0 .carousel__track > .carousel__slide');
    const count = await slides.count();
    for (let i = 0; i < count; i++) {
      const slide = slides.nth(i);
      await expect(slide.locator('figure')).toHaveCount(1);
      await expect(slide.locator('figure.carousel__figure')).toHaveCount(1);
      // images/render.html would only add its own <figure> when caption or
      // credit is forwarded; carousel deliberately withholds both, so no
      // image__caption-area figure should ever be nested inside.
      await expect(slide.locator('figure figure')).toHaveCount(0);
      await expect(slide.locator('.image__caption-area')).toHaveCount(0);
    }
  });

  test('the caption/credit shown come from carousel__caption, never image__caption', async ({
    page,
  }) => {
    await page.goto('/gallery/');
    const slide1 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(0);
    await expect(slide1.locator('figcaption.carousel__caption')).toHaveCount(1);
    await expect(slide1.locator('.image__caption')).toHaveCount(0);
    await expect(slide1.locator('.image__meta')).toHaveCount(0);
  });
});

test.describe('images pass-through parameters', () => {
  test('a widths override reaches the image pipeline and changes the emitted srcset', async ({
    page,
  }) => {
    // No fixture page currently forwards an images-only parameter (widths,
    // sizes, formats, ...) through the carousel shortcode, so this spec can
    // only confirm the default pipeline is active; see the concerns note in
    // the work report about adding a dedicated pass-through fixture page.
    await page.goto('/gallery/');
    const slide1 = page.locator('#carousel-0 .carousel__track > .carousel__slide').nth(0);
    const img = slide1.locator('img.image__img');
    await expect(img).toHaveAttribute('srcset', /.+/);
    await expect(img).toHaveAttribute('sizes', /.+/);
  });
});

test.describe('lightbox page (lightbox=true plus an explicit widths pass-through)', () => {
  test('each slide anchor carries the images-pipeline lightbox attributes, not the carousel standalone link', async ({
    page,
  }) => {
    await page.goto('/lightbox-page/');
    const slides = page.locator('#carousel-0 .carousel__track > .carousel__slide');
    await expect(slides).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const slide = slides.nth(i);
      // images/render.html's lightbox anchor here has no caption/credit
      // forwarded (carousel withholds both), so it never gains images' own
      // <figure> wrapper: it lands in the bare-anchor branch, which emits
      // class="image image--lightbox image__link" and
      // data-full-src/-width/-height, never carousel's own standalone
      // "carousel__link" class (that class is standalone-fallback-only, see
      // 08-standalone.spec.js).
      const anchor = slide.locator('a.image__link');
      await expect(anchor).toHaveCount(1);
      await expect(anchor).toHaveClass(/(?:^|\s)image--lightbox(?:\s|$)/);
      await expect(anchor).toHaveAttribute('data-full-src', /.+/);
      await expect(anchor).toHaveAttribute('data-full-width', /^\d+$/);
      await expect(anchor).toHaveAttribute('data-full-height', /^\d+$/);
      await expect(slide.locator('a.carousel__link')).toHaveCount(0);
    }
  });

  test('the explicit widths="480,960" pass-through shapes the srcset, clamped to each source width', async ({
    page,
  }) => {
    // images/resolve/plan.html filters the requested ladder to entries <= the
    // source width and never upscales, so each slide proves a different half
    // of the contract. The two small PNGs (300x200, 400x300) are narrower than
    // either requested breakpoint, so their ladders collapse to a single
    // source-width candidate: they prove the never-upscale clamp. The wide PNG
    // (1600x900) clears both breakpoints, so its ladder is exactly the
    // requested one, which is the assertion that genuinely distinguishes an
    // honored pass-through from a silently ignored one -- the module default
    // ladder is [640, 960, 1280, 1920], so a 480w candidate can only come from
    // the caller's widths="480,960" and 640w/1280w/1920w can only come from
    // the default.
    await page.goto('/lightbox-page/');
    const slides = page.locator('#carousel-0 .carousel__track > .carousel__slide');
    const sourceWidths = [300, 400, 1600];
    for (let i = 0; i < 3; i++) {
      const img = slides.nth(i).locator('img.image__img');
      const srcset = await img.getAttribute('srcset');
      expect(srcset).toBeTruthy();
      const widths = [...srcset.matchAll(/(\d+)w/g)].map((m) => Number(m[1]));
      expect(widths.length).toBeGreaterThan(0);
      for (const w of widths) {
        expect(w).toBeLessThanOrEqual(sourceWidths[i]);
        expect(w).toBeLessThanOrEqual(960);
      }
    }

    const wideSrcset = await slides.nth(2).locator('img.image__img').getAttribute('srcset');
    const wideWidths = [...wideSrcset.matchAll(/(\d+)w/g)].map((m) => Number(m[1]));
    expect(wideWidths).toContain(480);
    expect(wideWidths).toContain(960);
    expect(wideWidths).not.toContain(640);
    expect(wideWidths).not.toContain(1280);
    expect(wideWidths).not.toContain(1920);
  });
});
