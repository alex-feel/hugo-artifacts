// CustomEvent analytics surface: social-share:share on intent-link clicks
// and social-share:action on button actions, both bubbling with the
// canonical page URL (never a constructed intent href).
/* global window, document, Event */
import {test, expect} from '@playwright/test';

const PAGE_URL = 'http://localhost:1414/blog/post-plain/';

function collectEvents(page) {
  return page.evaluate(() => {
    window.__events = [];
    document.addEventListener('social-share:share', (event) => {
      window.__events.push({type: 'share', detail: event.detail});
    });
    document.addEventListener('social-share:action', (event) => {
      window.__events.push({type: 'action', detail: event.detail});
    });
  });
}

test('clicking an intent link dispatches social-share:share', async ({page}) => {
  await page.goto('/blog/post-plain/');
  await collectEvents(page);
  // Keep the test on the page: swallow the navigation, not the event.
  await page.evaluate(() => {
    document.addEventListener('click', (event) => event.preventDefault(), true);
  });

  await page.locator('a[data-share-network="x"]').click();

  const events = await page.evaluate(() => window.__events);
  expect(events).toEqual([{type: 'share', detail: {network: 'x', url: PAGE_URL}}]);
});

test('copying dispatches social-share:action with ok true', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/blog/post-plain/');
  await collectEvents(page);

  await page.locator('button[data-share-action="copy"]').click();

  await expect
    .poll(async () => page.evaluate(() => window.__events))
    .toEqual([{type: 'action', detail: {action: 'copy', url: PAGE_URL, ok: true}}]);
});

test('rescan is idempotent: re-initializing never double-wires a bar', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/blog/post-plain/');
  await collectEvents(page);

  // Simulate a PJAX host page re-running enhancement after a DOM update.
  await page.evaluate(() => {
    document.dispatchEvent(new Event('social-share:rescan'));
    document.dispatchEvent(new Event('social-share:rescan'));
  });

  await page.locator('button[data-share-action="copy"]').click();

  // Exactly ONE event: the already-enhanced bar was not wired again.
  await expect
    .poll(async () => page.evaluate(() => window.__events))
    .toEqual([{type: 'action', detail: {action: 'copy', url: PAGE_URL, ok: true}}]);
});
