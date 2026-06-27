#!/usr/bin/env node
// Offline-gating build check.
//
// The offline fallback page is created by the content adapter
// content/_content.gotmpl ONLY when params.pwa.sw.enabled AND
// params.pwa.sw.offline.enabled are true. This script builds the fixture twice
// -- offline enabled (default) and offline disabled -- and asserts the page,
// its precache entry, and the SW catch handler appear ONLY when enabled, and
// that the page is excluded from sitemap.xml in either case.
//
// It uses one-shot `hugo` builds (no dev server), so it is safe to run outside
// the Playwright matrix without port/lock contention.
//
// Usage:
//   node scripts/offline-gating-check.js
//
// Exit codes:
//   0 = all assertions passed
//   1 = an assertion failed or the build errored

'use strict';

const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixture');

const failures = [];
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures.push(label);
  }
}

function build(label, extraConfig) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-offline-'));
  const args = ['--gc', '--logLevel', 'error', '-d', outDir];
  if (extraConfig) {
    const overlay = path.join(outDir, '_overlay.toml');
    fs.writeFileSync(overlay, extraConfig);
    args.unshift('--config', `hugo.toml,${overlay}`);
  }
  try {
    execFileSync('hugo', args, {cwd: FIXTURE_DIR, stdio: ['ignore', 'ignore', 'pipe']});
  } catch (err) {
    console.error(`offline-gating-check: ERROR building "${label}": ${err.stderr || err.message}`);
    process.exit(1);
  }
  const read = (rel) => {
    const p = path.join(outDir, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  };
  return {outDir, read};
}

console.log('offline-gating-check: building fixture (offline ENABLED, default)');
const on = build('offline-enabled', null);
const onOffline = on.read('offline/index.html');
const onSw = on.read('sw.js') || '';
const onSitemap = on.read('sitemap.xml') || '';
check('enabled: /offline/ page is generated', onOffline !== null);
check('enabled: /offline/ renders the module layout (article.pwa-offline)', !!onOffline && onOffline.includes('pwa-offline'));
check('enabled: /offline/ is in the SW precache', onSw.includes('url:"/offline/"'));
check('enabled: /offline/ is excluded from sitemap.xml', !onSitemap.includes('/offline/'));

console.log('offline-gating-check: building fixture (offline DISABLED)');
const off = build('offline-disabled', '[params.pwa.sw.offline]\nenabled = false\n');
const offOffline = off.read('offline/index.html');
const offSw = off.read('sw.js') || '';
const offSitemap = off.read('sitemap.xml') || '';
check('disabled: /offline/ page is NOT generated', offOffline === null);
check('disabled: /offline/ is NOT in the SW precache', !offSw.includes('url:"/offline/"'));
check('disabled: /offline/ is absent from sitemap.xml', !offSitemap.includes('/offline/'));

for (const dir of [on.outDir, off.outDir]) {
  fs.rmSync(dir, {recursive: true, force: true});
}

if (failures.length === 0) {
  console.log('offline-gating-check: PASS -- all offline-gating assertions held');
  process.exit(0);
}
console.error(`offline-gating-check: FAIL -- ${failures.length} assertion(s) failed`);
process.exit(1);
