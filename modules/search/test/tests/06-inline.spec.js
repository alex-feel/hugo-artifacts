// The inline dropdown's combobox contract: aria wiring, activedescendant
// tracking, collapse and clear semantics.
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
