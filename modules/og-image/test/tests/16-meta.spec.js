/* global process */
// The module's SECOND public entry point, read out of the published HTML.
//
// og-image/meta.html is what a site with no SEO module calls, and it is the
// only part of the module whose product is markup rather than a resource. The
// fixture's head calls it on every page, so its output is in every published
// index.html -- but nothing read that markup, so the tags could have been
// absent, relative, or duplicated with every other assertion in this suite
// green.
//
// The URL is the assertion that matters most. og:image is consumed by crawlers
// that do not resolve relative paths, so a RelPermalink where a Permalink
// belongs is a card no platform ever fetches, and at a domain root the two are
// indistinguishable in every other way -- which is why the subpath build is
// read here too.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {configuredDir, baselineDir, subpathDir, records} from './helpers.js';

// Hugo writes the tree WITHOUT the base path, so a page's own URL locates its
// file only once that segment is stripped -- the same arithmetic helpers.js
// does for a card.
const html = (publicDir, url, basePath = '') => {
  const rel = basePath && url.startsWith(basePath) ? url.slice(basePath.length) : url;
  return readFileSync(join(publicDir, rel.replace(/^\//, ''), 'index.html'), 'utf8');
};

const tags = (source, attribute, name) => {
  const pattern = new RegExp(`<meta ${attribute}="${name}" content="([^"]*)">`, 'g');
  return [...source.matchAll(pattern)].map((match) => match[1]);
};

test('a carded page publishes the card as an absolute og:image, once', () => {
  const all = records(configuredDir);
  let checked = 0;
  for (const [path, rec] of all) {
    if (rec.cards.length === 0) continue;
    checked += 1;
    const source = html(configuredDir, rec.url);
    // The head calls the entry with the bare page, so the tags name the card
    // that call returns -- which for the two-card page is the first one.
    assert.deepEqual(
      tags(source, 'property', 'og:image'),
      [rec.cards[0].permalink],
      `${path}: og:image`,
    );
    assert.deepEqual(tags(source, 'property', 'og:image:width'), ['1200'], `${path}: width`);
    assert.deepEqual(tags(source, 'property', 'og:image:height'), ['630'], `${path}: height`);
    assert.deepEqual(
      tags(source, 'name', 'twitter:card'),
      ['summary_large_image'],
      `${path}: twitter:card`,
    );
    assert.ok(
      /^https:\/\/og-fixture\.example\//.test(rec.cards[0].permalink),
      `${path}: the tag carries an absolute URL, not a site-relative one`,
    );
  }
  assert.ok(checked > 40, `every carded page's head was read: ${checked}`);
});

test('a declining page publishes no image tags at all', () => {
  // The renderer has to be silent for a page with no card, not emit an empty
  // og:image: a crawler handed an empty content attribute has strictly less to
  // work with than one handed nothing.
  const all = records(configuredDir);
  let checked = 0;
  for (const [path, rec] of all) {
    if (rec.cards.length > 0) continue;
    checked += 1;
    const source = html(configuredDir, rec.url);
    assert.deepEqual(tags(source, 'property', 'og:image'), [], `${path}: no og:image`);
    assert.deepEqual(tags(source, 'name', 'twitter:card'), [], `${path}: no twitter:card`);
  }
  assert.ok(checked > 20, `every declining page's head was read: ${checked}`);
});

test('an unconfigured site publishes no image tags anywhere', () => {
  // The inert build's markup half: a module that configured nothing must add
  // nothing to the head either, not merely publish no file.
  for (const [path, rec] of records(baselineDir)) {
    const source = html(baselineDir, rec.url);
    assert.deepEqual(tags(source, 'property', 'og:image'), [], `${path}: no og:image`);
  }
});

test('under a baseURL carrying a path the tag carries that path too', () => {
  // The one build in which an absolute URL built from the wrong pieces is
  // visible: a Permalink that dropped the base path still looks like a URL.
  const all = records(subpathDir);
  let checked = 0;
  for (const [path, rec] of all) {
    if (rec.cards.length === 0) continue;
    checked += 1;
    const [tag] = tags(html(subpathDir, rec.url, '/docs'), 'property', 'og:image');
    assert.equal(tag, rec.cards[0].permalink, `${path}: og:image`);
    assert.ok(
      tag.startsWith('https://og-fixture.example/docs/og/'),
      `${path}: the tag keeps the base path: ${tag}`,
    );
  }
  assert.ok(checked > 15, `every carded page's head was read: ${checked}`);
});

test('the renderer is the module, not the fixture', () => {
  // Without this the assertions above would also pass on a fixture that wrote
  // the tags itself: the fixture's head calls exactly two partials, and the
  // recorder publishes JSON rather than markup.
  const baseof = readFileSync(
    join(process.env.FIXTURE_DIR ?? 'fixture', 'layouts', 'baseof.html'),
    'utf8',
  );
  assert.match(baseof, /partial "og-image\/meta\.html"/);
  assert.ok(!/og:image/.test(baseof), 'and writes no image tag of its own');
});
