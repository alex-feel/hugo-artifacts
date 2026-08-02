// Subpath deployment: every emitted share URL must carry the baseURL's path,
// exactly once.
//
// This spec reads STATIC builds off disk instead of driving the served
// fixture, because the served fixture sits at a domain root and a domain root
// cannot tell a correct implementation from a broken one. Hugo's absURL
// resolves a value that already starts with "/" against the protocol and host
// ONLY, discarding the baseURL's path, so `absURL "/img/share.png"` and
// `absURL "img/share.png"` emit byte-identical output under
// baseURL = "http://localhost:1414/" and diverge under
// "http://localhost:1414/docs/".
//
// Two builds are needed, and they catch opposite mistakes:
//
//   subpath.toml    baseURL = "http://localhost:1414/docs/" -- catches a
//                   consumer-authored site-root-relative value that LOST the
//                   baseURL path.
//   schemeless.toml baseURL = "/docs/" -- catches a Hugo-resolved value that
//                   GAINED the baseURL path a second time. Under subpath.toml
//                   every .Permalink carries "http://" and is waved through by
//                   the normalizer's scheme branch, which hides the mistake;
//                   here .Permalink is "/docs/blog/x/", so a permalink pushed
//                   through the site-root-relative normalizer comes back as
//                   "/docs/docs/blog/x/".
//
// The values under test are every consumer-authored surface that reaches the
// module's literal-URL fallback: social_share.url and social_share.image in
// page front matter, the images front matter, and the site-tier
// params.social_share.image. A value derived from .Permalink is asserted in
// both builds, to prove normalization neither skips it nor applies twice.
/* global process, URL, URLSearchParams */
import {test, expect} from '@playwright/test';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const SUBPATH_DIR =
  process.env.FIXTURE_PUBLIC_SUBPATH ??
  fileURLToPath(new URL('../fixture/public/subpath', import.meta.url));

const SCHEMELESS_DIR =
  process.env.FIXTURE_PUBLIC_SCHEMELESS ??
  fileURLToPath(new URL('../fixture/public/schemeless', import.meta.url));

// Must stay in sync with fixture/subpath.toml.
const BASE = 'http://localhost:1414/docs/';
const ORIGIN = 'http://localhost:1414/';

// Must stay in sync with fixture/schemeless.toml.
const SCHEMELESS_BASE = '/docs/';

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');

// Attribute values arrive HTML-escaped; only "&" appears in these hrefs, and
// only as the querify separator.
const unescapeAttr = (value) => value.replace(/&amp;/g, '&');

const shareBar = (html) => {
  const match = /<nav class="social-share[^>]*>/.exec(html);
  expect(match, 'the page must render a share bar').not.toBeNull();
  return match[0];
};

const attr = (tag, name) => {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tag);
  expect(match, `${name} must be present`).not.toBeNull();
  return unescapeAttr(match[1]);
};

const hrefFor = (html, network) => {
  const match = new RegExp(`<a[^>]*href="([^"]*)"[^>]*data-share-network="${network}"`).exec(html);
  expect(match, `a ${network} link must be rendered`).not.toBeNull();
  return unescapeAttr(match[1]);
};

// querify encodes spaces as "+", which url.html rewrites to "%20";
// URLSearchParams decodes both, so it reads the emitted form correctly.
const param = (href, name) => {
  const query = href.slice(href.indexOf('?') + 1);
  const value = new URLSearchParams(query).get(name);
  expect(value, `${name} must be present in ${href}`).not.toBeNull();
  return value;
};

const pages = (dir) => {
  const rels = readdirSync(dir, {recursive: true})
    .map((entry) => String(entry).split('\\').join('/'))
    .filter((rel) => rel.endsWith('index.html'));
  // readdirSync's `recursive` option needs Node >= 18.17. An older runtime
  // ignores the unknown option in silence and lists the top level only, which
  // in this build holds exactly one index.html -- the home page, which renders
  // no share bar. The whole-tree sweeps below would then scan nothing and pass
  // having proved nothing, so require the walk to have descended.
  expect(
    rels.filter((rel) => rel.includes('/')),
    `${dir} must be listed recursively (Node >= 18.17)`,
  ).not.toEqual([]);
  return rels;
};

// Every self-referential URL a page emits: the canonical share URL on the bar
// plus the url-bearing parameter of every intent href.
const shareUrlsIn = (html) => [
  ...[...html.matchAll(/data-share-url="([^"]*)"/g)].map((m) => unescapeAttr(m[1])),
  ...[...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*data-share-network=/g)].map((m) =>
    decodeURIComponent(unescapeAttr(m[1])),
  ),
];

test.describe('static subpath build', () => {
  test('a consumer-authored site-root-relative url keeps the baseURL path', () => {
    const html = read(SUBPATH_DIR, 'blog/post-subpath/index.html');
    const expected = `${BASE}custom/share-target/`;
    expect(attr(shareBar(html), 'data-share-url')).toBe(expected);
    expect(param(hrefFor(html, 'x'), 'url')).toBe(expected);
    expect(param(hrefFor(html, 'pinterest'), 'url')).toBe(expected);
  });

  test('a consumer-authored site-root-relative image keeps the baseURL path', () => {
    const html = read(SUBPATH_DIR, 'blog/post-subpath/index.html');
    const expected = `${BASE}img/explicit-share.png`;
    // All four share-image parameter names, one per image-aware target.
    expect(param(hrefFor(html, 'pinterest'), 'media')).toBe(expected);
    expect(param(hrefFor(html, 'vk'), 'image')).toBe(expected);
    expect(param(hrefFor(html, 'odnoklassniki'), 'imageUrl')).toBe(expected);
    expect(param(hrefFor(html, 'weibo'), 'pic')).toBe(expected);
  });

  test('the site-tier fallback image keeps the baseURL path', () => {
    // post-images-map falls through the map-shaped images entry to
    // params.social_share.image = "/img/site-fallback.png".
    const html = read(SUBPATH_DIR, 'blog/post-images-map/index.html');
    expect(param(hrefFor(html, 'pinterest'), 'media')).toBe(`${BASE}img/site-fallback.png`);
  });

  test('an images front matter path keeps the baseURL path', () => {
    // post-encoding carries images = ["/img/cover.png"].
    const html = read(SUBPATH_DIR, 'blog/post-encoding/index.html');
    expect(param(hrefFor(html, 'pinterest'), 'media')).toBe(`${BASE}img/cover.png`);
  });

  test('a .Permalink-derived url is not absolutized twice', () => {
    const html = read(SUBPATH_DIR, 'blog/post-plain/index.html');
    const expected = `${BASE}blog/post-plain/`;
    expect(attr(shareBar(html), 'data-share-url')).toBe(expected);
    expect(param(hrefFor(html, 'x'), 'url')).toBe(expected);
  });

  test('a whitespace-only url override yields to the page permalink', () => {
    // post-blank-url carries social_share.url = " ". It is truthy, so a
    // fallback taken BEFORE normalization would pick it over .Permalink and
    // then trim it away, emitting an empty share URL and dropping url= from
    // every intent href.
    const html = read(SUBPATH_DIR, 'blog/post-blank-url/index.html');
    const expected = `${BASE}blog/post-blank-url/`;
    expect(attr(shareBar(html), 'data-share-url')).toBe(expected);
    expect(param(hrefFor(html, 'x'), 'url')).toBe(expected);
  });

  test('no emitted share URL anywhere in the build escapes the baseURL path', () => {
    const escaped = [];
    let scanned = 0;
    for (const rel of pages(SUBPATH_DIR)) {
      for (const value of shareUrlsIn(read(SUBPATH_DIR, rel))) {
        scanned += 1;
        // Every self-referential URL in this build must sit under /docs/. A
        // share URL that lost the baseURL path points at the origin root
        // instead, so each occurrence of the origin must be followed by the
        // path segment.
        for (let at = value.indexOf(ORIGIN); at !== -1; at = value.indexOf(ORIGIN, at + 1)) {
          if (!value.startsWith(BASE, at)) {
            escaped.push(`${rel}: ${value}`);
          }
        }
      }
    }
    expect(scanned, 'the sweep must have inspected share URLs').toBeGreaterThan(0);
    expect(escaped, 'share URLs that dropped the baseURL path').toEqual([]);
  });
});

test.describe('static schemeless-baseURL build', () => {
  test('a .Permalink-derived url carries the baseURL path exactly once', () => {
    // .Permalink is already "/docs/blog/post-plain/" here. Pushing it through
    // the site-root-relative normalizer would re-prefix it to
    // "/docs/docs/blog/post-plain/" -- the default share URL of every page in
    // the site, corrupted.
    const html = read(SCHEMELESS_DIR, 'blog/post-plain/index.html');
    const expected = `${SCHEMELESS_BASE}blog/post-plain/`;
    expect(attr(shareBar(html), 'data-share-url')).toBe(expected);
    expect(param(hrefFor(html, 'x'), 'url')).toBe(expected);
  });

  test('a consumer-authored site-root-relative url still keeps the baseURL path', () => {
    // The other half of the same edit: skipping the permalink must not skip
    // the consumer value, which still needs the baseURL path added once.
    const html = read(SCHEMELESS_DIR, 'blog/post-subpath/index.html');
    const expected = `${SCHEMELESS_BASE}custom/share-target/`;
    expect(attr(shareBar(html), 'data-share-url')).toBe(expected);
    expect(param(hrefFor(html, 'x'), 'url')).toBe(expected);
  });

  test('every page emits its default share URL prefixed exactly once', () => {
    const doubled = [];
    let scanned = 0;
    for (const rel of pages(SCHEMELESS_DIR)) {
      for (const value of shareUrlsIn(read(SCHEMELESS_DIR, rel))) {
        scanned += 1;
        // "/docs/docs/" anywhere is the baseURL path applied a second time.
        if (value.includes(`${SCHEMELESS_BASE}docs/`)) {
          doubled.push(`${rel}: ${value}`);
        }
      }
    }
    expect(scanned, 'the sweep must have inspected share URLs').toBeGreaterThan(0);
    expect(doubled, 'share URLs that repeated the baseURL path').toEqual([]);
  });
});
