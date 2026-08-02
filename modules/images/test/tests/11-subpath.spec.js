/* global process */
// Static-path resolution under a baseURL that carries a PATH, asserted
// against the two overlay builds the runner exports: IMAGES_SUBPATH_PUBLIC
// (hugo.toml plus ../subpath.toml at https://example.org/docs/) and
// IMAGES_CANONIFY_PUBLIC (the same plus ../canonify.toml).
//
// Hugo resolves a value that ALREADY starts with "/" against the protocol and
// host only, DISCARDING the baseURL's path -- for relURL and relLangURL
// exactly as for absURL. Every other build in this suite sits at a domain
// root, where a correct resolution and a broken one emit identical bytes, so
// these are the ONLY builds that can tell them apart. A file in static/
// publishes UNDER the baseURL path, so the emitted URL must carry /docs/ --
// in the HTML render hook, in the shortcode, and in the Markdown twin.
//
// The canonifyURLs build covers the second half of the same contract. With
// canonifyURLs on, relURL stops emitting the baseURL path on purpose, because
// Hugo then rewrites every root-relative URL in HTML output into an absolute
// one afterwards and would otherwise double the path. That rewrite runs on
// HTML output formats ONLY, so a relURL-derived value silently loses the path
// in the Markdown twin -- which is why the module derives it from
// site.BaseURL instead. Both builds must therefore emit the path exactly
// once, in every format.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from 'node-html-parser';

const subpathDir = process.env.IMAGES_SUBPATH_PUBLIC;
const canonifyDir = process.env.IMAGES_CANONIFY_PUBLIC;

function read(rel) {
  assert.ok(subpathDir, 'the runner must export IMAGES_SUBPATH_PUBLIC');
  return readFileSync(join(subpathDir, rel), 'utf8').replace(/\r\n/g, '\n');
}

function readCanonify(rel) {
  assert.ok(canonifyDir, 'the runner must export IMAGES_CANONIFY_PUBLIC');
  return readFileSync(join(canonifyDir, rel), 'utf8').replace(/\r\n/g, '\n');
}

test('the build really is under the subpath (control assertion)', () => {
  const img = parse(read('bundle/index.html')).querySelector('#sc-svg');
  assert.ok(img, 'expected the SVG passthrough image');
  // .RelPermalink carries the baseURL path by construction; if this fails the
  // overlay did not take effect and every assertion below is meaningless.
  assert.match(img.getAttribute('src'), /^\/docs\//);
});

test('a /static path rendered by the Markdown hook carries the baseURL path', () => {
  const page = parse(read('bundle/index.html'));
  const img = page.querySelectorAll('img').find((i) => i.getAttribute('alt') === 'Static icon');
  assert.ok(img, 'expected the static-icon hook image');
  assert.equal(img.getAttribute('src'), '/docs/static-icon.png');
  assert.equal(img.getAttribute('data-kind'), 'static');
});

test('no emitted src drops the baseURL path', () => {
  // The pre-fix spelling: relURL applied to the leading-slash value verbatim.
  assert.equal(
    read('bundle/index.html').includes('src="/static-icon.png"'),
    false,
    'a static path emitted without /docs/ would 404 on a subpath deployment',
  );
});

test('the /static path the shortcode renders carries the baseURL path', () => {
  const page = parse(read('markdown-variants/index.html'));
  const img = page
    .querySelectorAll('img')
    .find((i) => i.getAttribute('alt') === 'A static markdown icon');
  assert.ok(img, 'expected the static markdown-icon shortcode image');
  assert.equal(img.getAttribute('src'), '/docs/static-icon.png');
});

test('the emitted static URL resolves to a published file', () => {
  // static/ files publish at the root of the destination directory; the
  // baseURL path is what the server maps onto that root, so the published
  // path is the emitted URL with the baseURL path removed.
  assert.ok(subpathDir, 'the runner must export IMAGES_SUBPATH_PUBLIC');
  assert.ok(existsSync(join(subpathDir, 'static-icon.png')), 'static-icon.png is published');
});

test('canonifyURLs is really on (control assertion)', () => {
  // canonifyURLs rewrites every root-relative URL in HTML output into an
  // absolute one after the templates have run; if this fails the overlay did
  // not take effect and the canonifyURLs assertions below are meaningless.
  const img = parse(readCanonify('bundle/index.html')).querySelector('#sc-svg');
  assert.ok(img, 'expected the SVG passthrough image');
  assert.match(img.getAttribute('src'), /^https:\/\/example\.org\/docs\//);
});

test('the Markdown twin keeps the baseURL path under canonifyURLs', () => {
  // The regression this guards: canonifyURLs makes relURL stop emitting the
  // baseURL path (Hugo's post-processor re-adds the whole baseURL to HTML
  // afterwards and would otherwise double it), and that post-processor never
  // runs on a non-HTML output format. A relURL-derived static URL therefore
  // arrives here stripped, and absURL turns it into a URL OUTSIDE the site.
  const md = readCanonify('markdown-variants/index.md');
  assert.ok(
    md.includes('![A static markdown icon](https://example.org/docs/static-icon.png)'),
    'the twin emits the absolute URL including the baseURL path',
  );
  assert.equal(
    md.includes('https://example.org/static-icon.png'),
    false,
    'a static path that lost /docs/ under canonifyURLs would point outside the site',
  );
  assert.equal(md.includes('/docs/docs/'), false, 'no URL carries the baseURL path twice');
});

test('canonifyURLs HTML carries the baseURL path exactly once', () => {
  // The other side of the same derivation: Hugo's post-processor CONSUMES a
  // leading baseURL path instead of doubling it, so deriving the path in the
  // template must not produce /docs/docs/ here.
  const page = parse(readCanonify('bundle/index.html'));
  const img = page.querySelectorAll('img').find((i) => i.getAttribute('alt') === 'Static icon');
  assert.ok(img, 'expected the static-icon hook image');
  assert.equal(img.getAttribute('src'), 'https://example.org/docs/static-icon.png');
  assert.equal(
    readCanonify('bundle/index.html').includes('/docs/docs/'),
    false,
    'no URL carries the baseURL path twice',
  );
});

test('the Markdown twin absolutizes the static path onto the full baseURL', () => {
  const md = read('markdown-variants/index.md');
  assert.ok(
    md.includes('![A static markdown icon](https://example.org/docs/static-icon.png)'),
    'the twin emits the absolute URL including the baseURL path',
  );
  assert.equal(
    md.includes('https://example.org/static-icon.png'),
    false,
    'an absolutized static path that lost /docs/ would point outside the site',
  );
  // The page-resource twin URL is the control: .Permalink already carries the
  // path, so a doubled path here would mean the twin absolutized twice.
  assert.ok(
    md.includes('![A page-resource markdown scene](https://example.org/docs/markdown-variants/'),
    'page-resource permalinks carry the baseURL path exactly once',
  );
  assert.equal(md.includes('/docs/docs/'), false, 'no URL carries the baseURL path twice');
});
