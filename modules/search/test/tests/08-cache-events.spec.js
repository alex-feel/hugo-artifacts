// Serialized-index caching (forced on in the fixture; the write off the
// ready critical path) and the full CustomEvent contract: search:error
// with its phase, the outbound event payload walk (including the ready
// docCount's immunity to envelope claims), the inbound search:rescan
// hook (page-surface swaps, detached-root re-adoption with URL
// reconciliation and its no-change skip, and the stripped-marker
// double-wire guard), external-change timer hygiene (a same-query hop
// leaves a pending first run armed; a genuine change kills the stale
// count announcement), and index-shape resilience.
/* global document, window, caches, URL, CustomEvent, PopStateEvent, history, MutationObserver, Event */
import {test, expect} from '@playwright/test';

async function captureReady(page) {
  await page.evaluate(() => {
    window.__readies = [];
    document.addEventListener('search:ready', (event) => window.__readies.push(event.detail));
  });
}

test('first build from network, warm start from cache; compound key rides the query string', async ({
  page,
}) => {
  await page.goto('/search/');
  await captureReady(page);
  await page.locator('.search--page .search__input').focus();
  await expect.poll(() => page.evaluate(() => window.__readies.length)).toBeGreaterThan(0);
  const first = await page.evaluate(() => window.__readies[0]);
  expect(first.source).toBe('network');

  // The write runs off the ready critical path, so wait for the entry
  // to land before reloading -- reloading mid-write would race it.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await caches.open('search-index-v1');
        return (await cache.keys()).length;
      }),
    )
    .toBeGreaterThan(0);

  // The envelope is fetched on BOTH loads; source names the INDEX-BUILD
  // source, so the reload builds from the serialized cache entry.
  await page.reload();
  await captureReady(page);
  await page.locator('.search--page .search__input').focus();
  await expect.poll(() => page.evaluate(() => window.__readies.length)).toBeGreaterThan(0);
  const second = await page.evaluate(() => window.__readies[0]);
  expect(second.source).toBe('cache');

  // The discriminator rides the QUERY STRING of the stored Request URL, and
  // a mutated discriminator MISSES -- the digest/options/engine
  // invalidation mechanism.
  const info = await page.evaluate(async () => {
    const cache = await caches.open('search-index-v1');
    const keys = await cache.keys();
    const target = keys.map((request) => request.url).find((u) => u.includes('/searchindex.json'));
    const url = new URL(target);
    const discriminator = url.searchParams.get('search-cache');
    const mutated = new URL(target);
    mutated.searchParams.set('search-cache', 'deadbeef');
    const miss = await cache.match(mutated.toString());
    const hit = await cache.match(target);
    return {discriminator, missed: miss === undefined, hit: hit !== undefined};
  });
  expect(info.discriminator).toMatch(/^[0-9a-f]+$/);
  expect(info.hit).toBeTruthy();
  expect(info.missed).toBeTruthy();
});

test('event payload walk and the search:rescan inbound hook', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__events = [];
    for (const name of ['search:query', 'search:results', 'search:open', 'search:close']) {
      document.addEventListener(name, (event) =>
        window.__events.push({name, detail: event.detail}),
      );
    }
  });

  await page.locator('.search--inline .search__input').fill('gravity');
  await expect
    .poll(() => page.evaluate(() => window.__events.some((e) => e.name === 'search:results')))
    .toBeTruthy();
  const typed = await page.evaluate(() => window.__events);
  expect(typed.find((e) => e.name === 'search:query').detail).toMatchObject({
    query: 'gravity',
    surface: 'inline',
  });
  expect(typed.find((e) => e.name === 'search:results').detail).toMatchObject({
    query: 'gravity',
    count: 2,
    surface: 'inline',
  });

  await page.keyboard.press('Control+KeyK');
  await expect(page.locator('.search--modal .search__dialog')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.evaluate(() => window.__events.filter((e) => e.name === 'search:close').length),
    )
    .toBeGreaterThan(0);
  const events = await page.evaluate(() => window.__events);
  expect(events.find((e) => e.name === 'search:open').detail).toMatchObject({surface: 'modal'});
  expect(events.find((e) => e.name === 'search:close').detail).toMatchObject({surface: 'modal'});

  // search:rescan wires a late-inserted root.
  const enhancedCount = await page.evaluate(() => {
    const root = document.querySelector('.search--inline');
    const clone = root.cloneNode(true);
    clone.classList.remove('search--enhanced');
    document.body.appendChild(clone);
    document.dispatchEvent(new CustomEvent('search:rescan'));
    return document.querySelectorAll('.search--inline.search--enhanced').length;
  });
  expect(enhancedCount).toBe(2);
});

test('a failing index fetch surfaces search:error with the fetch phase', async ({page}) => {
  await page.route('**/searchindex.json*', (route) => route.fulfill({status: 404, body: ''}));
  await page.goto('/');
  await page.evaluate(() => {
    window.__errors = [];
    document.addEventListener('search:error', (event) => window.__errors.push(event.detail));
  });
  await page.locator('.search--inline .search__input').fill('gravity');
  await expect(page.locator('.search--inline')).toHaveClass(/search--error/);
  const errors = await page.evaluate(() => window.__errors);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0]).toMatchObject({phase: 'fetch'});
  await expect(page.locator('.search--inline .search__alert')).toHaveText(
    'Search is unavailable. Reload the page to try again.',
  );
});

test('a duplicate record id degrades to a skip, never a site-wide failure', async ({page}) => {
  // One duplicated href in the served index (a consumer-shadowed index
  // template without the shipped dedup) must not kill client-side
  // search: the engine drops the duplicate and serves the rest.
  await page.route('**/searchindex.json*', async (route) => {
    const response = await route.fetch();
    const env = await response.json();
    env.docs.push(env.docs.find((d) => d.href === '/blog/gravity-title/'));
    env.docCount = env.docs.length;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(env),
    });
  });
  await page.goto('/search/');
  await page.locator('.search--page .search__input').fill('gravity');
  // Two results, not three (the duplicate is skipped) and not an error
  // state (the build survived).
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  expect(await page.locator('.search--page.search--error').count()).toBe(0);
});

test('page-surface swaps never accumulate window listeners; the live root serves popstate', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__popstateRegistrations = 0;
    const original = window.addEventListener.bind(window);
    window.addEventListener = (type, ...rest) => {
      if (type === 'popstate') {
        window.__popstateRegistrations++;
      }
      return original(type, ...rest);
    };
  });
  await page.goto('/search/?q=gravity');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  // Swap the page root twice (a PJAX-style replacement) and rescan.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const root = document.querySelector('.search--page');
      const clone = root.cloneNode(true);
      clone.classList.remove('search--enhanced');
      clone.querySelector('.search__results').textContent = '';
      root.replaceWith(clone);
      document.dispatchEvent(new CustomEvent('search:rescan'));
    });
    await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(
      2,
    );
  }
  // The window listeners are singletons: three wirings, one registration.
  expect(await page.evaluate(() => window.__popstateRegistrations)).toBe(1);
  // The freshly wired root still serves external ?q= changes.
  await page.evaluate(() => {
    history.pushState(null, '', '/search/?q=beacon');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.search--page .search__input')).toHaveValue('beacon');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
});

test('a page root detached across a popstate re-adopts URL sync on rescan', async ({page}) => {
  await page.goto('/search/?q=gravity');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  // Detach the enhanced root, fire popstate while it sits outside the
  // document (the url-state registry prunes its entry), reattach the
  // SAME node, and announce it with search:rescan -- the documented
  // host contract after any DOM manipulation.
  await page.evaluate(() => {
    const root = document.querySelector('.search--page');
    const parent = root.parentNode;
    root.remove();
    history.pushState(null, '', '/search/?q=beacon');
    window.dispatchEvent(new PopStateEvent('popstate'));
    parent.appendChild(root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  // Re-adoption reconciles with the address bar immediately: the
  // navigation missed while the root was detached lands at rescan,
  // without waiting for any further event.
  await expect(page.locator('.search--page .search__input')).toHaveValue('beacon');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  // And the re-registered root serves subsequent external changes.
  await page.evaluate(() => {
    history.pushState(null, '', '/search/?q=gravity');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.search--page .search__input')).toHaveValue('gravity');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
});

test('a same-query history hop never swallows a pending first run', async ({page}) => {
  await page.goto('/search/');
  // Type, then let the URL catch up and fire popstate BEFORE the
  // debounce elapses: the no-change guard must leave the pending
  // debounce armed -- it still owes this query its FIRST run, and
  // clearing it would leave the surface silent and empty for a query
  // the input visibly shows.
  await page.evaluate(() => {
    const input = document.querySelector('.search--page .search__input');
    input.value = 'beacon';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    history.pushState(null, '', '/search/?q=beacon');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  await expect(page.locator('.search--page .search__input')).toHaveValue('beacon');
});

test('a stale count announcement never lands after an external change', async ({page}) => {
  // Virtual time (installed before load) controls every page-side
  // timer; worker messages flow in real time. The Worker subclass
  // latches 'results' replies on demand, so the second query's response
  // is provably absent while the first query's frozen 500ms count
  // announcement crosses its horizon. Time is frozen only AFTER the
  // backend is ready: a virtual-time jump while connectWorker's boot
  // timer is pending would fire it, terminate the healthy worker, and
  // silently fall back to the main thread -- where replies resolve
  // synchronously and the latch never engages.
  await page.clock.install();
  await page.addInitScript(() => {
    window.__heldResults = [];
    window.__holdResults = false;
    window.__workerMessages = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        const nativeAdd = this.addEventListener.bind(this);
        this.addEventListener = (type, listener, ...rest) => {
          if (type !== 'message') {
            nativeAdd(type, listener, ...rest);
            return;
          }
          nativeAdd(
            type,
            (event) => {
              window.__workerMessages++;
              if (window.__holdResults && event.data && event.data.type === 'results') {
                window.__heldResults.push(() => listener(event));
                return;
              }
              listener(event);
            },
            ...rest,
          );
        };
      }
    };
    window.__readies = [];
    document.addEventListener('search:ready', (event) => window.__readies.push(event.detail));
  });
  await page.goto('/search/');
  const input = page.locator('.search--page .search__input');
  await input.focus();
  await expect.poll(() => page.evaluate(() => window.__readies.length)).toBeGreaterThan(0);
  // The latch only exists in worker mode; a silent main-thread fallback
  // must fail here, loudly, not false-pass below.
  expect(await page.evaluate(() => window.__workerMessages)).toBeGreaterThan(0);
  await page.clock.pauseAt(Date.now() + 60000);
  await input.fill('gravity');
  await page.clock.runFor(250);
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  // The 500ms count announcement for gravity is now armed at frozen
  // virtual time. Hold the next results reply and hop to pharos.
  await page.evaluate(() => {
    window.__holdResults = true;
    history.pushState(null, '', '/search/?q=pharos');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.clock.runFor(600);
  // The stale gravity count must not land while pharos is pending.
  await expect(page.locator('.search--page .search__status')).not.toHaveText('2 results');
  // Release the held reply: the pharos count lands instead.
  await page.evaluate(() => {
    window.__holdResults = false;
    for (const release of window.__heldResults.splice(0)) {
      release();
    }
  });
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(1);
  await page.clock.runFor(600);
  await expect(page.locator('.search--page .search__status')).toHaveText('1 result');
});

test('a stripped enhanced marker never double-wires; rescan restores it', async ({page}) => {
  await page.goto('/search/');
  // Strip the DOM marker (a host contract violation) and rescan: the
  // module-side memory must refuse to wire a second core -- duplicate
  // element listeners would double every event and arm timers the
  // first core's guards cannot reach -- and must restore the marker.
  await page.evaluate(() => {
    window.__queries = [];
    document.addEventListener('search:query', (event) => window.__queries.push(event.detail));
    document.querySelector('.search--page').classList.remove('search--enhanced');
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--page')).toHaveClass(/search--enhanced/);
  await page.locator('.search--page .search__input').fill('beacon');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  // One wired core, one query -- a double-wired root would send two.
  const beaconQueries = await page.evaluate(() =>
    window.__queries.filter((detail) => detail.query === 'beacon'),
  );
  expect(beaconQueries).toHaveLength(1);
});

test('re-adoption skips the reconcile when nothing changed', async ({page}) => {
  await page.goto('/search/?q=gravity');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  // Prune the entry with a popstate fired while the root is detached
  // and the URL UNCHANGED, then reattach and rescan: re-adoption has
  // nothing to reconcile, so re-running the current query would only
  // repeat the render and the events.
  await page.evaluate(() => {
    window.__queries = [];
    document.addEventListener('search:query', (event) => window.__queries.push(event.detail));
    const root = document.querySelector('.search--page');
    const parent = root.parentNode;
    root.remove();
    window.dispatchEvent(new PopStateEvent('popstate'));
    parent.appendChild(root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__queries.length)).toBe(0);
  // The surface keeps its state untouched.
  await expect(page.locator('.search--page .search__input')).toHaveValue('gravity');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
});

test('reconciliation cancels a pending debounced keystroke for good', async ({page}) => {
  await page.goto('/search/?q=gravity');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
  // Start a debounced keystroke, then run the whole
  // detach/popstate/reattach/rescan burst synchronously inside the
  // debounce window: reconciliation must kill the pending timer, or the
  // orphaned timer later fires and writes the stale typed query back
  // over the URL the reconcile just applied.
  await page.evaluate(() => {
    const root = document.querySelector('.search--page');
    const input = root.querySelector('.search__input');
    input.value = 'plasma';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    const parent = root.parentNode;
    root.remove();
    history.pushState(null, '', '/search/?q=beacon');
    window.dispatchEvent(new PopStateEvent('popstate'));
    parent.appendChild(root);
    document.dispatchEvent(new CustomEvent('search:rescan'));
  });
  await expect(page.locator('.search--page .search__input')).toHaveValue('beacon');
  // Outwait the debounce residue (220ms default) with margin: the URL
  // and the input must both keep the reconciled query.
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => new URL(window.location.href).searchParams.get('q'))).toBe(
    'beacon',
  );
  await expect(page.locator('.search--page .search__input')).toHaveValue('beacon');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
});

test('search:ready docCount reports the engine count, immune to envelope claims', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__readies = [];
    document.addEventListener('search:ready', (event) => window.__readies.push(event.detail));
  });
  await page.goto('/search/');
  await page.locator('.search--page .search__input').focus();
  await expect.poll(() => page.evaluate(() => window.__readies.length)).toBeGreaterThan(0);
  const healthy = await page.evaluate(() => window.__readies[0]);
  expect(healthy.source).toBe('network');
  // Serve a tampered envelope: one duplicated heading-carrying record,
  // an inflated docCount claim, and a flipped digest so the
  // serialized-index cache written by the healthy load misses and the
  // engine truly rebuilds from the tampered docs.
  await page.route('**/searchindex.json*', async (route) => {
    const response = await route.fetch();
    const env = await response.json();
    env.docs.push(env.docs.find((d) => d.href === '/blog/quantum-notes/'));
    env.docCount = 999;
    env.digest = (env.digest[0] === '0' ? '1' : '0') + env.digest.slice(1);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(env),
    });
  });
  await page.reload();
  await page.locator('.search--page .search__input').focus();
  await expect.poll(() => page.evaluate(() => window.__readies.length)).toBeGreaterThan(0);
  const tampered = await page.evaluate(() => window.__readies[0]);
  expect(tampered.source).toBe('network');
  // The engine skipped the duplicate AND its expanded heading children
  // (quantum-notes carries three), so the truthful count equals the
  // healthy build's -- never the claimed 999.
  expect(tampered.docCount).toBe(healthy.docCount);
});

test('a hung cache write never blocks the ready reply', async ({page}) => {
  // Force the main-thread backend (the page realm's caches stub cannot
  // reach a worker's) and stub Cache Storage so match misses and put
  // parks forever: the engine is fully built by write time, so ready
  // must arrive regardless.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const root = document.querySelector('.search--page');
      if (root) {
        const options = JSON.parse(root.dataset.searchOptions);
        options.worker = false;
        root.dataset.searchOptions = JSON.stringify(options);
        observer.disconnect();
      }
    });
    observer.observe(document, {childList: true, subtree: true});
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        open: async () => ({
          match: async () => undefined,
          put: () => new Promise(() => {}),
          keys: async () => [],
          delete: async () => true,
        }),
      },
    });
    window.__readies = [];
    document.addEventListener('search:ready', (event) => window.__readies.push(event.detail));
  });
  await page.goto('/search/');
  await page.locator('.search--page .search__input').focus();
  await expect.poll(() => page.evaluate(() => window.__readies.length)).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.__readies[0])).source).toBe('network');
  // The built engine serves queries while the write sits parked.
  await page.locator('.search--page .search__input').fill('gravity');
  await expect(page.locator('.search--page .search__results .search__result-link')).toHaveCount(2);
});
