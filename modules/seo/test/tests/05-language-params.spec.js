// Per-language site params. head-meta.html resolves every entry of
// .AllTranslations through seo/resolve/robots.html, and inside a partial the
// global `site` is the RENDERING language, not the language of the page being
// resolved. The multilingual build sets a noindex robots baseline on the
// Russian LANGUAGE alone, so it is the only build in which a per-language
// read ($page.Site.Params) and a rendering-language one produce different
// bytes: with the global read the English page cannot see the Russian
// baseline and emits an hreflang alternate pointing at a noindexed URL --
// the exact thing the head-meta.html hreflang block promises never happens.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, multilingualDir} from './helpers.js';

const EN_PAGE = 'page/index.html';
const RU_PAGE = 'ru/page/index.html';

function robotsContents(rel) {
  return dom(rel, multilingualDir)
    .querySelectorAll('head meta')
    .filter((el) => el.getAttribute('name') === 'robots')
    .map((el) => el.getAttribute('content'));
}

function hreflangs(rel) {
  return dom(rel, multilingualDir)
    .querySelectorAll('head link')
    .filter((el) => el.getAttribute('rel') === 'alternate' && el.getAttribute('hreflang'))
    .map((el) => el.getAttribute('hreflang'));
}

test('the translated page itself carries its language robots baseline', () => {
  // Rendering the Russian page, the global site IS the Russian site, so this
  // holds with or without the per-language read; it pins the premise the
  // hreflang assertion below builds on.
  const robots = robotsContents(RU_PAGE);
  assert.equal(robots.length, 1);
  assert.match(robots[0], /\bnoindex\b/);
});

test('the default-language head emits no hreflang for the noindexed language', () => {
  // The discriminating assertion: only a resolver reading the TRANSLATION'S
  // OWN site params can see the Russian noindex baseline while rendering the
  // English page.
  const langs = hreflangs(EN_PAGE);
  assert.ok(
    !langs.includes('ru-RU'),
    `hreflang set ${JSON.stringify(langs)} points at the noindexed Russian URL`,
  );
  // The block itself must still emit: an implementation that suppressed
  // hreflang entirely would also "not point" at the Russian URL.
  assert.ok(langs.includes('en-US'), 'the self-referencing hreflang survives');
  assert.ok(langs.includes('x-default'), 'the x-default selection survives');
});

test('the default-language page is not itself noindexed', () => {
  // allow_index_nonprod escapes the non-production override, and only the
  // Russian language baseline sets noindex; a read that leaked the Russian
  // baseline INTO the English page would show up here.
  for (const content of robotsContents(EN_PAGE)) {
    assert.doesNotMatch(content, /noindex/);
  }
});
