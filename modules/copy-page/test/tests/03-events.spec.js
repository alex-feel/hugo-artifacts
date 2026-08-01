// CustomEvent surface: copy-page:action with ok true/false and the
// copy-page:open detail shape. The events bubble from the widget root, so a
// document-level listener -- what a consuming site's analytics hook would
// use -- captures them; detail.url is always the widget's Markdown URL.
/* global window, document */
import {test, expect} from '@playwright/test';

const BASE = 'http://localhost:1616';
const PLAIN_MD = `${BASE}/docs/post-plain/index.md`;

// Collects the named copy-page event's details at the document level.
async function collect(page, name) {
  await page.evaluate((eventName) => {
    window.__events = [];
    document.addEventListener(eventName, (event) => {
      window.__events.push(event.detail);
    });
  }, name);
}

test('copy-page:action reports ok true with the widget markdown URL', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/docs/post-plain/');
  await collect(page, 'copy-page:action');

  await page.locator('button.copy-page__copy').click();
  await page.waitForFunction(() => window.__events.length === 1);

  const events = await page.evaluate(() => window.__events);
  expect(events[0]).toEqual({action: 'copy', url: PLAIN_MD, ok: true});
});

test('copy-page:action reports ok false when the twin fetch fails', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/docs/post-404/');
  await collect(page, 'copy-page:action');

  await page.locator('#copy-404 button.copy-page__copy').click();
  await page.waitForFunction(() => window.__events.length === 1);

  const events = await page.evaluate(() => window.__events);
  expect(events[0]).toEqual({action: 'copy', url: '/docs/no-such-twin/index.md', ok: false});
});

test('copy-page:open carries the row slug, href, and widget URL', async ({page}) => {
  await page.goto('/docs/post-plain/');
  await collect(page, 'copy-page:open');
  // Prevent the navigation itself; the module's own click handling (event
  // dispatch, menu close) still runs.
  await page.evaluate(() => {
    document.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        event.preventDefault();
      }
    });
  });

  await page.locator('summary.copy-page__toggle').click();
  await page.locator('a.copy-page__row--view').click();
  await page.waitForFunction(() => window.__events.length === 1);

  const events = await page.evaluate(() => window.__events);
  // href is the anchor's resolved absolute URL; for the view row that is
  // the same Markdown URL the widget itself advertises.
  expect(events[0]).toEqual({row: 'view', href: PLAIN_MD, url: PLAIN_MD});
});
