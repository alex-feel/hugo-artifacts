// The command-palette modal: hotkeys, native dialog semantics, the
// activedescendant keyboard model, Enter navigation on both branches, and
// the two-stage Escape.
/* global document, window, URL */
import {test, expect} from '@playwright/test';

const DIALOG = '.search--modal .search__dialog';
const INPUT = '.search--modal .search__input';

test('hotkey opens the native dialog; arrows and Enter drive options', async ({page}) => {
  const selects = [];
  await page.exposeFunction('recordSelect', (detail) => selects.push(detail));
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    document.addEventListener('search:select', (event) => window.recordSelect(event.detail));
  });

  await page.keyboard.press('Control+KeyK');
  const dialog = page.locator(DIALOG);
  await expect(dialog).toHaveAttribute('open', '');
  // The background is inert: the dialog is in the top layer via showModal().
  expect(await dialog.evaluate((el) => el.matches(':modal'))).toBeTruthy();

  const input = page.locator(INPUT);
  await expect(input).toBeFocused();

  await input.fill('gravity');
  const options = page.locator('.search--modal .search__option');
  await expect(options).toHaveCount(2);
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  // Options stay out of the Tab order (activedescendant pattern): every
  // option link carries tabindex="-1" while remaining clickable.
  for (const option of await options.all()) {
    await expect(option.locator('a')).toHaveAttribute('tabindex', '-1');
  }

  await page.keyboard.press('ArrowDown');
  const firstId = await options.first().getAttribute('id');
  await expect(input).toHaveAttribute('aria-activedescendant', firstId);
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(options.first()).toHaveAttribute('aria-selected', 'false');

  await page.keyboard.press('ArrowUp');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Enter');
  await page.waitForURL('**/blog/gravity-title/');
  expect(selects).toHaveLength(1);
  expect(selects[0]).toMatchObject({
    href: '/blog/gravity-title/',
    query: 'gravity',
    surface: 'modal',
  });
});

test('the heading call-site key renders inside the dialog', async ({page}) => {
  await page.goto('/');
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  // The fixture passes heading "Palette search" to the modal partial; the
  // dialog must render it before the form, exactly as page and inline do.
  await expect(page.locator(`${DIALOG} h2.search__heading`)).toHaveText('Palette search');
});

test('slash opens the modal only outside text fields', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);

  // Typing "/" inside a focused text field must not open the palette.
  const inlineInput = page.locator('.search--inline .search__input');
  await inlineInput.click();
  await page.keyboard.press('/');
  await expect(page.locator(DIALOG)).not.toHaveAttribute('open', '');
  await expect(inlineInput).toHaveValue('/');

  // With focus outside any field, "/" opens it (hotkey_slash = true).
  await page.locator('h1').click();
  await page.keyboard.press('/');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
});

test('enter with no active option navigates to see-all with a Cyrillic query intact', async ({
  page,
}) => {
  await page.goto('/blog/gravity-title/');
  await page.keyboard.press('Control+KeyK');
  await page.locator(INPUT).fill('ёлка');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/search/**');
  expect(new URL(page.url()).searchParams.get('q')).toBe('ёлка');
});

test('escape clears first, closes second; focus returns to the trigger', async ({page}) => {
  await page.goto('/');
  const trigger = page.locator('.search--modal .search__trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.locator(DIALOG);
  await expect(dialog).toHaveAttribute('open', '');

  const input = page.locator(INPUT);
  await input.fill('gravity');
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('');
  await expect(dialog).toHaveAttribute('open', '');

  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open', '');
  await expect(trigger).toBeFocused();
});
