// Validation matrix row 8: Update flow banner.
//
// Setup:    Persistent browser context with v1 SW installed.
// Action:   Trigger orchestrator-mediated fixture swap to v2; call r.update();
//           observe events.
// Expected: pwa:waiting fires (new SW waiting because v2 source bytes differ
//           from v1 source bytes). After SKIP_WAITING postMessage,
//           pwa:controlling fires.
//
// Architecture:
//   Workbox's `pwa:waiting` event (per W3C SW lifecycle) requires a previously
//   installed SW that the new SW source is being compared against. Default
//   Playwright browser contexts have no prior SW (fresh per-test isolation),
//   so this spec uses a per-test persistent userDataDir to retain v1 SW state
//   across the v1->v2 fixture transition WITHIN A SINGLE TEST INVOCATION.
//
//   The orchestrator's Pass 3 starts Hugo on the v1 fixture state. The spec
//   installs v1 SW, then writes a sentinel file that signals the orchestrator
//   to swap fixture state to v2 and restart Hugo. The spec waits for the
//   orchestrator's response sentinel, calls r.update(), and asserts the SW
//   lifecycle events.
//
//   This row depends on MATRIX_PASS3_PERSISTENT=1 (set by the orchestrator's
//   Pass 3) so that ad-hoc invocations of this spec (without the orchestrator)
//   produce a clean SKIP rather than false-failing.

const {test, expect, chromium} = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SENTINEL_TRIGGER = path.join(__dirname, '..', '.matrix-v2-trigger');
const SENTINEL_READY = path.join(__dirname, '..', '.matrix-v2-ready');

test.describe('Row 8: Update flow banner', () => {
  test('pwa:waiting and pwa:controlling fire on SW update', async () => {
    test.skip(
      !process.env.MATRIX_PASS3_PERSISTENT,
      'Requires orchestrator-driven Pass 3 (MATRIX_PASS3_PERSISTENT=1).',
    );
    test.setTimeout(120_000);

    const baseUrl = process.env.FIXTURE_URL || 'http://127.0.0.1:1313';

    // Cleanup any stale sentinels from prior runs.
    for (const s of [SENTINEL_TRIGGER, SENTINEL_READY]) {
      if (fs.existsSync(s)) fs.unlinkSync(s);
    }

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-row8-'));

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      serviceWorkers: 'allow',
      args: ['--no-sandbox'],
    });

    try {
      const page = await context.newPage();

      await page.addInitScript(() => {
        window.__pwaEvents = [];
        window.addEventListener('pwa:waiting', () => window.__pwaEvents.push('waiting'));
        window.addEventListener('pwa:controlling', () => window.__pwaEvents.push('controlling'));
      });

      // Phase 1: install v1 SW.
      await page.goto(baseUrl);
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
        null,
        {timeout: 30_000},
      );

      // Trigger orchestrator-mediated fixture swap to v2.
      fs.writeFileSync(SENTINEL_TRIGGER, '');

      // Wait for orchestrator to signal v2 is ready.
      const readyDeadline = Date.now() + 60_000;
      while (!fs.existsSync(SENTINEL_READY)) {
        if (Date.now() > readyDeadline) {
          throw new Error(
            `Orchestrator did not write ${SENTINEL_READY} within 60s. Check that ` +
              'run-matrix.{sh,cmd} Pass 3 is configured with the persistent v1->v2 watcher.',
          );
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      // Phase 2: trigger SW update.
      await page.evaluate(() =>
        navigator.serviceWorker.getRegistration().then((r) => r && r.update()),
      );

      await page.waitForFunction(
        () => Array.isArray(window.__pwaEvents) && window.__pwaEvents.includes('waiting'),
        null,
        {timeout: 30_000},
      );

      // Drive SKIP_WAITING -> controlling.
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.waiting) {
          reg.waiting.postMessage({type: 'SKIP_WAITING'});
        }
      });

      await page.waitForFunction(
        () => Array.isArray(window.__pwaEvents) && window.__pwaEvents.includes('controlling'),
        null,
        {timeout: 30_000},
      );

      const events = await page.evaluate(() => window.__pwaEvents);
      expect(events).toContain('waiting');
      expect(events).toContain('controlling');
    } finally {
      await context.close();
      try {
        fs.rmSync(userDataDir, {recursive: true, force: true});
      } catch {
        // Best-effort cleanup; OS reclaims mktemp space.
      }
      for (const s of [SENTINEL_TRIGGER, SENTINEL_READY]) {
        if (fs.existsSync(s)) {
          try {
            fs.unlinkSync(s);
          } catch {
            // Orchestrator may have already cleaned up.
          }
        }
      }
    }
  });
});
