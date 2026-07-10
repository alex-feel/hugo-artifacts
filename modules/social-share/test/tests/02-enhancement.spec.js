// Progressive enhancement: capability-gated button reveal, the enhanced
// state class, and the copy-link flow with its live-region announcement.
/* global navigator */
import {test, expect} from '@playwright/test';

const PAGE_URL = 'http://localhost:1414/blog/post-plain/';

test('reveals buttons per capability and marks the bar enhanced', async ({page}) => {
  await page.goto('/blog/post-plain/');
  await expect(page.locator('nav.social-share')).toHaveClass(/social-share--enhanced/);

  // localhost is a secure context and Chromium ships the async clipboard,
  // so the copy button must be revealed.
  await expect(page.locator('li.social-share__item--copy')).toBeVisible();

  // Web Share support depends on the platform build; the reveal must match
  // the capability exactly, in either direction.
  const canShare = await page.evaluate(() => 'share' in navigator);
  const webshareItem = page.locator('li.social-share__item--webshare');
  if (canShare) {
    await expect(webshareItem).toBeVisible();
  } else {
    await expect(webshareItem).toBeHidden();
  }
});

test('copy button copies the canonical URL and announces the result', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/blog/post-plain/');

  const button = page.locator('button[data-share-action="copy"]');
  await button.click();

  const status = page.locator('.social-share__status');
  await expect(status).toHaveText('Link copied to clipboard');
  await expect(button).toHaveClass(/social-share__button--copied/);
  await expect(page.locator('nav.social-share')).toHaveClass(/social-share--copied/);

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(PAGE_URL);

  // The copied state resets after three seconds.
  await expect(status).toHaveText('', {timeout: 5000});
  await expect(button).not.toHaveClass(/social-share__button--copied/);
  await expect(page.locator('nav.social-share')).not.toHaveClass(/social-share--copied/);
});

test('status region exists only when action buttons are present', async ({page}) => {
  await page.goto('/blog/post-networks/');
  const navs = page.locator('nav.social-share');
  // Shortcode bar: telegram + whatsapp only -- no status region.
  await expect(navs.nth(0).locator('.social-share__status')).toHaveCount(0);
  // Partial bar: copy + x -- status region present.
  await expect(navs.nth(1).locator('.social-share__status')).toHaveCount(1);
});
