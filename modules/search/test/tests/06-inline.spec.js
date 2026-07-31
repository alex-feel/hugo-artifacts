// The inline dropdown's combobox contract: aria wiring, activedescendant
// tracking, collapse and clear semantics, and option-click activation when
// consumer styling pads the option beyond its anchor.
/* global document, sessionStorage, window */
import {test, expect} from '@playwright/test';

test('combobox attribute walk', async ({page}) => {
  await page.goto('/');
  const root = page.locator('.search--inline');
  await expect(root).toHaveClass(/search--enhanced/);
  const input = root.locator('.search__input');
  const listbox = root.locator('.search__listbox');

  await expect(input).toHaveAttribute('role', 'combobox');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveAttribute('aria-autocomplete', 'list');
  const listboxId = await listbox.getAttribute('id');
  await expect(input).toHaveAttribute('aria-controls', listboxId);
  await expect(listbox).toHaveAttribute('role', 'listbox');

  await input.fill('gravity');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(listbox).toBeVisible();

  const options = root.locator('.search__option');
  await expect(options).toHaveCount(2);
  const ids = await options.evaluateAll((els) => els.map((el) => el.id));
  expect(ids.every(Boolean)).toBeTruthy();
  expect(new Set(ids).size).toBe(ids.length);
  for (const option of await options.all()) {
    await expect(option).toHaveAttribute('role', 'option');
    // Options are reached with arrow keys via aria-activedescendant, never
    // with Tab: the option link must be non-tabbable.
    await expect(option.locator('a')).toHaveAttribute('tabindex', '-1');
  }

  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', ids[0]);
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', ids[1]);
  await expect(options.first()).toHaveAttribute('aria-selected', 'false');
});

test('escape collapses, ArrowDown re-expands, second escape clears', async ({page}) => {
  await page.goto('/');
  const root = page.locator('.search--inline');
  const input = root.locator('.search__input');
  const listbox = root.locator('.search__listbox');

  await input.fill('gravity');
  await expect(listbox).toBeVisible();

  // First Escape collapses the (still populated) listbox.
  await input.press('Escape');
  await expect(listbox).toBeHidden();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue('gravity');

  // ArrowDown on a closed populated listbox re-expands it.
  await input.press('ArrowDown');
  await expect(listbox).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  // Collapse again, then the second Escape clears the input.
  await input.press('Escape');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(listbox).toBeHidden();
});

test('clearing the query hides the listbox again', async ({page}) => {
  await page.goto('/');
  const root = page.locator('.search--inline');
  const input = root.locator('.search__input');
  const listbox = root.locator('.search__listbox');

  await input.fill('gravity');
  await expect(listbox).toBeVisible();
  await input.fill('');
  await expect(listbox).toBeHidden();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('a click on option padding navigates and fires exactly one search:select', async ({page}) => {
  await page.goto('/');
  const root = page.locator('.search--inline');
  await expect(root).toHaveClass(/search--enhanced/);
  const input = root.locator('.search__input');

  // The counter must survive the navigation the click causes, so it rides
  // sessionStorage rather than a window variable.
  await page.evaluate(() => {
    sessionStorage.setItem('search-select-count', '0');
    document.addEventListener('search:select', () => {
      sessionStorage.setItem(
        'search-select-count',
        String(Number(sessionStorage.getItem('search-select-count')) + 1),
      );
    });
  });

  await input.fill('gravity');
  const option = root.locator('.search__option').first();
  await expect(option).toBeVisible();

  // Simulate consumer styling that pads the option beyond its anchor, then
  // click inside that padding: the anchor cannot navigate natively there,
  // so the option's own handler must -- an activation event for a
  // navigation that never happens would leave the click doing nothing.
  await option.evaluate((el) => {
    el.style.display = 'block';
    el.style.padding = '24px';
  });
  const href = await option.locator('a').getAttribute('href');
  await option.click({position: {x: 6, y: 6}});

  await page.waitForURL('**' + href);
  expect(await page.evaluate(() => sessionStorage.getItem('search-select-count'))).toBe('1');
});

test('a padding click on an anchor without a usable href never navigates', async ({page}) => {
  await page.goto('/');
  const root = page.locator('.search--inline');
  await expect(root).toHaveClass(/search--enhanced/);
  const input = root.locator('.search__input');

  await input.fill('gravity');
  const option = root.locator('.search__option').first();
  await expect(option).toBeVisible();

  // Pad the option beyond its anchor, then strip the anchor's href: the
  // handler's navigation branch must refuse it, because link.href on an
  // anchor without the attribute resolves to the empty string and assigning
  // that would RELOAD the current page rather than navigate anywhere.
  await option.evaluate((el) => {
    el.style.display = 'block';
    el.style.padding = '24px';
    el.querySelector('a').removeAttribute('href');
  });

  // A reload replaces the document, so a window marker set before the click
  // survives exactly when no navigation of any kind happened.
  await page.evaluate(() => {
    window.__searchNoNavProbe = true;
  });
  await option.click({position: {x: 6, y: 6}});
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__searchNoNavProbe)).toBe(true);
});
