#!/usr/bin/env node
// Subpath (baseURL with a path) build check.
//
// Hugo's relURL/absURL resolve a value that already starts with "/" against the
// protocol and host ONLY, DISCARDING the baseURL's path. Every path this module
// ships defaults to that leading-slash form (sw_path, sw_scope, the manifest
// scope/start_url/id, every favicon and icon path), so emitting them verbatim
// publishes the worker at /docs/sw.js while registering /sw.js, and points every
// icon outside the site. The module now normalizes them through
// pwa/lib/absolute-url.html; this script is the regression barrier for that.
//
// A ROOT baseURL cannot tell a correct implementation from a broken one -- both
// emit "/sw.js" -- which is exactly why the defect survived. So every pass here
// is run TWICE: once under a path-carrying baseURL, asserting every emitted URL
// carries that path and resolves to a file the build actually published, and
// once under a root baseURL, asserting the values stay exactly what they were
// (no double-prefixing, no change for the overwhelming majority of consumers).
//
// The fixture's own hugo.toml leaves about half of the module's normalization
// call sites on their shipped defaults, and a call site that never runs cannot
// regress visibly. ../subpath.toml is the overlay that turns them on -- legacy
// favicons and their prefix, the rfg-static manifest href, an explicit icons[]
// list with off-site entries, extra precache URLs, SW bypass URLs, the offline
// fallback image, the push badge, and a distinctive push click target -- so the
// four passes below are: fixture at a subpath, fixture at the root, overlay at
// a subpath, overlay at the root.
//
// TWO TRAPS THIS FILE HAS TO KEEP AVOIDING:
//   - A value whose normalized spelling ALREADY appears in the artifact for
//     another reason cannot be asserted by containment. The homepage precache
//     entry puts url:"/docs/" in sw.js, so a `sw.includes('"/docs/"')` check on
//     the default push click URL passes whether or not that URL is normalized.
//     Every value asserted here is therefore configured to a spelling nothing
//     else in the build emits.
//   - A value emitted by TWO call sites (the offline fallback image is both
//     precached and handed to the SW catch handler) still passes a presence
//     check when only one of them regresses. So every presence check in a
//     subpath pass is paired with an assertion that the UN-PREFIXED spelling is
//     absent, which is what actually bites.
//
// It uses one-shot `hugo` builds (no dev server), so it is safe to run outside
// the Playwright matrix without port/lock contention.
//
// Usage:
//   node scripts/subpath-check.js
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
const SUBPATH_BASE_URL = 'https://example.org/docs/';
const SUBPATH = '/docs';
const ROOT_BASE_URL = 'https://example.org/';
// Merged AFTER hugo.toml, and resolved relative to the fixture directory the
// build runs in. Neither overlay carries a baseURL of its own, so the feature
// overlay serves both the subpath and the root pass from one file.
const FEATURE_CONFIG = 'hugo.toml,../subpath.toml';
const CANONIFY_CONFIG = 'hugo.toml,../canonify.toml';
const OFFLINE_OFF_CONFIG = 'hugo.toml,../offline-off.toml';

const failures = [];
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures.push(label);
  }
}

function build(label, baseURL, config) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-subpath-'));
  const base = baseURL === ROOT_BASE_URL ? '' : SUBPATH;
  const args = ['--gc', '--logLevel', 'error', '-b', baseURL, '-d', outDir];
  if (config) {
    args.push('--config', config);
  }
  try {
    execFileSync('hugo', args, {cwd: FIXTURE_DIR, stdio: ['ignore', 'ignore', 'pipe']});
  } catch (err) {
    console.error(`subpath-check: ERROR building "${label}": ${err.stderr || err.message}`);
    process.exit(1);
  }
  const read = (rel) => {
    const p = path.join(outDir, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  };
  // A published URL maps to a file under outDir once the baseURL's path prefix
  // is removed: that mapping IS the invariant the whole check is about.
  const publishes = (url) => {
    if (typeof url !== 'string' || !url.startsWith('/')) {
      return false;
    }
    let rel = url.split(/[?#]/)[0];
    if (base !== '' ) {
      if (!rel.startsWith(`${base}/`)) {
        return false;
      }
      rel = rel.slice(base.length);
    }
    if (rel.endsWith('/')) {
      rel += 'index.html';
    }
    return fs.existsSync(path.join(outDir, rel));
  };
  // The register / push / install bundles are fingerprinted, so they are found
  // by prefix rather than by exact name.
  const bundle = (name) => {
    const dir = path.join(outDir, 'pwa');
    if (!fs.existsSync(dir)) {
      return '';
    }
    const file = fs.readdirSync(dir).find((f) => f.startsWith(`${name}.`) && f.endsWith('.js'));
    return file ? fs.readFileSync(path.join(dir, file), 'utf8') : '';
  };
  let manifest = null;
  const rawManifest = read('manifest.webmanifest');
  if (rawManifest !== null) {
    try {
      manifest = JSON.parse(rawManifest);
    } catch {
      manifest = null;
    }
  }
  return {
    label,
    outDir,
    base,
    read,
    publishes,
    bundle,
    manifest,
    index: read('index.html') || '',
    sw: read('sw.js') || '',
    // The site-relative spelling every asserted value must have in this pass.
    at: (url) => `${base}${url}`,
    // A quoted needle: the JS bundles are minified, so a bare substring would
    // also match the tail of a longer URL.
    quoted: (url) => `"${base}${url}"`,
    // Only meaningful under a path-carrying baseURL, where the un-prefixed
    // spelling is precisely the defect. At the root it IS the correct output.
    unprefixed: (url) => `"${url}"`,
    isSubpath: base !== '',
  };
}

function precacheUrls(b) {
  return [...b.sw.matchAll(/url:"([^"]*)"/g)].map((m) => m[1]);
}

function linkHrefs(b) {
  return [...b.index.matchAll(/<link[^>]*href="([^"]*)"/g)].map((m) => m[1]);
}

function metaContent(b, name) {
  const m = b.index.match(new RegExp(`<meta name="${name}" content="([^"]*)"`));
  return m ? m[1] : null;
}

// Asserts the values the SW bundle carries. Every one is paired with an
// un-prefixed-absent assertion under a subpath baseURL, because several of
// them reach sw.js from two independent call sites.
function checkSwValue(b, label, url) {
  check(`${b.label}: ${label} is "${b.at(url)}"`, b.sw.includes(b.quoted(url)));
  if (b.isSubpath) {
    check(
      `${b.label}: ${label} does NOT appear un-prefixed as "${url}"`,
      !b.sw.includes(b.unprefixed(url)),
    );
  }
}

// ---------------------------------------------------------------------------
// The fixture's own config: the module's shipped defaults, plus push.
// ---------------------------------------------------------------------------
function checkFixture(b) {
  console.log(`subpath-check: fixture, baseURL ${b.base === '' ? ROOT_BASE_URL : SUBPATH_BASE_URL}`);
  const register = b.bundle('register');
  const push = b.bundle('push');

  // Service worker: the registered script URL and its scope must carry the
  // path, and the registered URL must be where the build put the worker.
  check(`${b.label}: register bundle registers "${b.at('/sw.js')}"`, register.includes(b.quoted('/sw.js')));
  if (b.isSubpath) {
    check(
      `${b.label}: register bundle does NOT register the un-prefixed "/sw.js"`,
      !register.includes('"/sw.js"'),
    );
  }
  check(`${b.label}: the registered worker URL is a published file`, b.publishes(b.at('/sw.js')));
  check(`${b.label}: registration scope is "${b.at('/')}"`, register.includes(b.quoted('/')));

  // Manifest: scope, start_url, and id carry the path; start_url is a real page.
  check(`${b.label}: manifest.webmanifest is published`, b.manifest !== null);
  check(`${b.label}: manifest scope is "${b.at('/')}"`, !!b.manifest && b.manifest.scope === b.at('/'));
  check(`${b.label}: manifest start_url is "${b.at('/')}"`, !!b.manifest && b.manifest.start_url === b.at('/'));
  check(`${b.label}: manifest start_url is a published page`, !!b.manifest && b.publishes(b.manifest.start_url));
  check(`${b.label}: manifest id is "${b.at('/')}"`, !!b.manifest && b.manifest.id === b.at('/'));

  // Derived manifest icons: every src carries the path AND is published.
  const icons = (b.manifest && b.manifest.icons) || [];
  check(`${b.label}: manifest icons[] is non-empty`, icons.length > 0);
  check(
    `${b.label}: every derived icon src is "${b.at('/...')}"`,
    icons.length > 0 && icons.every((i) => typeof i.src === 'string' && i.src.startsWith(`${b.at('/')}web-app-manifest-`)),
  );
  check(
    `${b.label}: every derived icon src is a published file`,
    icons.length > 0 && icons.every((i) => b.publishes(i.src)),
  );

  // Head: the manifest link and the modern favicon set carry the path.
  const hrefs = linkHrefs(b);
  check(`${b.label}: <link> hrefs were found`, hrefs.length > 0);
  check(
    `${b.label}: every <link> href carries the baseURL path`,
    hrefs.length > 0 && hrefs.every((h) => h.startsWith(`${b.at('/')}`)),
  );
  check(
    `${b.label}: every <link> href is a published file`,
    hrefs.length > 0 && hrefs.every((h) => b.publishes(h)),
  );

  // Precache: an entry that 404s fails Workbox's atomic install outright.
  const precache = precacheUrls(b);
  check(`${b.label}: precache list is non-empty`, precache.length > 0);
  check(
    `${b.label}: every precache URL carries the baseURL path`,
    precache.length > 0 && precache.every((u) => u.startsWith(`${b.at('/')}`)),
  );
  check(
    `${b.label}: every precache URL is a published file`,
    precache.length > 0 && precache.every((u) => b.publishes(u)),
  );

  // The offline URL the catch handler looks up with matchPrecache. It has to
  // be the same spelling the precache entry above carries, or the fallback
  // misses and an offline visitor gets the browser's error page.
  checkSwValue(b, 'offline fallback URL', '/offline/');
  check(`${b.label}: the offline fallback URL is a published page`, b.publishes(b.at('/offline/')));

  // Push assets handed to the worker resolve from the origin, so they carry the
  // path too. The fixture enables push, so the icon is present.
  checkSwValue(b, 'push notification icon', '/web-app-manifest-192x192.png');

  // The push bundle's own endpoints. push.ts fetches them same-origin, so a
  // leading-slash value that keeps the domain root posts to the wrong place.
  check(`${b.label}: push bundle subscribes to "${b.at('/__mock_subscribe')}"`, push.includes(b.quoted('/__mock_subscribe')));
  check(`${b.label}: push bundle unsubscribes at "${b.at('/__mock_unsubscribe')}"`, push.includes(b.quoted('/__mock_unsubscribe')));
  if (b.isSubpath) {
    check(
      `${b.label}: push bundle does NOT carry the un-prefixed "/__mock_subscribe"`,
      !push.includes('"/__mock_subscribe"'),
    );
    check(
      `${b.label}: push bundle does NOT carry the un-prefixed "/__mock_unsubscribe"`,
      !push.includes('"/__mock_unsubscribe"'),
    );
  }
}

// ---------------------------------------------------------------------------
// The ../subpath.toml overlay: the call sites the fixture defaults never reach.
// ---------------------------------------------------------------------------
function checkOverlay(b) {
  console.log(`subpath-check: overlay, baseURL ${b.base === '' ? ROOT_BASE_URL : SUBPATH_BASE_URL}`);

  // Legacy favicon set: seven hrefs plus the Microsoft tile meta, each composed
  // as favicon.prefix + the configured path before normalization.
  const hrefs = linkHrefs(b);
  const expectedHrefs = [
    '/site.webmanifest',
    '/icons/apple-touch-icon.png',
    '/icons/favicon-32x32.png',
    '/icons/favicon-16x16.png',
    '/icons/favicon.ico',
    '/icons/favicon.svg',
    '/icons/safari-pinned-tab.svg',
  ].map((u) => b.at(u));
  check(
    `${b.label}: legacy <head> emits exactly the prefixed href set`,
    JSON.stringify(hrefs) === JSON.stringify(expectedHrefs),
  );
  check(
    `${b.label}: every legacy <link> href is a published file`,
    hrefs.length > 0 && hrefs.every((h) => b.publishes(h)),
  );
  const msconfig = metaContent(b, 'msapplication-config');
  check(`${b.label}: msapplication-config is "${b.at('/icons/browserconfig.xml')}"`, msconfig === b.at('/icons/browserconfig.xml'));
  check(`${b.label}: msapplication-config points at a published file`, b.publishes(msconfig));

  // Explicit manifest icons[]: the first is site-relative, the next two are the
  // documented off-site escape hatch and must survive byte-for-byte, and the
  // last has no src -- normalizing it would ADD an empty src the consumer never
  // wrote, which reads as "an image at the site root" rather than "no image".
  const icons = (b.manifest && b.manifest.icons) || [];
  check(`${b.label}: explicit icons[] has all four entries`, icons.length === 4);
  check(
    `${b.label}: explicit site-relative icon src is "${b.at('/web-app-manifest-192x192.png')}"`,
    icons.length === 4 && icons[0].src === b.at('/web-app-manifest-192x192.png'),
  );
  check(
    `${b.label}: explicit site-relative icon src is a published file`,
    icons.length === 4 && b.publishes(icons[0].src),
  );
  check(
    `${b.label}: an icon src carrying its own scheme passes through untouched`,
    icons.length === 4 && icons[1].src === 'https://cdn.example.com/icon-512x512.png',
  );
  check(
    `${b.label}: a protocol-relative icon src passes through untouched`,
    icons.length === 4 && icons[2].src === '//cdn.example.com/icon-maskable.png',
  );
  check(
    `${b.label}: an entry with no src keeps having no src`,
    icons.length === 4 && !Object.prototype.hasOwnProperty.call(icons[3], 'src'),
  );
  check(
    `${b.label}: an entry with no src keeps the keys it does have`,
    icons.length === 4 && icons[3].sizes === '48x48',
  );

  // rfg-static manifest href: emitted by manifest.html into <head> (covered by
  // the href set above) and by precache-list.html into the precache list.
  const precache = precacheUrls(b);
  check(
    `${b.label}: precache carries the rfg-static manifest "${b.at('/site.webmanifest')}"`,
    precache.includes(b.at('/site.webmanifest')),
  );
  check(
    `${b.label}: every precache URL carries the baseURL path`,
    precache.length > 0 && precache.every((u) => u.startsWith(`${b.at('/')}`)),
  );
  check(
    `${b.label}: every precache URL is a published file`,
    precache.length > 0 && precache.every((u) => b.publishes(u)),
  );

  // extra_urls, and the deduplication that keeps Workbox's atomic install
  // alive: "/about/" is named twice here AND contributed by recent pages, so a
  // dedupe that stopped working would leave three copies.
  check(
    `${b.label}: precache carries the extra URL "${b.at('/blog/')}"`,
    precache.includes(b.at('/blog/')),
  );
  check(
    `${b.label}: the thrice-named "${b.at('/about/')}" is precached exactly once`,
    precache.filter((u) => u === b.at('/about/')).length === 1,
  );
  check(
    `${b.label}: precache list has no duplicate URLs (Workbox rejects conflicting entries)`,
    new Set(precache).size === precache.length,
  );

  // SW runtime values. Each is configured to a spelling nothing else emits.
  checkSwValue(b, 'SW bypass URL', '/api/status');
  check(
    `${b.label}: an off-site bypass URL passes through untouched`,
    b.sw.includes('"https://analytics.example.com/collect"'),
  );
  checkSwValue(b, 'offline fallback image', '/offline-fallback.png');
  checkSwValue(b, 'push notification badge', '/badge-72x72.png');
  checkSwValue(b, 'push default click URL', '/blog/post-2/?source=push');
  check(
    `${b.label}: the offline fallback image is a published file`,
    b.publishes(b.at('/offline-fallback.png')),
  );
  check(
    `${b.label}: the push notification badge is a published file`,
    b.publishes(b.at('/badge-72x72.png')),
  );
}

// ---------------------------------------------------------------------------
// canonifyURLs = true: the setting that silently disarms a relURL-based
// normalization. See ../canonify.toml for why, and why there is no root
// counterpart. Hugo rewrites rendered HTML to absolute URLs under this setting
// -- that is the setting working as documented -- so this pass asserts the
// artifacts Hugo leaves alone, which are exactly the ones a broken
// normalization takes down: the manifest, the worker, and the JS bundles.
// ---------------------------------------------------------------------------
function checkCanonify(b) {
  console.log(`subpath-check: canonifyURLs, baseURL ${SUBPATH_BASE_URL}`);
  const register = b.bundle('register');
  const push = b.bundle('push');

  check(
    `${b.label}: register bundle still registers "${b.at('/sw.js')}"`,
    register.includes(b.quoted('/sw.js')),
  );
  check(
    `${b.label}: register bundle does NOT register the un-prefixed "/sw.js"`,
    !register.includes('"/sw.js"'),
  );
  check(`${b.label}: the registered worker URL is a published file`, b.publishes(b.at('/sw.js')));
  check(
    `${b.label}: registration scope is still "${b.at('/')}"`,
    register.includes(b.quoted('/')),
  );

  check(`${b.label}: manifest scope is still "${b.at('/')}"`, !!b.manifest && b.manifest.scope === b.at('/'));
  check(
    `${b.label}: manifest start_url is still "${b.at('/')}"`,
    !!b.manifest && b.manifest.start_url === b.at('/'),
  );
  check(`${b.label}: manifest id is still "${b.at('/')}"`, !!b.manifest && b.manifest.id === b.at('/'));
  const icons = (b.manifest && b.manifest.icons) || [];
  check(
    `${b.label}: every icon src still carries the baseURL path and is published`,
    icons.length > 0 &&
      icons.every((i) => typeof i.src === 'string' && i.src.startsWith(`${b.at('/')}`)) &&
      icons.every((i) => b.publishes(i.src)),
  );

  const precache = precacheUrls(b);
  check(
    `${b.label}: every precache URL still carries the baseURL path and is published`,
    precache.length > 0 &&
      precache.every((u) => u.startsWith(`${b.at('/')}`)) &&
      precache.every((u) => b.publishes(u)),
  );
  checkSwValue(b, 'offline fallback URL', '/offline/');
  checkSwValue(b, 'push notification icon', '/web-app-manifest-192x192.png');
  check(
    `${b.label}: push bundle still subscribes to "${b.at('/__mock_subscribe')}"`,
    push.includes(b.quoted('/__mock_subscribe')),
  );
  check(
    `${b.label}: push bundle does NOT carry the un-prefixed "/__mock_subscribe"`,
    !push.includes('"/__mock_subscribe"'),
  );
}

// The offline fallback URL is resolved TWICE in service-worker.html: once from
// the configured fallback_url through pwa/lib/absolute-url.html, and then
// again from the resolved Page through pwa/lib/resource-url.html when
// site.GetPage finds it. The module's content adapter publishes /offline/
// whenever the fallback is enabled, so in every pass above the second
// resolution overwrites the first and reverting the first one changes no
// published byte. This pass turns the fallback off so the adapter skips the
// page, site.GetPage misses, and the FIRST resolution is what reaches sw.js --
// the same branch a consumer reaches by shipping their own root
// content/_content.gotmpl, which the module README documents and which this
// fixture cannot express through configuration.
function checkOfflineOff(b) {
  console.log(`subpath-check: offline fallback disabled, baseURL ${SUBPATH_BASE_URL}`);
  check(
    `${b.label}: the offline page is NOT published, so site.GetPage misses`,
    !b.publishes(b.at('/offline/')),
  );
  checkSwValue(b, 'the unresolved offline fallback URL', '/offline/');
}

const builds = [
  build('subpath', SUBPATH_BASE_URL, null),
  build('root', ROOT_BASE_URL, null),
  build('overlay-subpath', SUBPATH_BASE_URL, FEATURE_CONFIG),
  build('overlay-root', ROOT_BASE_URL, FEATURE_CONFIG),
  build('canonify-subpath', SUBPATH_BASE_URL, CANONIFY_CONFIG),
  build('offline-off-subpath', SUBPATH_BASE_URL, OFFLINE_OFF_CONFIG),
];

checkFixture(builds[0]);
checkFixture(builds[1]);
checkOverlay(builds[2]);
checkOverlay(builds[3]);
checkCanonify(builds[4]);
checkOfflineOff(builds[5]);

for (const b of builds) {
  fs.rmSync(b.outDir, {recursive: true, force: true});
}

if (failures.length === 0) {
  console.log('subpath-check: PASS -- every emitted URL carries the baseURL path');
  process.exit(0);
}
console.error(`subpath-check: FAIL -- ${failures.length} assertion(s) failed`);
process.exit(1);
