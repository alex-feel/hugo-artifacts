// Live-region announcements plus the client-side rendering trust
// boundaries: hostile payloads stay text, the img slot's scheme filter
// drops javascript: URLs, taxonomy slots deliver end to end, and query
// metacharacters never reach RegExp construction.
import {test, expect} from '@playwright/test';

const INPUT = '.search--page .search__input';

test('status region announces a debounced pluralized count', async ({page}) => {
  await page.goto('/search/');
  await page.locator(INPUT).fill('beacon');
  await expect(page.locator('.search--page .search__status')).toHaveText('2 results');
});

test('zero results land in the alert region and clear the status region', async ({page}) => {
  await page.goto('/search/');
  await page.locator(INPUT).fill('zzzqqqxx');
  await expect(page.locator('.search--page .search__alert')).toHaveText(
    'No results for “zzzqqqxx”',
  );
  await expect(page.locator('.search--page .search__status')).toHaveText('');
});

test('ru i18n override: every %s in a translation is substituted', async ({page}) => {
  // The fixture's i18n/ru.toml overrides search_no_results with a TWO-token
  // template, pinning both the project-over-module i18n merge and the
  // replaceAll substitution of repeated %s tokens.
  await page.goto('/ru/search/');
  await page.locator('.search--page .search__input').fill('zzzqqqxx');
  await expect(page.locator('.search--page .search__alert')).toHaveText(
    'По запросу «zzzqqqxx» ничего не найдено (запрос: zzzqqqxx)',
  );
});

test('hostile payloads render as text; nothing executes', async ({page}) => {
  const dialogs = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    dialog.dismiss().catch(() => {});
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/search/');
  await page.locator(INPUT).fill('tricks');
  const result = page.locator('.search--page .search__result').first();
  await expect(result).toBeVisible();

  await expect(result.locator('.search__result-title')).toContainText(
    '<img src=x onerror=alert(1)>',
  );
  await expect(result.locator('.search__result-snippet')).toContainText(
    '<script>alert("desc")</script>',
  );
  await expect(result.locator('.search__result-title .search__mark')).toHaveText('tricks');

  expect(await page.locator('.search__results img[src="x"]').count()).toBe(0);
  expect(await page.locator('.search__results script').count()).toBe(0);

  // The javascript: image URL is dropped by the scheme filter: the slot is
  // removed and no such src exists anywhere in the results DOM.
  expect(await page.locator('.search__results img[src^="javascript:"]').count()).toBe(0);
  expect(await result.locator('.search__result-image').count()).toBe(0);

  expect(dialogs).toHaveLength(0);
  expect(errors).toHaveLength(0);
});

test('relative thumbnail renders; tags and categories slots deliver', async ({page}) => {
  await page.goto('/search/');
  await page.locator(INPUT).fill('lighthouse');
  const result = page.locator('.search--page .search__result').first();
  await expect(result).toBeVisible();
  const image = result.locator('.search__result-image');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', '/img/cover.png');
  await expect(result.locator('.search__result-tags')).toHaveText('Hugo');
  await expect(result.locator('.search__result-categories')).toHaveText('Tools');
  await expect(result.locator('.search__result-date')).toHaveAttribute('datetime', '2026-01-16');
});

test('regex metacharacters in queries crash nothing', async ({page}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/search/');
  const input = page.locator(INPUT);

  await input.fill('quotes (');
  await expect(page.locator('.search--page .search__result').first()).toBeVisible();

  // "[ ]]>" tokenizes down to ">" and legitimately matches the hostile
  // page's literal "]]>" text -- metacharacters search as plain text.
  await input.fill('[ ]]>');
  await expect(page.locator('.search--page .search__status')).toHaveText('1 result');

  // An all-punctuation query yields zero terms and lands in the alert.
  await input.fill('((( [[[');
  await expect(page.locator('.search--page .search__alert')).toHaveText('No results for “((( [[[”');

  expect(errors).toHaveLength(0);
});
