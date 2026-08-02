// Progressive enhancement: init reveals controls, sets track aria-live, and
// marks the root data-enhanced/carousel--enhanced; prev/next update the
// current slide class/data-current and dispatch carousel:change with
// {index, count, trigger}; boundary buttons carry aria-disabled and keep
// focus (non-loop page); the loop page wraps at the ends; the picker's goto
// works and marks --current; focus stays on the activated button after
// every navigation; reduced-motion emulation still navigates (instantly).
/* global window, document */
import {test, expect} from '@playwright/test';

// Collects carousel:change/carousel:init events on the given root so specs
// can assert the exact detail payload rather than inferring it from DOM
// state alone.
async function trackEvents(page, rootSelector) {
  await page.evaluate((selector) => {
    window.__carouselEvents = [];
    const root = document.querySelector(selector);
    root.addEventListener('carousel:change', (event) => {
      window.__carouselEvents.push({type: 'change', detail: event.detail});
    });
    root.addEventListener('carousel:init', (event) => {
      window.__carouselEvents.push({type: 'init', detail: event.detail});
    });
  }, rootSelector);
}

test.describe('initialization', () => {
  test('marks the root enhanced and reveals controls with aria-live wired on the track', async ({
    page,
  }) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('data-enhanced', 'true');
    await expect(root).toHaveClass(/carousel--enhanced/);

    const controls = root.locator('.carousel__controls');
    await expect(controls).not.toHaveAttribute('hidden', /.*/);
    await expect(controls).toHaveJSProperty('hidden', false);

    const track = root.locator('.carousel__track');
    await expect(track).toHaveAttribute('aria-live', 'polite');
    await expect(track).toHaveAttribute('aria-atomic', 'false');
  });

  test('the starting slide is marked current after init runs', async ({page}) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    await expect(root).toHaveAttribute('data-count', '4');
    const current = root.locator('.carousel__slide--current');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('data-current', 'true');
    await expect(current).toHaveAttribute('data-index', '1');
  });
});

test.describe('prev/next navigation (non-loop options page start-of-track boundary)', () => {
  test('next updates current class/data-current and dispatches carousel:change', async ({page}) => {
    await page.goto('/gallery/');
    await trackEvents(page, '#carousel-0');
    const root = page.locator('#carousel-0');
    const next = root.locator('[data-carousel-next]');
    await next.click();

    const current = root.locator('.carousel__slide--current');
    await expect(current).toHaveAttribute('data-index', '2');

    const events = await page.evaluate(() => window.__carouselEvents);
    const changeEvents = events.filter((e) => e.type === 'change');
    expect(changeEvents.length).toBeGreaterThanOrEqual(1);
    const last = changeEvents[changeEvents.length - 1];
    expect(last.detail).toMatchObject({index: 2, count: 4, trigger: 'next'});
  });

  test('prev returns to the previous slide and dispatches carousel:change with trigger=prev', async ({
    page,
  }) => {
    await page.goto('/gallery/');
    await trackEvents(page, '#carousel-0');
    const root = page.locator('#carousel-0');
    await root.locator('[data-carousel-next]').click();
    await root.locator('[data-carousel-prev]').click();

    const current = root.locator('.carousel__slide--current');
    await expect(current).toHaveAttribute('data-index', '1');

    const events = await page.evaluate(() => window.__carouselEvents);
    const last = events.filter((e) => e.type === 'change').at(-1);
    expect(last.detail).toMatchObject({index: 1, count: 4, trigger: 'prev'});
  });

  test('the prev button is aria-disabled at the first slide and keeps focus', async ({page}) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    const prev = root.locator('[data-carousel-prev]');
    await expect(prev).toHaveAttribute('aria-disabled', 'true');
    await prev.focus();
    // force: Playwright's actionability model refuses to click an element
    // carrying aria-disabled="true"; the click must still dispatch so the
    // script's own boundary guard is what proves navigation stays put.
    await prev.click({force: true});
    await expect(prev).toBeFocused();
    // Clicking prev at the boundary must not move off slide one.
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '1');
  });

  test('the next button is aria-disabled at the last slide and keeps focus', async ({page}) => {
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    const next = root.locator('[data-carousel-next]');
    // Walk to the last slide (4 total).
    await next.click();
    await next.click();
    await next.click();
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '4');
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await next.focus();
    // force: same aria-disabled actionability bypass as the prev-boundary test.
    await next.click({force: true});
    await expect(next).toBeFocused();
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '4');
  });
});

test.describe('loop wrapping (options page: loop=true, start=2)', () => {
  test('prev from the first slide wraps to the last, and next from the last wraps to the first', async ({
    page,
  }) => {
    await page.goto('/options-page/');
    const root = page.locator('#carousel-0');
    // start=2: navigate back to slide 1 first.
    await root.locator('[data-carousel-prev]').click();
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '1');
    // Neither prev/next is ever aria-disabled on a loop page.
    await expect(root.locator('[data-carousel-prev]')).not.toHaveAttribute('aria-disabled', /.*/);
    await root.locator('[data-carousel-prev]').click();
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '4');
    await expect(root.locator('[data-carousel-next]')).not.toHaveAttribute('aria-disabled', /.*/);
    await root.locator('[data-carousel-next]').click();
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '1');
  });
});

test.describe('picker navigation (options page)', () => {
  test('goto navigates directly and marks the activated picker button current', async ({page}) => {
    await page.goto('/options-page/');
    const root = page.locator('#carousel-0');
    const buttons = root.locator('.carousel__picker-button');
    await buttons.nth(2).click();

    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '3');
    await expect(buttons.nth(2)).toHaveClass(/carousel__picker-button--current/);
    await expect(buttons.nth(2)).toHaveAttribute('aria-disabled', 'true');
    // Every non-current picker button stays free of the current markers.
    for (const i of [0, 1, 3]) {
      await expect(buttons.nth(i)).not.toHaveClass(/carousel__picker-button--current/);
      await expect(buttons.nth(i)).not.toHaveAttribute('aria-disabled', /.*/);
    }
  });

  test('focus remains on the activated picker button after navigation', async ({page}) => {
    await page.goto('/options-page/');
    const root = page.locator('#carousel-0');
    const button = root.locator('.carousel__picker-button').nth(0);
    await button.focus();
    await button.click();
    await expect(button).toBeFocused();
  });

  test('dispatches carousel:change with trigger=goto', async ({page}) => {
    await page.goto('/options-page/');
    await trackEvents(page, '#carousel-0');
    const root = page.locator('#carousel-0');
    await root.locator('.carousel__picker-button').nth(0).click();
    const events = await page.evaluate(() => window.__carouselEvents);
    const last = events.filter((e) => e.type === 'change').at(-1);
    expect(last.detail).toMatchObject({index: 1, count: 4, trigger: 'goto'});
  });
});

test.describe('goTo no-op guard (target === current dispatches nothing)', () => {
  test('single-slide page with loop=true: prev/next stay on slide 1 and dispatch no carousel:change', async ({
    page,
  }) => {
    await page.goto('/single-slide-page/');
    await trackEvents(page, '#carousel-0');
    const root = page.locator('#carousel-0');
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '1');

    await root.locator('[data-carousel-prev]').click();
    await root.locator('[data-carousel-next]').click();

    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '1');
    const events = await page.evaluate(() => window.__carouselEvents);
    expect(events.filter((e) => e.type === 'change')).toHaveLength(0);
  });

  test('clicking the current picker button dispatches no carousel:change and keeps aria-current on it alone', async ({
    page,
  }) => {
    await page.goto('/options-page/');
    const root = page.locator('#carousel-0');
    // options-page starts at slide 2 (start="2").
    const buttons = root.locator('.carousel__picker-button');
    const currentButton = buttons.nth(1);
    await expect(currentButton).toHaveAttribute('aria-current', 'true');
    for (const i of [0, 2, 3]) {
      await expect(buttons.nth(i)).not.toHaveAttribute('aria-current', /.*/);
    }

    await trackEvents(page, '#carousel-0');
    // force: the current picker button carries aria-disabled="true" (per the
    // documented contract), so the same actionability bypass as the boundary
    // prev/next tests is needed; the click must still dispatch so the goTo
    // no-op guard is what proves nothing changes.
    await currentButton.click({force: true});

    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '2');
    await expect(currentButton).toHaveAttribute('aria-current', 'true');
    const events = await page.evaluate(() => window.__carouselEvents);
    expect(events.filter((e) => e.type === 'change')).toHaveLength(0);
  });
});

test.describe('reduced motion', () => {
  test('with prefers-reduced-motion emulated, prev/next still navigate', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto('/gallery/');
    const root = page.locator('#carousel-0');
    await root.locator('[data-carousel-next]').click();
    await expect(root.locator('.carousel__slide--current')).toHaveAttribute('data-index', '2');
  });
});
