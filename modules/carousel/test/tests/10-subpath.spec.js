// Filesystem assertions over the four overlay builds exported by the runner:
// the subpath pass (fixture/public/subpath and fixture-bare/public/subpath,
// each built from its own hugo.toml plus ../subpath.toml at
// https://example.org/docs/) and the canonifyURLs pass (the same two plus
// ../canonify.toml).
//
// Hugo resolves a value that ALREADY starts with "/" against the protocol and
// host only, DISCARDING the baseURL's path -- for relURL and relLangURL
// exactly as for absURL. Every other build in this suite sits at a domain
// root, where a correct leading-slash resolution and a broken one emit
// identical bytes, so these are the ONLY shapes that can tell them apart. A
// file in static/ publishes UNDER the baseURL path, so /site-slide-01.png
// must render as /docs/site-slide-01.png.
//
// The canonifyURLs pass covers the second half of the same contract. With
// canonifyURLs on, relURL stops emitting the baseURL path on purpose, because
// Hugo then rewrites every root-relative URL in HTML output into an absolute
// one afterwards and would otherwise double the path. That rewrite runs on
// HTML output formats ONLY, so a relURL-derived value silently loses the path
// in the Markdown twin -- which is why carousel/lib/site-url.html derives it
// from site.BaseURL instead.
//
// Both fixtures are built in each pass because the module has two emission
// branches: composed with modules/images (fixture/), where carousel forwards
// the RAW authored entry and images resolves it -- so the path must be
// applied exactly ONCE -- and standalone (fixture-bare/), where
// carousel/slides.html emits the resolved URL itself in its plain <img>
// fallback. Each fixture also publishes the Markdown twin, whose destinations
// are absolute.
/* global process */
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {test, expect} from '@playwright/test';

function read(dirVar, ...parts) {
  const publicDir = process.env[dirVar];
  expect(publicDir, `the runner must export ${dirVar}`).toBeTruthy();
  return readFileSync(join(publicDir, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

for (const [label, dirVar] of [
  ['composed build (fixture/public/subpath)', 'CAROUSEL_SUBPATH_PUBLIC'],
  ['standalone build (fixture-bare/public/subpath)', 'CAROUSEL_SUBPATH_BARE_PUBLIC'],
]) {
  test.describe(label, () => {
    test('every leading-slash items entry renders with the baseURL path', () => {
      const html = read(dirVar, 'site-path-items', 'index.html');
      expect(html).toContain('src="/docs/site-slide-01.png"');
      expect(html).toContain('src="/docs/site-slide-02.png"');
    });

    test('no emitted src drops or doubles the baseURL path', () => {
      const html = read(dirVar, 'site-path-items', 'index.html');
      // The pre-fix spelling: relURL applied to the leading-slash value
      // verbatim, which would 404 on a subpath deployment.
      expect(html).not.toContain('src="/site-slide-01.png"');
      expect(html).not.toContain('src="/site-slide-02.png"');
      // Normalizing an already-normalized URL a second time would double it.
      expect(html).not.toContain('/docs/docs/');
    });

    test('the emitted URLs resolve to published files', () => {
      const publicDir = process.env[dirVar];
      expect(publicDir, `the runner must export ${dirVar}`).toBeTruthy();
      // static/ files publish at the root of the destination directory; the
      // baseURL path is what the server maps onto that root, so the published
      // path is the emitted URL with the baseURL path removed.
      expect(existsSync(join(publicDir, 'site-slide-01.png'))).toBe(true);
      expect(existsSync(join(publicDir, 'site-slide-02.png'))).toBe(true);
    });

    test('the Markdown twin absolutizes onto the full baseURL exactly once', () => {
      const md = read(dirVar, 'site-path-items', 'index.md');
      expect(md).toContain('![](https://example.org/docs/site-slide-01.png)');
      expect(md).toContain('![](https://example.org/docs/site-slide-02.png)');
      // An absolutized path that lost /docs/ would point outside the site.
      expect(md).not.toContain('https://example.org/site-slide-01.png');
      expect(md).not.toContain('/docs/docs/');
    });
  });
}

for (const [label, dirVar] of [
  ['composed build with canonifyURLs (fixture/public/canonify)', 'CAROUSEL_CANONIFY_PUBLIC'],
  [
    'standalone build with canonifyURLs (fixture-bare/public/canonify)',
    'CAROUSEL_CANONIFY_BARE_PUBLIC',
  ],
]) {
  test.describe(label, () => {
    test('canonifyURLs is really on (control assertion)', () => {
      // canonifyURLs rewrites every root-relative URL in HTML output into an
      // absolute one after the templates have run; if this fails the overlay
      // did not take effect and nothing below is meaningful.
      const html = read(dirVar, 'site-path-items', 'index.html');
      expect(html).toContain('src="https://example.org/docs/site-slide-01.png"');
    });

    test('the Markdown twin keeps the baseURL path under canonifyURLs', () => {
      // The regression this guards: a relURL-derived URL arrives here with the
      // baseURL path already stripped, and absURL then points it outside the
      // site, because Hugo's absolutizing post-processor never runs on a
      // non-HTML output format.
      const md = read(dirVar, 'site-path-items', 'index.md');
      expect(md).toContain('![](https://example.org/docs/site-slide-01.png)');
      expect(md).toContain('![](https://example.org/docs/site-slide-02.png)');
      expect(md).not.toContain('https://example.org/site-slide-01.png');
    });

    test('no emitted URL carries the baseURL path twice', () => {
      // The other side of the same derivation: Hugo's post-processor CONSUMES
      // a leading baseURL path instead of doubling it, so deriving the path in
      // the template must not produce /docs/docs/ in either format.
      expect(read(dirVar, 'site-path-items', 'index.html')).not.toContain('/docs/docs/');
      expect(read(dirVar, 'site-path-items', 'index.md')).not.toContain('/docs/docs/');
    });
  });
}

test.describe('composed build control assertions', () => {
  test('a bundle-resource slide also carries the baseURL path', () => {
    // .RelPermalink carries the baseURL path by construction; if this fails
    // the overlay did not take effect and nothing above is meaningful.
    const html = read('CAROUSEL_SUBPATH_PUBLIC', 'gallery', 'index.html');
    expect(html).toContain('src="/docs/gallery/');
    expect(html).not.toContain('/docs/docs/');
  });
});
