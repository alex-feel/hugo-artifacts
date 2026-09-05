// The inline dropdown's combobox contract: aria wiring, activedescendant
// tracking, collapse and clear semantics, option-click activation when
// consumer styling pads the option beyond its anchor, and the document
// hotkey serving the inline surface (focus-and-select, the slash opt-in
// with its any-field typing suppression, the modifier-less typing guard,
// first-record election between two placements with tail re-adoption,
// record re-adoption across a swap, and the palette hand-off: a palette
// that handles the chord wins, a hotkey-disabled closed palette no longer
// blocks an inline placement's own hotkey, and an OPEN palette blocks it
// because the background is inert).
/* global document, sessionStorage, window, CustomEvent, MutationObserver */
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

test('on a page with no palette the hotkey focuses the inline input and selects its text', async ({
  page,
}) => {
  await page.goto('/inline-only/');
  // The fixture gates the header palette off here, so the inline dropdown
  // is the page's only hotkey-carrying surface.
  await expect(page.locator('.search--modal')).toHaveCount(0);
  const root = page.locator('.search--inline');
  await expect(root).toHaveClass(/search--enhanced/);
  const input = root.locator('.search__input');
  // The script advertises the platform-resolved shortcut on the input.
  await expect(input).toHaveAttribute('aria-keyshortcuts', 'Control+K');

  await input.fill('gravity');
  await page.locator('h1').click();
  await expect(input).not.toBeFocused();

  await page.keyboard.press('Control+KeyK');
  await expect(input).toBeFocused();
  // The existing text is selected so the next keystroke replaces it, and
  // focus alone never expands the listbox (expansion stays typing-driven).
  expect(
    await input.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length]),
  ).toEqual([0, 7, 7]);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('"/" focuses the inline input when opted in and stays an ordinary character while typing', async ({
  page,
}) => {
  await page.goto('/inline-only/');
  const input = page.locator('.search--inline .search__input');
  await page.locator('h1').click();

  // hotkey_slash = true site-wide in the fixture: outside any field, "/"
  // moves focus without typing itself into the input.
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');

  // While typing, "/" is text entry, not a command.
  await page.keyboard.type('a/b');
  await expect(input).toHaveValue('a/b');
  await expect(input).toBeFocused();

  // The suppression keys on ANY typing context, not on the search input
  // specifically: "/" typed in an unrelated field stays there.
  await page.evaluate(() => {
    const field = document.createElement('input');
    field.id = 'foreign-field';
    document.querySelector('main').appendChild(field);
  });
  await page.locator('#foreign-field').click();
  await page.keyboard.press('/');
  await expect(page.locator('#foreign-field')).toHaveValue('/');
  await expect(input).not.toBeFocused();
});

test('with a palette on the page the hotkey serves it, never the inline input', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator('.search--modal .search__dialog')).toHaveAttribute('open', '');
  await expect(page.locator('.search--inline .search__input')).not.toBeFocused();
});

test("a palette with its hotkey disabled never blocks an inline placement's own hotkey", async ({
  page,
}) => {
  // hotkey and hotkey_slash resolve per call site, so a page can disable
  // the palette's chord while its inline placement keeps one; patch the
  // modal's configured hotkey off before the module evaluates.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector('.search--modal');
      if (modal) {
        modal.dataset.searchHotkey = '';
        modal.dataset.searchHotkeySlash = 'false';
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  const input = page.locator('.search--inline .search__input');
  await page.keyboard.press('Control+KeyK');
  await expect(input).toBeFocused();
  await expect(page.locator('.search--modal .search__dialog')).not.toHaveAttribute('open', '');
});

test('an OPEN palette blocks the inline hotkey: the background is inert', async ({page}) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector('.search--modal');
      if (modal) {
        modal.dataset.searchHotkey = '';
        modal.dataset.searchHotkeySlash = 'false';
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  const dialog = page.locator('.search--modal .search__dialog');
  await page.locator('.search--modal .search__trigger').click();
  await expect(dialog).toHaveAttribute('open', '');

  await page.keyboard.press('Control+KeyK');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.locator('.search--inline .search__input')).not.toBeFocused();
});

test('a modifier-less inline hotkey never steals focus while typing', async ({page}) => {
  // Patch the inline surface's configured hotkey to a bare "k" before the
  // module evaluates: with no non-typing modifier it must keep working
  // outside typing contexts and stay an ordinary character inside them.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const inline = document.querySelector('.search--inline');
      if (inline) {
        inline.dataset.searchHotkey = 'k';
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/inline-only/');
  const input = page.locator('.search--inline .search__input');
  await page.locator('h1').click();

  await page.keyboard.press('k');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');

  // The next "k" lands in the now-focused input as text entry.
  await page.keyboard.press('k');
  await expect(input).toHaveValue('k');
  await expect(input).toBeFocused();
});

test('with two inline placements the first serves the hotkey, and a re-adopted first rejoins at the tail', async ({
  page,
}) => {
  await page.goto('/inline-two/');
  const roots = page.locator('.search--inline');
  await expect(roots).toHaveCount(2);
  await expect(roots.first()).toHaveClass(/search--enhanced/);
  const first = roots.first().locator('.search__input');
  const second = page.locator('.second-inline .search__input');

  await page.locator('h1').click();
  await page.keyboard.press('Control+KeyK');
  await expect(first).toBeFocused();

  // Detach the first placement: the next press prunes its record and the
  // second, now the first connected record, serves.
  await page.evaluate(() => {
    const root = document.querySelector('.search--inline');
    window.__searchOrderStash = {root, parent: root.parentNode, next: root.nextSibling};
    root.remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await page.keyboard.press('Control+KeyK');
  await expect(second).toBeFocused();

  // Re-inserting the first re-adopts its record at the TAIL, so the
  // second keeps serving: re-adoption restores service, not seniority.
  await page.evaluate(() => {
    const {root, parent, next} = window.__searchOrderStash;
    parent.insertBefore(root, next);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await page.locator('h1').click();
  await page.keyboard.press('Control+KeyK');
  await expect(second).toBeFocused();
});

test('the hotkey survives a swap that detaches and re-inserts the inline root', async ({page}) => {
  await page.goto('/inline-only/');
  const input = page.locator('.search--inline .search__input');
  await page.locator('h1').click();

  await page.evaluate(() => {
    const root = document.querySelector('.search--inline');
    window.__searchSwapStash = {root, parent: root.parentNode, next: root.nextSibling};
    root.remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  // With the root detached the shortcut has nothing to serve; this press
  // also drives the event-time prune that stashes the record.
  await page.keyboard.press('Control+KeyK');

  await page.evaluate(() => {
    const {root, parent, next} = window.__searchSwapStash;
    parent.insertBefore(root, next);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await page.keyboard.press('Control+KeyK');
  await expect(input).toBeFocused();
});
