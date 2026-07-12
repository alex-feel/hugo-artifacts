// Server-rendered markup with JavaScript disabled: the progressive
// enhancement baseline, form action contracts, dual-hidden JS-only
// controls, live regions, and the resolved-defaults attribute guard.
/* global URL */
import {test, expect} from '@playwright/test';

test.use({javaScriptEnabled: false});

test('dedicated page: form contract, defaults, noscript, live regions', async ({page}) => {
  await page.goto('/search/');
  const root = page.locator('.search--page');
  await expect(root).toHaveCount(1);
  await expect(root).toHaveAttribute('data-search-surface', 'page');
  // Guard against the TOML table-capture regression class: flat keys
  // declared AFTER the boost block in defaults.toml resolve correctly.
  await expect(root).toHaveAttribute('data-search-page-size', '10');
  await expect(root).toHaveAttribute('data-search-lang', 'en');
  await expect(root).toHaveAttribute('data-search-index-url', '/searchindex.json');

  const form = root.locator('.search__form');
  await expect(form).toHaveAttribute('method', 'get');
  // The page surface's own form action is ALWAYS the current page's URL.
  await expect(form).toHaveAttribute('action', '/search/');

  const input = root.locator('.search__input');
  await expect(input).toHaveAttribute('name', 'q');
  const inputId = await input.getAttribute('id');
  await expect(root.locator('label.search__label')).toHaveAttribute('for', inputId);

  await expect(root.locator('.search__status')).toHaveAttribute('role', 'status');
  await expect(root.locator('.search__alert')).toHaveAttribute('role', 'alert');
  await expect(root.locator('.search__noscript')).toHaveCount(1);
  await expect(root.locator('.search__clear')).toBeHidden();
  await expect(root.locator('.search__more')).toBeHidden();
  await expect(root).not.toHaveClass(/search--enhanced/);
});

test('modal: trigger dual-hidden without JavaScript; action targets the search page', async ({
  page,
}) => {
  await page.goto('/blog/gravity-title/');
  const modal = page.locator('.search--modal');
  await expect(modal).toHaveAttribute('data-search-limit', '8');
  await expect(modal.locator('.search__trigger')).toBeHidden();
  await expect(modal.locator('.search__form')).toHaveAttribute('action', '/search/');
});

test('inline: working GET form into the search page; listbox dual-hidden', async ({page}) => {
  await page.goto('/');
  const inline = page.locator('.search--inline');
  await expect(inline).toHaveAttribute('data-search-limit', '8');
  await expect(inline.locator('.search__form')).toHaveAttribute('action', '/search/');
  await expect(inline.locator('.search__listbox')).toBeHidden();

  // worker and cache are BACKEND-SCOPED: the fixture layout's call-site
  // override attempt (worker=false, cache=false) is ignored, so the shared
  // backend keeps the site-tier values (worker default true, cache = true).
  const options = JSON.parse(await inline.getAttribute('data-search-options'));
  expect(options.worker).toBe(true);
  expect(options.cache).toBe('true');
});

test('ru surfaces target ru URLs and a Cyrillic query round-trips', async ({page}) => {
  await page.goto('/ru/search/');
  const root = page.locator('.search--page');
  await expect(root.locator('.search__form')).toHaveAttribute('action', '/ru/search/');
  await expect(root).toHaveAttribute('data-search-index-url', '/ru/searchindex.json');
  await expect(page.locator('.search--modal .search__form')).toHaveAttribute(
    'action',
    '/ru/search/',
  );
  await root.locator('.search__input').fill('ёлка');
  await root.locator('.search__submit').click();
  await page.waitForURL(/q=/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('ёлка');
});
