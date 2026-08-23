// The `subpath` environment rebuilt with canonifyURLs on.
//
// With that setting Hugo rewrites root-relative URLs in HTML output into
// fully absolute ones after the templates have run, and to stop the rewrite
// from doubling the baseURL path it makes the whole relURL family emit the
// path no longer. Measured at v0.164.0 under a baseURL of
// https://seo-fixture.example/docs/: relURL "sentinel/" returns "/sentinel/"
// rather than "/docs/sentinel/", and a page's .RelPermalink returns "/"
// rather than "/docs/". absURL and .Permalink are unaffected.
//
// This module is built entirely on the unaffected two, so the two builds must
// publish the same head, byte for byte. That is the property these assertions
// LOCK; they are not looking for a defect. What they would catch is a
// derivation that began routing a value through the relURL family before
// absolutizing it -- correct at every other baseURL and with the setting off,
// and wrong here. The damage would be invisible wherever the URL rides an
// href, because the post-processor repairs those, and permanent wherever it
// does not: og:url, og:image and twitter:image are meta content attributes,
// and the JSON-LD nodes sit inside a script body. Measured at v0.164.0, the
// post-processor rewrites attributes ending in href, src, srcset, action and
// url, and touches neither a content attribute nor a script body.
//
// Nothing this module publishes differs between the builds, which is exactly
// why the fixture publishes a probe of its own: without it, an assertion that
// the setting is in force would have nothing to read, and a Hugo release that
// stopped honoring --config here would leave every assertion below passing
// against two identical ordinary builds.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, rawHtml, subpathCanonifyDir, subpathDir, PAGES} from './helpers.js';

const BASE = 'https://seo-fixture.example';

function probe(dir) {
  const el = dom(PAGES.home, dir).querySelector('.canonify-probe');
  assert.ok(el, 'the fixture renders the canonifyURLs probe on the home page');
  return {
    raw: el.getAttribute('data-canonify-raw'),
    href: el.getAttribute('data-canonify-href'),
    abs: el.getAttribute('data-canonify-abs'),
  };
}

test('canonifyURLs is really on in this build, and off in its twin', () => {
  // The control the whole file rests on, asserted from both sides so that
  // "the overlay took effect" cannot be confused with "the two builds happen
  // to agree". Both spellings carry the same template expression; only the
  // attribute NAME differs, and that is what decides whether Hugo's
  // post-processor touches the value.
  const off = probe(subpathDir);
  assert.equal(off.raw, '/docs/sentinel/', 'without the setting, relURL carries the baseURL path');
  assert.equal(off.href, '/docs/sentinel/', 'and there is nothing for the post-processor to do');

  const on = probe(subpathCanonifyDir);
  assert.equal(on.raw, '/sentinel/', 'with the setting on, relURL drops the baseURL path');
  assert.equal(
    on.href,
    `${BASE}/docs/sentinel/`,
    'and the post-processor puts the whole baseURL back, which is why relURL is safe in HTML',
  );

  // absURL is the family this module actually uses, and it moves for neither.
  assert.equal(off.abs, `${BASE}/docs/sentinel/`);
  assert.equal(on.abs, `${BASE}/docs/sentinel/`);
});

test('the head this module emits is identical with the setting on and off', () => {
  // The strongest form of the contract, and the one that needs no list of
  // tags kept in step with the module: every tag it emits lives in the head,
  // so comparing the whole head covers the ones this file names below and the
  // ones a later version adds.
  let compared = 0;
  for (const [name, rel] of Object.entries(PAGES)) {
    const off = dom(rel, subpathDir).querySelector('head');
    const on = dom(rel, subpathCanonifyDir).querySelector('head');
    assert.ok(off && on, `${name} has a head in both builds`);
    assert.equal(on.innerHTML, off.innerHTML, `${name}: the head must not depend on canonifyURLs`);
    compared += 1;
  }
  // A positive control: an empty PAGES map would make the loop above pass
  // without comparing anything.
  assert.ok(compared > 10, `expected the full page set, compared ${compared}`);
});

test('no URL loses the baseURL path under canonifyURLs', () => {
  // The same sweep the subpath spec runs, repeated here because the tags that
  // would break are the ones no post-processor repairs. Every absolute URL on
  // this site must sit under /docs/.
  let checked = 0;
  for (const [name, rel] of Object.entries(PAGES)) {
    const html = rawHtml(rel, subpathCanonifyDir);
    const bad = [...html.matchAll(/https:\/\/seo-fixture\.example(?!\/docs\/)[^\s"'<]*/g)].map(
      (m) => m[0],
    );
    assert.deepEqual(bad, [], `${name}: no emitted URL may drop the /docs/ path component`);
    assert.equal(html.includes('/docs/docs/'), false, `${name}: no URL carries the path twice`);
    checked += 1;
  }
  assert.ok(checked > 10, `expected the full page set, checked ${checked}`);
});

test('the tags the post-processor never reaches carry the full absolute URL', () => {
  // Named explicitly as well as covered by the head comparison above, because
  // these are the ones where a regression would be permanent rather than
  // repaired, and a reader of a failure should see which kind of surface
  // moved. og:url and the two image tags are meta CONTENT attributes; the
  // JSON-LD identifiers sit in a script body.
  const page = dom(PAGES.page, subpathCanonifyDir);

  const meta = (property) =>
    page.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ??
    page.querySelector(`meta[name="${property}"]`)?.getAttribute('content');

  const ogUrl = meta('og:url');
  assert.ok(ogUrl?.startsWith(`${BASE}/docs/`), `og:url must carry the baseURL path, got ${ogUrl}`);

  for (const tag of ['og:image', 'twitter:image']) {
    const value = meta(tag);
    assert.ok(value, `${tag} is present on the fixture page`);
    assert.ok(
      value.startsWith(`${BASE}/docs/`),
      `${tag} must carry the baseURL path, got ${value}`,
    );
  }

  const scripts = page.querySelectorAll('script[type="application/ld+json"]').map((s) => s.rawText);
  assert.ok(scripts.length > 0, 'the page carries JSON-LD');
  for (const raw of scripts) {
    const ids = [...raw.matchAll(/"@id":"([^"]+)"/g)].map((m) => m[1].replace(/\\\//g, '/'));
    assert.ok(ids.length > 0, 'the JSON-LD declares node identifiers');
    for (const id of ids) {
      assert.ok(id.startsWith(`${BASE}/docs/`), `a JSON-LD @id dropped the baseURL path: ${id}`);
    }
  }
});
