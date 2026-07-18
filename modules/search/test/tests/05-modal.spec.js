// The command-palette modal: hotkeys, native dialog semantics, the
// activedescendant keyboard model, Enter navigation on both branches, the
// two-stage Escape, multi-placement dialog election, rescan re-election
// after a swap (replacement roots and stashed survivors), and the
// hidden-trigger guarantee when no dialog can serve.
/* global document, window, URL, CustomEvent, MutationObserver */
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

test('a second placement keeps one dialog; its trigger opens the shared palette', async ({
  page,
}) => {
  // The server emits a dialog per placement (a page-scoped sentinel cannot
  // dedup per paginator output); enhancement elects the first dialog as the
  // page's single shared palette and removes the rest.
  await page.goto('/promo/');
  await expect(page.locator('.search--modal.search--enhanced')).toHaveCount(2);
  await expect(page.locator(DIALOG)).toHaveCount(1);
  // The FIRST dialog wins the election: the fixture's header placement
  // passes heading "Palette search" while the footer placement passes
  // none, so the survivor is distinguishable.
  await expect(page.locator(`${DIALOG} h2.search__heading`)).toHaveText('Palette search');
  const triggers = page.locator('.search--modal .search__trigger');
  await expect(triggers).toHaveCount(2);
  await expect(triggers.nth(1)).toBeVisible();
  await triggers.nth(1).click();
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
});

test('extra triggers prefetch the shared backend on intent', async ({page}) => {
  await page.goto('/promo/');
  await expect(page.locator('.search--modal.search--enhanced')).toHaveCount(2);
  await page.evaluate(() => {
    document.addEventListener('search:ready', (event) => {
      window.__searchReady = event.detail;
    });
  });
  // Hovering the SECOND placement's trigger -- a trigger-only root after
  // election -- must prefetch the owner's backend without any click.
  await page.locator('.search--modal .search__trigger').nth(1).hover();
  await expect.poll(() => page.evaluate(() => window.__searchReady)).toBeTruthy();
});

test('search:rescan re-elects a swapped-in modal root after the owner leaves', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // Simulate a PJAX/Turbo navigation: replace the owning root with a fresh
  // server-rendered copy and announce it via search:rescan.
  await page.evaluate(() => {
    const root = document.querySelector('.search--modal');
    const fresh = root.cloneNode(true);
    fresh.classList.remove('search--enhanced');
    root.remove();
    document.querySelector('header').appendChild(fresh);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).toHaveCount(1);
  await page.keyboard.press('Control+KeyK');
  const dialog = page.locator(DIALOG);
  await expect(dialog).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('pager outputs keep a working palette', async ({page}) => {
  await page.goto('/blog/page/2/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  const dialog = page.locator(DIALOG);
  await expect(dialog).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('search:rescan restores a stashed dialog when the swap keeps only trigger-only survivors', async ({
  page,
}) => {
  await page.goto('/promo/');
  await expect(page.locator('.search--modal.search--enhanced')).toHaveCount(2);
  await expect(page.locator(DIALOG)).toHaveCount(1);
  // Remove the owning header root entirely; the enhanced footer survivor
  // carries no dialog (it was detached at election), so recovery must
  // restore its stashed one and wire a fresh controller.
  await page.evaluate(() => {
    document.querySelector('header .search--modal').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).toHaveCount(1);
  const trigger = page.locator('.search--modal .search__trigger');
  await expect(trigger).toHaveCount(1);
  await trigger.click();
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('a sole placement with a structurally broken dialog never reveals its trigger', async ({
  page,
}) => {
  // Strip the dialog's input while the document is still parsing, before
  // the module script evaluates: the only dialog then fails the structural
  // check, no owner can elect, and a revealed trigger would be a chip that
  // opens nothing.
  await page.addInitScript(() => {
    // Observe document itself: documentElement does not exist yet when
    // init scripts run.
    const observer = new MutationObserver(() => {
      const input = document.querySelector('.search__dialog .search__input');
      if (input) {
        input.remove();
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/blog/gravity-title/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
});

test('losing the last electable dialog hides revealed triggers again', async ({page}) => {
  // Break the HEADER placement's dialog during parsing: the footer
  // placement then elects, and its sweep reveals both triggers.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const input = document.querySelector('header .search__dialog .search__input');
      if (input) {
        input.remove();
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/promo/');
  const triggers = page.locator('.search--modal .search__trigger');
  await expect(triggers.first()).toBeVisible();
  await expect(triggers.nth(1)).toBeVisible();
  // Removing the owning footer root leaves no electable dialog anywhere
  // (the broken header dialog was removed, never stashed): the surviving
  // header trigger must hide again instead of opening nothing.
  await page.evaluate(() => {
    document.querySelector('footer .search--modal').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(triggers).toHaveCount(1);
  await expect(triggers.first()).toBeHidden();
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
