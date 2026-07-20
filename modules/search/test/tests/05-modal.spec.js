// The command-palette modal: hotkeys, native dialog semantics, the
// activedescendant keyboard model, Enter navigation on both branches, the
// two-stage Escape, multi-placement dialog election, rescan re-election
// after a swap (replacement roots, stashed survivors, and re-adopted
// re-inserted former owners -- including open-at-swap normalization on
// both the re-adoption and fresh-wiring paths, re-adoption's priority
// over the stash, and impostor-dialog removal), the integrity-gate scope
// (input and listbox must stay inside the dialog whether moved out
// before wiring, after wiring, or on the stash-drain path; a gutted
// owner is deposed with its husk removed -- closed first when open, so
// search--open and search:close stay consistent -- and its record
// dropped, so restored dialogs linger unserved, with a stray-open
// restore closed back to baseline in dead roots and beside or inside
// the healthy owner's root alike, the module's own re-inserted
// torn-down dialog firing its close listener, and impostors wearing
// the class (div, details, or a foreign-namespace dialog) invisible to
// wiring and recovery, able to break neither, with wiring electing the
// first real dialog past any of them; a multi-placement page falls
// back to its stashed survivor; the inert template is exempt
// everywhere), the :modal probe
// (modern engines normalize the owner's dialog restored while open and
// spare a dialog a host put in the top layer itself; engines without
// :modal neither close an open palette on rescan nor skip fresh-root
// and deposed-owner normalization), the hidden-trigger guarantee when
// no dialog can serve, the IME composition guard on the listbox
// keyboard model, the modifier-less-hotkey typing guard, and the
// dialog-less-engine support floor (no HTMLDialogElement global: the
// modal stays unwired while every other surface still enhances).
/* global document, window, URL, CustomEvent, MutationObserver, Element, KeyboardEvent */
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

test('search:rescan re-adopts a re-inserted former owner', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // Detach the owning root (a host cache holds it) and announce the loss.
  await page.evaluate(() => {
    const root = document.querySelector('.search--modal');
    window.__searchCache = {root, parent: root.parentElement};
    root.remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal')).toHaveCount(0);
  // Cache restore: the SAME nodes return -- connected, already enhanced,
  // dialog intact, never stashed -- and a rescan must re-adopt the old
  // controller rather than leave a servable dialog with no owner.
  await page.evaluate(() => {
    window.__searchCache.parent.appendChild(window.__searchCache.root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__trigger')).toBeVisible();
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('a re-inserted former owner with a replaced dialog is not re-adopted', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // Host teardown that strips listeners by cloning: root identity is
  // preserved but the record's own wired dialog is gone, so re-adoption
  // must refuse the unwired impostor and the trigger must hide rather
  // than open nothing.
  await page.evaluate(() => {
    const root = document.querySelector('.search--modal');
    window.__searchCache = {root, parent: root.parentElement};
    root.remove();
    const dialog = root.querySelector('.search__dialog');
    dialog.replaceWith(dialog.cloneNode(true));
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await page.evaluate(() => {
    window.__searchCache.parent.appendChild(window.__searchCache.root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal')).toHaveCount(1);
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  // The refused impostor is removed rather than left as a second,
  // unservable dialog.
  await expect(page.locator('.search--modal .search__dialog')).toHaveCount(0);
});

test('re-adoption normalizes a dialog that was open at swap time', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  // Detach the root while the palette is open: removal strips top-layer
  // status but keeps the open attribute.
  await page.evaluate(() => {
    const root = document.querySelector('.search--modal');
    window.__searchCache = {root, parent: root.parentElement};
    root.remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await page.evaluate(() => {
    window.__searchCache.parent.appendChild(window.__searchCache.root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  // Re-adoption must close the stray-open dialog back to the baseline,
  // and the hotkey must reopen it modally.
  await expect(page.locator(DIALOG)).not.toHaveAttribute('open', '');
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  expect(await page.locator(DIALOG).evaluate((el) => el.matches(':modal'))).toBeTruthy();
});

test('a swapped-in fresh root with a stray-open dialog starts closed', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  // A host that clones the open palette into a fresh replacement root:
  // the clone keeps the stray open attribute without top-layer status,
  // and wireModal must normalize it before wiring.
  await page.evaluate(() => {
    const root = document.querySelector('.search--modal');
    const clone = root.cloneNode(true);
    clone.classList.remove('search--enhanced');
    root.replaceWith(clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).not.toHaveAttribute('open', '');
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  expect(await page.locator(DIALOG).evaluate((el) => el.matches(':modal'))).toBeTruthy();
});

test('re-adoption outranks the stash so no second dialog lingers', async ({page}) => {
  await page.goto('/promo/');
  await expect(page.locator('.search--modal.search--enhanced')).toHaveCount(2);
  // Depose the header owner (keeping its nodes); the stashed footer
  // survivor takes over.
  await page.evaluate(() => {
    const header = document.querySelector('header .search--modal');
    window.__searchCache = {root: header, parent: header.parentElement};
    header.remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).toHaveCount(1);
  // Give the stash a candidate under the new owner: a fresh third
  // placement, whose dialog is detached at enhancement.
  await page.evaluate(() => {
    const clone = document.querySelector('footer .search--modal').cloneNode(true);
    clone.classList.remove('search--enhanced');
    document.body.appendChild(clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).toHaveCount(1);
  // Remove the footer owner and restore the original header root: the
  // fully wired former owner must win over the stashed clone, leaving
  // exactly one connected dialog -- the header's, identified by its
  // call-site heading.
  await page.evaluate(() => {
    document.querySelector('footer .search--modal').remove();
    window.__searchCache.parent.appendChild(window.__searchCache.root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).toHaveCount(1);
  await expect(page.locator(`${DIALOG} h2.search__heading`)).toHaveText('Palette search');
  const trigger = page.locator('header .search--modal .search__trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
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

test('a shadowed layout with the template outside the dialog stays fully servable', async ({
  page,
}) => {
  // A consumer shadow may place the inert <template data-search-template>
  // anywhere inside the surface root: rendering clones the reference
  // captured at wiring, so root-level placement is fully functional and
  // neither wiring nor the recovery sweep may reject or destroy it. The
  // h1 guard delays the move until the header (and the template inside
  // it) has fully parsed, still before the module script evaluates.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const template = document.querySelector(
        '.search--modal .search__dialog template[data-search-template]',
      );
      if (template && document.querySelector('h1')) {
        template.closest('.search--modal').appendChild(template);
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // init itself ends with a recovery pass, so a scope-mismatched gate
  // would have destroyed the dialog before this first assertion.
  await expect(page.locator(DIALOG)).toHaveCount(1);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).toHaveCount(1);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('wiring refuses a dialog whose input sits outside it', async ({page}) => {
  // showModal() makes everything outside the dialog inert, so a shadow
  // that moves the input out produces a palette that opens but cannot be
  // typed into; the structural check must treat it like any other broken
  // dialog: remove it and keep the trigger hidden.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const input = document.querySelector('.search--modal .search__dialog .search__input');
      if (input) {
        input.closest('.search--modal').appendChild(input);
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

test('a gutted owner is deposed: husk removed, trigger hidden', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await expect(page.locator('.search--modal .search__trigger')).toBeVisible();
  // Detaching the wired input from the owner's own dialog leaves an
  // unservable husk: the sweep must remove it and recovery must depose
  // the owner (a connected-root check alone would keep the ghost elected
  // with its trigger revealed while open() no-ops forever).
  await page.evaluate(() => {
    document.querySelector('.search--modal .search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
});

test('a detached results listbox also fails the integrity gate', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // A palette whose wired listbox is gone opens and accepts typing but
  // can never show a result, so it is exactly as unservable as one with
  // a detached input.
  await page.evaluate(() => {
    document.querySelector('.search--modal .search__listbox').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
});

test('stripping the template after wiring does not depose the owner', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // A sanitizer that strips <template> elements leaves the controller
  // fully functional -- rendering clones the reference captured at
  // wiring -- so the integrity gate must not fail over it.
  await page.evaluate(() => {
    document.querySelector('.search--modal template[data-search-template]').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).toHaveCount(1);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('without :modal support a rescan leaves the open palette alone', async ({page}) => {
  // Chrome 37-104, Edge 79-104, Firefox 98-102, and Safari 15.4-15.5 run
  // the full showModal() top-layer lifecycle but throw on
  // matches(':modal'), so the sweep cannot distinguish the owner's
  // legitimately open dialog from a stray one -- and must not close a
  // palette mid-use.
  await page.addInitScript(() => {
    const original = Element.prototype.matches;
    Element.prototype.matches = function (selector) {
      if (String(selector).includes(':modal')) {
        throw new SyntaxError('unsupported pseudo-class');
      }
      return original.call(this, selector);
    };
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('without :modal support a deposed owner still normalizes on re-adoption', async ({page}) => {
  // The owner exemption must not swallow the provable stray case: after
  // deposition the record is no longer the owner, so its re-inserted
  // open-at-swap dialog closes back to the baseline even where the
  // :modal probe cannot answer.
  await page.addInitScript(() => {
    const original = Element.prototype.matches;
    Element.prototype.matches = function (selector) {
      if (String(selector).includes(':modal')) {
        throw new SyntaxError('unsupported pseudo-class');
      }
      return original.call(this, selector);
    };
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await page.evaluate(() => {
    const root = document.querySelector('.search--modal');
    window.__searchCache = {root, parent: root.parentElement};
    root.remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await page.evaluate(() => {
    window.__searchCache.parent.appendChild(window.__searchCache.root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).not.toHaveAttribute('open', '');
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
});

test('gutting an OPEN palette closes it before removal: class and event stay consistent', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    window.__closes = 0;
    document.addEventListener('search:close', () => {
      window.__closes += 1;
    });
  });
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await expect(page.locator('.search--modal')).toHaveClass(/search--open/);
  // A sanitizer detaches the wired input while the palette is open: the
  // sweep must close the husk BEFORE removing it, so the wired close
  // listener drops search--open and dispatches search:close -- removal
  // alone fires no close event and would strand both documented hooks.
  await page.evaluate(() => {
    document.querySelector('.search--modal .search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal')).not.toHaveClass(/search--open/);
  await expect.poll(() => page.evaluate(() => window.__closes)).toBe(1);
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
});

test('an input moved out of the dialog after wiring fails the gate', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // The moved input stays connected inside the ROOT, so only a
  // dialog-scoped containment clause catches it -- a gate relaxed to
  // root scope (the exact defect class this round fixed) would keep the
  // owner elected with a palette that opens modally around an inert,
  // unreachable input.
  await page.evaluate(() => {
    const input = document.querySelector('.search--modal .search__input');
    input.closest('.search--modal').appendChild(input);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
});

test('a listbox moved out of the dialog after wiring fails the gate', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    const listbox = document.querySelector('.search--modal .search__listbox');
    listbox.closest('.search--modal').appendChild(listbox);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
});

test('on modern engines a rescan normalizes the owner root restored while open', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  // A cache restore detaches and re-inserts the OWNER's root while the
  // palette is open, with no rescan in between: the record is still the
  // owner, so only the probe-supported side of the sweep's exemption
  // closes the now in-flow dialog -- an exemption applied on modern
  // engines too (or a mis-cached probe) would leave it stuck open.
  await page.evaluate(() => {
    const root = document.querySelector('.search--modal');
    const parent = root.parentElement;
    root.remove();
    parent.appendChild(root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).not.toHaveAttribute('open', '');
  // The owner survived intact: the hotkey reopens the palette modally.
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  expect(await page.locator(DIALOG).evaluate((el) => el.matches(':modal'))).toBeTruthy();
});

test('wiring refuses a dialog whose listbox sits outside it', async ({page}) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const listbox = document.querySelector('.search--modal .search__dialog .search__listbox');
      if (listbox) {
        listbox.closest('.search--modal').appendChild(listbox);
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

test('the stash drain applies the wiring containment check', async ({page}) => {
  // The stash drain elects through wireModal and recovery returns
  // immediately on election, with no sweep afterwards in that pass --
  // the one path where the wiring check is not shadowed by the recovery
  // gate. Break the FOOTER placement before enhancement by moving its
  // input out of the dialog: the footer dialog is stashed at election
  // time (the structural check runs only on the electing path), and the
  // drain must refuse it when the header owner later disappears.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const input = document.querySelector('footer .search--modal .search__dialog .search__input');
      if (input) {
        input.closest('.search--modal').appendChild(input);
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/promo/');
  await expect(page.locator('.search--modal.search--enhanced')).toHaveCount(2);
  await page.evaluate(() => {
    document.querySelector('header .search--modal').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
});

test('without :modal support a swapped-in fresh root with a stray-open dialog starts closed', async ({
  page,
}) => {
  // wireModal's normalization is unconditional -- a never-wired dialog
  // cannot be the module's live modal -- so it must fire even where the
  // probe cannot answer; extending the sweep's owner exemption into
  // wiring would ship a visibly open in-flow clone on every swap.
  await page.addInitScript(() => {
    const original = Element.prototype.matches;
    Element.prototype.matches = function (selector) {
      if (String(selector).includes(':modal')) {
        throw new SyntaxError('unsupported pseudo-class');
      }
      return original.call(this, selector);
    };
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await page.evaluate(() => {
    const root = document.querySelector('.search--modal');
    const clone = root.cloneNode(true);
    clone.classList.remove('search--enhanced');
    root.replaceWith(clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator(DIALOG)).not.toHaveAttribute('open', '');
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
});

test('gutting the owner on a multi-placement page restores the stashed survivor', async ({
  page,
}) => {
  await page.goto('/promo/');
  await expect(page.locator('.search--modal.search--enhanced')).toHaveCount(2);
  await expect(page.locator(DIALOG)).toHaveCount(1);
  // Detach the header owner's wired input: the sweep removes the husk,
  // the gate deposes the owner, re-adoption finds no candidate, and the
  // stash drain must then restore the footer's dialog and wire a fresh
  // controller -- pinning the husk-removal -> depose -> stash-drain
  // ordering.
  await page.evaluate(() => {
    document.querySelector('header .search--modal .search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('footer .search--modal .search__dialog')).toHaveCount(1);
  await expect(page.locator(DIALOG)).toHaveCount(1);
  const trigger = page.locator('footer .search--modal .search__trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('a dead placement drops its record: restored dialogs linger unwired', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // Keep a pristine copy of the dialog, then gut the live one: the sweep
  // removes the husk AND drops the permanently failing record, freeing
  // the detached subtree it would otherwise retain for the JS-context
  // lifetime.
  await page.evaluate(() => {
    const dialog = document.querySelector('.search--modal .search__dialog');
    window.__searchCache = {clone: dialog.cloneNode(true)};
    dialog.querySelector('.search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
  // A host restore into the dead root joins the wiring-refusal end state:
  // record-less, so the healthy copy is neither wired nor swept away --
  // it lingers closed and inert instead of being deleted on every pass.
  await page.evaluate(() => {
    document.querySelector('.search--modal').appendChild(window.__searchCache.clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__dialog')).toHaveCount(1);
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator('.search--modal .search__dialog')).not.toHaveAttribute('open', '');
});

test('a stray-open dialog restored into a dead root is closed back to baseline', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    const dialog = document.querySelector('.search--modal .search__dialog');
    window.__searchCache = {clone: dialog.cloneNode(true)};
    dialog.querySelector('.search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
  // A host restore that carries the open attribute into the record-less
  // dead root would render as a visible in-flow panel of dead controls;
  // the sweep must close it back to the inert lingering baseline.
  await page.evaluate(() => {
    window.__searchCache.clone.setAttribute('open', '');
    document.querySelector('.search--modal').appendChild(window.__searchCache.clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__dialog')).toHaveCount(1);
  await expect(page.locator('.search--modal .search__dialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
});

test('a stray-open restore into a dead root closes while a healthy owner serves', async ({
  page,
}) => {
  await page.goto('/promo/');
  await expect(page.locator('.search--modal.search--enhanced')).toHaveCount(2);
  // Gut the header owner: the footer takes over through the stash drain,
  // and the header root goes dead and record-less.
  await page.evaluate(() => {
    const dialog = document.querySelector('header .search--modal .search__dialog');
    window.__searchCache = {clone: dialog.cloneNode(true)};
    dialog.querySelector('.search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('footer .search--modal .search__dialog')).toHaveCount(1);
  // Restore an open-carrying clone into the dead header root: the sweep
  // must close it even though the healthy footer owner makes recovery
  // return early, leaving the documented DOM-soft state -- a second,
  // closed, unopenable dialog lingering beside the served one.
  await page.evaluate(() => {
    window.__searchCache.clone.setAttribute('open', '');
    document.querySelector('header .search--modal').appendChild(window.__searchCache.clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  const headerDialog = page.locator('header .search--modal .search__dialog');
  await expect(headerDialog).toHaveCount(1);
  await expect(headerDialog).not.toHaveAttribute('open', '');
  await expect(page.locator('.search--modal .search__dialog')).toHaveCount(2);
  // The footer owner still serves every trigger.
  await page.locator('footer .search--modal .search__trigger').click();
  await expect(page.locator('footer .search--modal .search__dialog')).toHaveAttribute('open', '');
  await page.locator('footer .search--modal .search__input').fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
});

test('a host-opened top-layer dialog in a dead root survives the sweep', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    const dialog = document.querySelector('.search--modal .search__dialog');
    window.__searchCache = {clone: dialog.cloneNode(true)};
    dialog.querySelector('.search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
  // The host restores a dialog into the dead root and puts it in the top
  // layer ITSELF via showModal(): where the engine can answer, the probe
  // must spare it -- force-closing a dialog the user may be interacting
  // with is exactly what the :modal check exists to prevent.
  await page.evaluate(() => {
    document.querySelector('.search--modal').appendChild(window.__searchCache.clone);
    window.__searchCache.clone.showModal();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  const dialog = page.locator('.search--modal .search__dialog');
  await expect(dialog).toHaveAttribute('open', '');
  expect(await dialog.evaluate((el) => el.matches(':modal'))).toBeTruthy();
});

test('re-inserting the torn-down wired dialog fires its close listener', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // Tear the owner down while CLOSED: no close event fires, so the
  // dialog node leaves with its close listener still attached.
  await page.evaluate(() => {
    window.__closes = 0;
    document.addEventListener('search:close', () => {
      window.__closes += 1;
    });
    const dialog = document.querySelector('.search--modal .search__dialog');
    window.__searchCache = {dialog};
    dialog.querySelector('.search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
  expect(await page.evaluate(() => window.__closes)).toBe(0);
  // A host re-inserts that SAME node with a stray open attribute: the
  // sweep's close fires the still-attached listener, dispatching exactly
  // one search:close for this close -- the listener stays attached and
  // reports every close truthfully.
  await page.evaluate(() => {
    window.__searchCache.dialog.setAttribute('open', '');
    document.querySelector('.search--modal').appendChild(window.__searchCache.dialog);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__dialog')).not.toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => window.__closes)).toBe(1);
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
});

test('a non-dialog element carrying the dialog class cannot break recovery', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    const dialog = document.querySelector('.search--modal .search__dialog');
    window.__searchCache = {clone: dialog.cloneNode(true)};
    dialog.querySelector('.search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  expect(await page.locator('.search--modal .search__dialog').count()).toBe(0);
  // A host inserts a non-<dialog> element wearing the class and the open
  // attribute: close() is not a function on a div, so the sweep must
  // leave it untouched -- the real-dialog predicate keeps it invisible
  // instead of throwing and killing every later recovery pass.
  await page.evaluate(() => {
    const div = document.createElement('div');
    div.className = 'search__dialog';
    div.setAttribute('open', '');
    document.querySelector('.search--modal').appendChild(div);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  // Recovery survived: a later stray-open restore is still normalized.
  await page.evaluate(() => {
    window.__searchCache.clone.setAttribute('open', '');
    document.querySelector('.search--modal').appendChild(window.__searchCache.clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('dialog.search__dialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
});

test('a details element wearing the dialog class cannot break recovery', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    const dialog = document.querySelector('.search--modal .search__dialog');
    window.__searchCache = {clone: dialog.cloneNode(true)};
    dialog.querySelector('.search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  expect(await page.locator('.search--modal dialog.search__dialog').count()).toBe(0);
  // Unlike a div, <details> natively reflects the open attribute as a
  // truthy open PROPERTY, so a truthiness guard passes it and close()
  // still throws; only the tag-qualified selector keeps it invisible to
  // the sweep.
  await page.evaluate(() => {
    const details = document.createElement('details');
    details.className = 'search__dialog';
    details.setAttribute('open', '');
    document.querySelector('.search--modal').appendChild(details);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  // Recovery survived: a later stray-open restore is still normalized.
  await page.evaluate(() => {
    window.__searchCache.clone.setAttribute('open', '');
    document.querySelector('.search--modal').appendChild(window.__searchCache.clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('dialog.search__dialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
});

test('a stray-open restore beside the healthy owner is closed on rescan', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // The host restores an open-carrying clone into the OWNER's own root:
  // the intact branch must close the stray while exempting the record's
  // wired dialog, leaving the palette fully served.
  await page.evaluate(() => {
    const dialog = document.querySelector('.search--modal .search__dialog');
    const clone = dialog.cloneNode(true);
    clone.setAttribute('open', '');
    dialog.closest('.search--modal').appendChild(clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal .search__dialog')).toHaveCount(2);
  expect(await page.locator('.search--modal .search__dialog[open]').count()).toBe(0);
  await page.keyboard.press('Control+KeyK');
  const openDialogs = page.locator('.search--modal .search__dialog[open]');
  await expect(openDialogs).toHaveCount(1);
  expect(await openDialogs.evaluate((el) => el.matches(':modal'))).toBeTruthy();
});

test('a details element in place of the sole dialog leaves the root dialog-less', async ({
  page,
}) => {
  // A host morph swaps the fully parsed dialog for a <details> carrying
  // the same class, children, and open attribute -- before the module
  // evaluates. Wiring must not treat it as the palette (close() and
  // showModal() would throw mid-pass): the tag-qualified query leaves
  // the root dialog-less, the trigger stays hidden, and enhancement of
  // the surfaces after it proceeds untouched.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('.search--modal .search__dialog');
      if (dialog && document.querySelector('h1')) {
        const details = document.createElement('details');
        details.className = dialog.className;
        details.setAttribute('open', '');
        while (dialog.firstChild) {
          details.appendChild(dialog.firstChild);
        }
        dialog.replaceWith(details);
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  // The inline surface parses after the header modal: it enhancing
  // proves the wiring pass survived the impostor.
  await expect(page.locator('.search--inline')).toHaveClass(/search--enhanced/);
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  expect(await page.locator('dialog.search__dialog').count()).toBe(0);
  expect(await page.locator('details.search__dialog').count()).toBe(1);
});

test('a foreign-namespace dialog element cannot break recovery', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.evaluate(() => {
    const dialog = document.querySelector('.search--modal .search__dialog');
    window.__searchCache = {clone: dialog.cloneNode(true)};
    dialog.querySelector('.search__input').remove();
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  expect(await page.locator('.search--modal dialog.search__dialog').count()).toBe(0);
  // CSS type selectors are namespace-agnostic: an SVG-namespace element
  // with localName "dialog" matches dialog.search__dialog while carrying
  // neither close() nor a truthy open property, so only the real-dialog
  // predicate keeps the sweep from throwing on it.
  await page.evaluate(() => {
    const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const impostor = document.createElementNS('http://www.w3.org/2000/svg', 'dialog');
    impostor.setAttribute('class', 'search__dialog');
    impostor.setAttribute('open', '');
    holder.appendChild(impostor);
    document.querySelector('.search--modal').appendChild(holder);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  // Recovery survived: a later stray-open restore is still normalized.
  await page.evaluate(() => {
    window.__searchCache.clone.setAttribute('open', '');
    document.querySelector('.search--modal').appendChild(window.__searchCache.clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--modal > dialog.search__dialog')).not.toHaveAttribute(
    'open',
    '',
  );
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
});

test('wiring elects the real dialog past a preceding impostor', async ({page}) => {
  // An impostor wearing the class BEFORE the real dialog must not be
  // captured as the palette (its containment gate would refuse the root
  // outright); wiring walks past impostors to the first real <dialog>.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('.search--modal .search__dialog');
      if (dialog && document.querySelector('h1')) {
        const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const impostor = document.createElementNS('http://www.w3.org/2000/svg', 'dialog');
        impostor.setAttribute('class', 'search__dialog');
        holder.appendChild(impostor);
        dialog.parentNode.insertBefore(holder, dialog);
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await expect(page.locator('.search--modal .search__trigger')).toBeVisible();
  await page.keyboard.press('Control+KeyK');
  const dialog = page.locator('.search--modal > dialog.search__dialog');
  await expect(dialog).toHaveAttribute('open', '');
  await page.locator(INPUT).fill('gravity');
  await expect(page.locator('.search--modal .search__option')).toHaveCount(2);
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

test('an IME composition Enter or arrow never commits or navigates', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await page.keyboard.press('Control+KeyK');
  const input = page.locator(INPUT);
  await input.fill('gravity');
  const options = page.locator('.search--modal .search__option');
  await expect(options).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  // A composition commit-Enter (isComposing, or the legacy keyCode 229)
  // and a composition arrow belong to the IME: they must neither
  // activate the option and navigate nor move the active option.
  await page.evaluate(() => {
    const el = document.querySelector('.search--modal .search__input');
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    const legacy = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
    Object.defineProperty(legacy, 'keyCode', {value: 229});
    el.dispatchEvent(legacy);
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.waitForTimeout(200);
  expect(page.url()).not.toContain('/blog/');
  await expect(page.locator(DIALOG)).toHaveAttribute('open', '');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
});

test('a modifier-less hotkey never fires while typing, never closes from its own input', async ({
  page,
}) => {
  // Patch the modal's configured hotkey to a bare "k" before the module
  // evaluates: a hotkey with no non-typing modifier is an ordinary
  // character in a field, so it must be suppressed there -- like the
  // slash opt-in -- and keep working outside typing contexts.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const modal = document.querySelector('.search--modal');
      if (modal) {
        modal.dataset.searchHotkey = 'k';
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  await page.goto('/');
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  const dialog = page.locator(DIALOG);
  // Typing "k" into the inline surface's input is text entry, not a command.
  const inlineInput = page.locator('.search--inline .search__input');
  await inlineInput.click();
  await page.keyboard.press('k');
  await expect(inlineInput).toHaveValue('k');
  await expect(dialog).not.toHaveAttribute('open', '');
  // Outside a typing context the bare hotkey opens the palette.
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('k');
  await expect(dialog).toHaveAttribute('open', '');
  // Typing "k" into the palette's own input must not toggle it closed.
  await page.locator(INPUT).pressSequentially('k');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.locator(INPUT)).toHaveValue('k');
});

test('engines without HTMLDialogElement keep every other surface enhanced', async ({page}) => {
  // Simulate an engine that predates <dialog>: the global is absent, so
  // a bare reference in the real-dialog predicate would throw a
  // ReferenceError that kills init for the whole page. With the typeof
  // guard the modal simply never wires -- trigger hidden, GET baseline
  // -- while the inline surface enhances and searches normally.
  await page.addInitScript(() => {
    delete window.HTMLDialogElement;
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await expect(page.locator('.search--inline')).toHaveClass(/search--enhanced/);
  await expect(page.locator('.search--modal')).toHaveClass(/search--enhanced/);
  await expect(page.locator('.search--modal .search__trigger')).toBeHidden();
  await page.locator('.search--inline .search__input').fill('gravity');
  await expect(page.locator('.search--inline .search__option')).toHaveCount(2);
  expect(errors).toHaveLength(0);
});
