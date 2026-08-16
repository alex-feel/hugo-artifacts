// A site that imports the module and configures nothing.
//
// This is the only build in which [params.ogcard] is absent altogether, and
// it is the only one that can tell "the module works" from "the module is
// always on". A TOML overlay can add a table but never delete one, which is
// why the unconfigured state has to be the default environment and every
// working configuration lives in an environment of its own.
//
// Two halves. Nothing is composed, published or drawn -- an imported module
// that quietly started stamping a backdrop onto every page would be worse
// than one that does nothing. And the consumer is told once, at build scope,
// that no card can be produced: every per-page decline is silent by contract,
// so without that one line the site has no signal at all.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync} from 'node:fs';
import {join, relative} from 'node:path';
import {baselineDir, fixtureDir, records, moduleWarnings} from './helpers.js';

const strip = (line) => line.replace(/^\[og-image\] /, '');

test('no page anywhere received a card', () => {
  const all = records(baselineDir);
  assert.ok(all.size > 40, 'the site still built in full');
  for (const [path, rec] of all) {
    assert.deepEqual(rec.cards, [], `${path} received a card from an unconfigured module`);
  }
});

// The images the fixture COMMITS inside a page bundle. Hugo publishes a page
// resource whatever this module does, so they are the one thing a tree with no
// cards legitimately contains -- enumerated from the content directory rather
// than listed by hand, so a bundle added later cannot quietly widen the
// allowance.
function bundledImages() {
  const root = join(fixtureDir, 'content');
  const out = new Set();
  for (const entry of readdirSync(root, {recursive: true, withFileTypes: true})) {
    if (!entry.isFile()) continue;
    if (!/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) continue;
    out.add(relative(root, join(entry.parentPath, entry.name)).split('\\').join('/'));
  }
  return out;
}

test('and no card was published either, composed-then-discarded included', () => {
  // Reading the tree rather than the records: a card composed and dropped on
  // the way back still lands in public/, still costs the build, and would not
  // show up in a page's record at all.
  assert.ok(!existsSync(join(baselineDir, 'og')), 'no derivative directory was created');
  const bundled = bundledImages();
  assert.ok(bundled.size > 0, 'the fixture really does commit a page-bundle image');
  const stray = [];
  for (const entry of readdirSync(baselineDir, {recursive: true, withFileTypes: true})) {
    if (!entry.isFile()) continue;
    if (!/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) continue;
    const rel = relative(baselineDir, join(entry.parentPath, entry.name)).split('\\').join('/');
    if (bundled.has(rel)) continue;
    stray.push(rel);
  }
  assert.deepEqual(stray, [], 'image files in a tree that configured no cards');
});

test('the module still resolves its shipped mechanical defaults', () => {
  // Inert is not the same as absent: the options a page resolves with no
  // configuration at all are the ones data/og-image/defaults.toml ships, which
  // is what a site sees the moment it adds a template.
  const rec = records(baselineDir).get('/blog/short');
  assert.deepEqual(rec.opts, {
    enable: true,
    width: 1200,
    height: 630,
    format: 'png',
    quality: 75,
    anchor: 'Center',
    template: '',
    default_template: '',
    variant: '',
  });
});

test('the consumer is told once that nothing can be carded', () => {
  const lines = moduleWarnings('baseline').map(strip);
  const unconfigured = lines.filter((line) =>
    /^No params\.ogcard configuration was found/.test(line),
  );
  assert.ok(unconfigured.length >= 1, 'the missing configuration is named');
  assert.match(unconfigured[0], /language "en"/, 'and named per language');
  assert.match(unconfigured[0], /params\.ogcard\.templates/, 'and says what to define');
});

test('nothing else is reported except the templates the content asks for by name', () => {
  // The per-page decline is silent by contract, so the only other diagnostics
  // a site can earn here are the ones it asked for: four fixture pages name a
  // card template in their front matter, and on a site that defines none each
  // of those names is a supplied value nothing answers. Keyed by origin and
  // name, so four names produce four separate reports rather than one.
  const lines = moduleWarnings('baseline').map(strip);
  const expected = [
    /^No params\.ogcard configuration was found/,
    /^ogcard\.template names the card template "home"/,
    /^ogcard\.template names the card template "otf"/,
    /^ogcard\.template names the card template "plain"/,
    /^ogcard\.template names the card template "wrongsize"/,
  ];
  for (const pattern of expected) {
    assert.ok(
      lines.some((line) => pattern.test(line)),
      `missing: ${pattern}`,
    );
  }
  const unmatched = lines.filter((line) => !expected.some((pattern) => pattern.test(line)));
  assert.deepEqual([...new Set(unmatched)], [], 'diagnostics an unconfigured site should not earn');
});
