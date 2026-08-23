// The `subpath` environment rebuilt with canonifyURLs on.
//
// That setting has Hugo absolutize root-relative URLs in HTML output after
// the templates have run, and to stop the rewrite from doubling the baseURL
// path it makes the whole Page family stop emitting the path in the first
// place. Measured at v0.164.0 under baseURL https://og-fixture.example/docs/:
// a page's .RelPermalink comes back as "/blog/short/" rather than
// "/docs/blog/short/". A RESOURCE's .RelPermalink is untouched, and so is
// every .Permalink.
//
// This module publishes its card URL off the processed image RESOURCE and
// states it absolutely, so both families it uses are unaffected and the two
// builds must agree exactly. That is what these assertions lock. What they
// would catch is a card URL that began routing through the relURL family: it
// would still read correctly wherever it rode an href, because the
// post-processor repairs those, and it would be wrong and PERMANENT where
// this module actually puts it -- og:image and twitter:image are meta content
// attributes, which the post-processor does not touch.
//
// The subject that makes the agreement assertable is the fixture's own
// payload sidecar. Its `url` field is the PAGE's .RelPermalink, so it moves
// under this setting while every module-derived URL in the same file must
// not. Without a value that moves, "the two builds agree" would pass just as
// well against two ordinary builds with the setting never applied.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {subpathDir, subpathCanonifyDir, records, cardExists} from './helpers.js';

const BASE_PATH = '/docs';
const SITE = 'https://og-fixture.example';

// Hugo writes the tree WITHOUT the base path, so a page's own URL locates its
// file only once that segment is stripped.
const html = (publicDir, url, basePath = '') => {
  const rel = basePath && url.startsWith(basePath) ? url.slice(basePath.length) : url;
  return readFileSync(join(publicDir, rel.replace(/^\//, ''), 'index.html'), 'utf8');
};

const metaTags = (source, attribute, name) => {
  const pattern = new RegExp(`<meta ${attribute}="${name}" content="([^"]*)">`, 'g');
  return [...source.matchAll(pattern)].map((match) => match[1]);
};

test('canonifyURLs is really on in this build, and off in its twin', () => {
  // The control. The fixture writes the page's own .RelPermalink into every
  // payload, which is exactly the family the setting moves, so comparing the
  // two builds' page URLs proves the overlay took effect -- and proves it
  // from the module's own output directory rather than from the config.
  const off = records(subpathDir);
  const on = records(subpathCanonifyDir);
  assert.ok(off.size > 10, `the subpath build published a card set: ${off.size}`);
  assert.equal(on.size, off.size, 'both builds publish the same page set');

  let moved = 0;
  for (const [path, rec] of off) {
    const twin = on.get(path);
    assert.ok(twin, `${path} is present in both builds`);
    assert.ok(rec.url.startsWith(`${BASE_PATH}/`), `${path}: the page URL carries the base path`);
    assert.equal(
      twin.url,
      rec.url.slice(BASE_PATH.length),
      `${path}: with canonifyURLs on the page URL must lose exactly the base path`,
    );
    moved += 1;
  }
  assert.ok(moved > 10, `the whole page set was compared: ${moved}`);
});

test('every card URL is identical with the setting on and off', () => {
  // The contract itself, stated as equality rather than as a shape, because a
  // shape check cannot tell a URL that kept the base path from one that had it
  // prepended to a value already carrying it.
  const off = records(subpathDir);
  const on = records(subpathCanonifyDir);
  let cards = 0;
  for (const [path, rec] of off) {
    const twin = on.get(path);
    assert.deepEqual(
      twin.cards.map((c) => [c.url, c.permalink]),
      rec.cards.map((c) => [c.url, c.permalink]),
      `${path}: the card URLs must not depend on canonifyURLs`,
    );
    cards += rec.cards.length;
  }
  assert.ok(cards >= 15, `the whole card set was compared: ${cards}`);
});

test('and every one of them still names a file that is really there', () => {
  // Equality with the other build would also be satisfied if BOTH lost the
  // path, so the URLs are resolved against this build's own tree as well.
  const all = records(subpathCanonifyDir);
  let checked = 0;
  for (const [path, rec] of all) {
    for (const card of rec.cards) {
      assert.ok(card.url.startsWith(`${BASE_PATH}/`), `${path}: ${card.url} lost the base path`);
      assert.equal(
        card.url.split(`${BASE_PATH}/`).length - 1,
        1,
        `${path}: ${card.url} repeats the base path`,
      );
      assert.equal(card.permalink, `${SITE}${card.url}`, `${path}: the two spellings agree`);
      assert.ok(
        cardExists(subpathCanonifyDir, card.url, BASE_PATH),
        `${path}: nothing at ${card.url}`,
      );
      checked += 1;
    }
  }
  assert.ok(checked >= 15, `the whole card set was resolved: ${checked}`);
});

test('the meta tags the post-processor never reaches carry the full URL', () => {
  // Named separately from the payload comparison above because this is where
  // the damage would be permanent: og:image and twitter:image are meta content
  // attributes, and Hugo rewrites attributes ending in href, src, srcset,
  // action and url only.
  const all = records(subpathCanonifyDir);
  let seen = 0;
  for (const [path, rec] of all) {
    if (rec.cards.length === 0) continue;
    const source = html(subpathCanonifyDir, rec.url, BASE_PATH);
    const values = [
      ...metaTags(source, 'property', 'og:image'),
      ...metaTags(source, 'name', 'twitter:image'),
    ];
    assert.ok(values.length > 0, `${path}: a carded page publishes image meta tags`);
    for (const value of values) {
      assert.ok(
        value.startsWith(`${SITE}${BASE_PATH}/`),
        `${path}: an image meta tag lost the base path: ${value}`,
      );
    }
    seen += values.length;
  }
  // A positive control: with no carded page in the build the loop above would
  // assert nothing at all.
  assert.ok(seen > 0, `image meta tags were read: ${seen}`);
});
