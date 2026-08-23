// The optional .base parameter of seo/resolve/id.html.
//
// That partial documents .base as optional for the page-scoped kinds and says
// an omitted value means .Permalink. Inside this module the arm is redundant:
// of the eight call sites, the five that omit .base all ask for kinds that
// never read it (website, organization, person), and the three that ask for a
// kind that does read it all pass seo/context.html's $pageUrl, which that
// template has already run through the identical default. So no module
// template can reach the documented fallback, and substituting a marker into
// it changes not one published byte anywhere in the suite.
//
// The partial sits in the override tier, though, where a consumer template
// calls it directly -- which is precisely the caller the docstring is written
// for. The fixture publishes both spellings from one page so the documented
// contract is held to its word by a build rather than by the comment that
// states it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dom, nodesOfType, subpathDir, publicDir} from './helpers.js';

const PAGE = 'blog/breadcrumb-trails/index.html';

function probe(dir = publicDir) {
  const el = dom(PAGE, dir).querySelector('.id-probe');
  assert.ok(el, 'the fixture renders the id probe on its one opted-in page');
  return {
    noBase: el.getAttribute('data-id-nobase'),
    withBase: el.getAttribute('data-id-withbase'),
    permalink: el.getAttribute('data-page-permalink'),
  };
}

test('omitting .base falls back to the page permalink, as documented', () => {
  const {noBase, permalink} = probe();
  // Compared against the page's OWN permalink as the build reports it, rather
  // than against a URL restated here: a literal would keep passing if the
  // fallback silently started answering with something else that happened to
  // match the fixture's shape.
  assert.equal(noBase, `${permalink}#webpage`);
});

test('a supplied .base wins, which is what makes the fallback a real branch', () => {
  const {noBase, withBase} = probe();
  assert.equal(withBase, 'https://served.example/elsewhere/#webpage');
  assert.notEqual(
    withBase,
    noBase,
    'the two spellings must differ, or neither assertion above has a subject',
  );
});

test('the fallback answers with the same string the module publishes for this page', () => {
  // Ties the probe to real output: on an unpaginated page the served URL IS
  // the permalink, so the WebPage node this page publishes must carry exactly
  // what the fallback produced.
  const {noBase} = probe();
  const webpage = nodesOfType(PAGE, 'WebPage')[0];
  assert.ok(webpage, 'the page emits a WebPage node');
  assert.equal(webpage['@id'], noBase);
});

test('the fallback carries the baseURL path when the deploy has one', () => {
  const {noBase, permalink} = probe(subpathDir);
  assert.ok(permalink.includes('/docs/'), 'the subpath build really carries a path');
  assert.equal(noBase, `${permalink}#webpage`);
});
