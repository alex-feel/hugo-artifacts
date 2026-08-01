// Progressive enhancement: the capability-gated reveal of the copy controls,
// the enhanced state class, the clipboard copy flow (exact twin text, live
// region, timed reset, cache reuse, the 404 error path), the menu
// conveniences (Escape, outside close, close-on-activate, focus return), and
// per-placement script emission on paginator outputs.
/* global window, document, navigator */
import {test, expect} from '@playwright/test';

const BASE = 'http://localhost:1616';
const PLAIN_MD = `${BASE}/docs/post-plain/index.md`;

// Collects copy-page:action details on the page so specs can await the Nth
// completed copy attempt instead of racing status-text transitions.
async function trackActions(page) {
  await page.evaluate(() => {
    window.__actions = [];
    document.addEventListener('copy-page:action', (event) => {
      window.__actions.push(event.detail);
    });
  });
}

// Prevents link-row navigation while leaving the module's own click handling
// (event dispatch, menu close) fully intact.
async function preventNavigation(page) {
  await page.evaluate(() => {
    document.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        event.preventDefault();
      }
    });
  });
}

test('reveals the copy controls per capability and marks the widget enhanced', async ({page}) => {
  await page.goto('/docs/post-plain/');
  const root = page.locator('.copy-page');
  await expect(root).toHaveClass(/copy-page--enhanced/);

  // localhost is a secure context and Chromium ships the async clipboard,
  // so both copy controls must be revealed: hidden and the inline
  // display:none both cleared.
  const primary = page.locator('button.copy-page__copy');
  await expect(primary).toBeVisible();
  await expect(primary).toHaveJSProperty('hidden', false);

  const copyItem = page.locator('li.copy-page__item--copy');
  await expect(copyItem).toHaveJSProperty('hidden', false);
  await page.locator('summary.copy-page__toggle').click();
  await expect(copyItem).toBeVisible();
});

test('copies the twin markdown exactly, announces, and resets on a timer', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/docs/post-plain/');

  const button = page.locator('button.copy-page__copy');
  await button.click();

  const status = page.locator('.copy-page__status');
  await expect(status).toHaveText('Page copied as Markdown');
  await expect(button).toHaveClass(/copy-page__copy--copied/);
  await expect(page.locator('.copy-page')).toHaveClass(/copy-page--copied/);

  // The clipboard holds the fixture twin's exact text. The OS clipboard
  // canonicalizes line endings to the platform convention (CRLF on Windows)
  // on the write-read round trip, so the comparison normalizes them -- the
  // module wrote the fetched bytes verbatim either way.
  const expected = await (await page.request.get(PLAIN_MD)).text();
  expect(expected).toContain('copy-page fixture twin marker');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, '\n')).toBe(expected.replace(/\r\n/g, '\n'));

  // The copied state resets after three seconds.
  await expect(status).toHaveText('', {timeout: 5000});
  await expect(button).not.toHaveClass(/copy-page__copy--copied/);
  await expect(page.locator('.copy-page')).not.toHaveClass(/copy-page--copied/);
});

test('menu copy row closes the menu and mirrors the state on the primary half', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/docs/post-plain/');

  const details = page.locator('details.copy-page__menu');
  await page.locator('summary.copy-page__toggle').click();
  await expect(details).toHaveJSProperty('open', true);

  const row = page.locator('button.copy-page__row--copy');
  await row.click();
  await expect(details).toHaveJSProperty('open', false);
  await expect(page.locator('.copy-page__status')).toHaveText('Page copied as Markdown');
  await expect(row).toHaveClass(/copy-page__row--copied/);
  // The visible half of the split button reflects the menu row's action.
  await expect(page.locator('button.copy-page__copy')).toHaveClass(/copy-page__copy--copied/);
  await expect(page.locator('.copy-page')).toHaveClass(/copy-page--copied/);
});

test('a missing twin announces the error and writes nothing to the clipboard', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/docs/post-404/');

  // Seed the clipboard so "nothing was written" is observable.
  await page.evaluate(() => navigator.clipboard.writeText('clipboard sentinel'));

  const root = page.locator('#copy-404');
  await expect(root).toHaveClass(/copy-page--enhanced/);
  await root.locator('button.copy-page__copy').click();

  await expect(root.locator('.copy-page__status')).toHaveText("Couldn't copy the page");
  await expect(root).not.toHaveClass(/copy-page--copied/);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe('clipboard sentinel');
});

test('Escape closes the menu and returns focus to the toggle', async ({page}) => {
  await page.goto('/docs/post-plain/');
  const details = page.locator('details.copy-page__menu');
  await page.locator('summary.copy-page__toggle').click();
  await expect(details).toHaveJSProperty('open', true);

  await page.keyboard.press('Escape');
  await expect(details).toHaveJSProperty('open', false);
  const focusedToggle = await page.evaluate(() =>
    document.activeElement.classList.contains('copy-page__toggle'),
  );
  expect(focusedToggle).toBe(true);
});

test('outside interaction closes the menu', async ({page}) => {
  await page.goto('/docs/post-plain/');
  const details = page.locator('details.copy-page__menu');
  await page.locator('summary.copy-page__toggle').click();
  await expect(details).toHaveJSProperty('open', true);

  await page.locator('h1').click();
  await expect(details).toHaveJSProperty('open', false);
});

test('activating a link row closes the menu', async ({page}) => {
  await page.goto('/docs/post-plain/');
  await preventNavigation(page);
  const details = page.locator('details.copy-page__menu');
  await page.locator('summary.copy-page__toggle').click();
  await expect(details).toHaveJSProperty('open', true);

  await page.locator('a.copy-page__row--view').click();
  await expect(details).toHaveJSProperty('open', false);
});

test('a second copy is served from the cache without a new network request', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/docs/post-plain/');
  await trackActions(page);

  let twinRequests = 0;
  page.on('request', (request) => {
    if (request.url() === PLAIN_MD) {
      twinRequests++;
    }
  });

  const button = page.locator('button.copy-page__copy');
  await button.click();
  await page.waitForFunction(() => window.__actions.length === 1);
  // Let any in-flight twin fetch land (the hover warm-up may race the first
  // click and issue its own request) before snapshotting the count; the
  // contract under test is only that the SECOND copy adds none.
  await page.waitForTimeout(250);
  const afterFirst = twinRequests;
  expect(afterFirst).toBeGreaterThanOrEqual(1);

  await button.click();
  await page.waitForFunction(() => window.__actions.length === 2);
  const actions = await page.evaluate(() => window.__actions);
  expect(actions[0].ok).toBe(true);
  expect(actions[1].ok).toBe(true);
  expect(twinRequests).toBe(afterFirst);
});

test('per-placement emission reaches paginator page two', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/docs/page/2/');

  // The script tag must be emitted on THIS paginator output, not only on
  // the section's first-rendered page, and the widget must be enhanced.
  await expect(page.locator('script[src*="copy-page"]')).toHaveCount(1);
  const root = page.locator('.copy-page');
  await expect(root).toHaveAttribute('data-copy-page-url', `${BASE}/docs/index.md`);
  await expect(root).toHaveClass(/copy-page--enhanced/);

  await root.locator('button.copy-page__copy').click();
  await expect(root.locator('.copy-page__status')).toHaveText('Page copied as Markdown');
  const expected = await (await page.request.get(`${BASE}/docs/index.md`)).text();
  expect(expected).toContain('copy-page section twin marker');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // Same line-ending normalization as the exact-copy test: the OS clipboard
  // canonicalizes to CRLF on Windows on the write-read round trip.
  expect(copied.replace(/\r\n/g, '\n')).toBe(expected.replace(/\r\n/g, '\n'));
});
